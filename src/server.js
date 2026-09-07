import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import { sendMessage, uploadMedia, esc } from './telegram.js';
import { downloadMedia, guessFilename } from './whatsapp.js';
import { header, describe, describeStatus, MEDIA_KIND } from './formatter.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Guardamos el cuerpo crudo para poder validar la firma de Meta
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

function firmaValida(req) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // sin app secret configurado no se valida
  const recibida = req.get('x-hub-signature-256') || '';
  const esperada = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.get('/health', (_req, res) => res.json({ ok: true }));

// 1) Verificacion del webhook: Meta llama con GET al guardar la URL en el panel
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('Webhook verificado por Meta');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 2) Recepcion de eventos
app.post('/webhook', async (req, res) => {
  if (!firmaValida(req)) {
    console.warn('Firma invalida, evento descartado');
    return res.sendStatus(401);
  }

  // Respondemos ya: Meta reintenta si tardamos, el reenvio va en segundo plano
  res.sendStatus(200);

  try {
    await procesar(req.body);
  } catch (err) {
    console.error('Error procesando el evento:', err.message);
  }
});

async function procesar(body) {
  if (body.object !== 'whatsapp_business_account') return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const { metadata, contacts = [], messages = [], statuses = [] } = value;

      // Los acuses de recibo son ruidosos: solo se reenvian si se activan por entorno
      if (process.env.FORWARD_STATUSES === 'true') {
        for (const status of statuses) {
          await sendMessage(describeStatus(status));
        }
      }

      for (const msg of messages) {
        const contact = contacts.find((c) => c.wa_id === msg.from) || { wa_id: msg.from };
        await reenviar(msg, contact, metadata);
      }
    }
  }
}

async function reenviar(msg, contact, metadata) {
  const cabecera = header(contact, metadata);
  const kind = MEDIA_KIND[msg.type];

  if (kind) {
    const media = msg[msg.type] || {};
    const pie = [cabecera, media.caption ? esc(media.caption) : null].filter(Boolean).join('\n');
    try {
      const { buffer, mime } = await downloadMedia(media.id);
      const nombre = media.filename || guessFilename(mime, msg.type);
      await uploadMedia(kind, buffer, nombre, mime, pie);
    } catch (err) {
      // Si no hay WHATSAPP_TOKEN o falla la descarga, al menos avisamos del mensaje
      await sendMessage(`${cabecera}\n📎 ${esc(msg.type)} recibido pero no se pudo reenviar: ${esc(err.message)}`);
    }
    return;
  }

  const cuerpo = describe(msg);
  if (cuerpo === null) {
    await sendMessage(`${cabecera}\n⚠️ Tipo <code>${esc(msg.type)}</code> sin formato definido`);
    return;
  }
  await sendMessage(`${cabecera}\n\n${cuerpo}`);
}

app.listen(PORT, () => console.log(`Webhook escuchando en http://localhost:${PORT}/webhook`));
