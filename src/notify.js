import express from 'express';
import { sendMessage, esc } from './telegram.js';

export const notify = express.Router();

// Alias comunes: la plataforma que llame al webhook puede nombrar los campos como quiera
const CAMPOS = [
  { etiqueta: 'Nombre',   claves: ['nombre', 'name', 'cliente', 'contacto', 'full_name', 'nombre_completo'] },
  { etiqueta: 'Telefono', claves: ['telefono', 'phone', 'celular', 'whatsapp', 'numero', 'movil', 'tel'] },
  { etiqueta: 'Email',    claves: ['email', 'correo', 'mail', 'e_mail'] },
  { etiqueta: 'Motivo',   claves: ['motivo', 'asunto', 'reason', 'subject', 'tema', 'servicio'] },
  { etiqueta: 'Mensaje',  claves: ['ultimo_mensaje', 'last_customer_message', 'mensaje', 'message', 'texto',
                                 'text', 'comentario', 'consulta', 'nota', 'inbound_text', 'last_message',
                                 'trigger_text'] },
  { etiqueta: 'Origen',   claves: ['origen', 'source', 'canal', 'channel', 'campana', 'campaign',
                                 'platform', 'plataforma'] },
];

// Enlace directo al chat, si la plataforma ya lo manda armado
const CLAVES_URL = [
  'link', 'url', 'enlace', 'chat_url', 'url_chat', 'conversation_url', 'conversacion_url',
  'permalink', 'deeplink', 'deep_link',
];

// Id de la conversacion, para armar el enlace con CHAT_URL_TEMPLATE
const CLAVES_ID = [
  'conversation_id', 'conversacion_id', 'id_conversacion', 'conversation', 'conversacion',
  'chat_id', 'id_chat', 'ticket', 'ticket_id', 'session_id', 'sesion_id', 'thread_id',
];

// Padres que hacen que un simple "id" cuente como id de conversacion,
// p.ej. {"conversacion": {"id": 999}} -> clave aplanada "conversacion.id"
const PADRES_ID = ['conversation', 'conversacion', 'chat', 'ticket', 'session', 'sesion', 'thread'];

// Pasa cualquier estilo de nombre a snake_case: Zernio manda camelCase
// (conversationId), otras plataformas mandan espacios o guiones.
// Plumbing interno de la plataforma: no le dice nada al asesor
const CLAVES_RUIDO = [
  'event', 'event_type', 'tipo_evento',
  'workflow_id', 'workflow', 'execution_id', 'execution', 'flow_id', 'node_id',
  'request_id', 'trace_id', 'webhook_id', 'account_id', 'tenant_id',
  'titulo', 'title', 'inbound_text', 'last_message', 'trigger_text', 'ultimo_mensaje',
];

const norm = (k) => String(k)
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .toLowerCase()
  .replace(/[\s-]+/g, '_');
const hoja = (k) => norm(k.split('.').pop());

function esClaveId(clave) {
  const partes = clave.split('.').map(norm);
  const ultima = partes[partes.length - 1];
  if (CLAVES_ID.includes(ultima)) return true;
  const padre = partes[partes.length - 2];
  return ultima === 'id' && padre !== undefined && PADRES_ID.includes(padre);
}

function jsonCorto(valor) {
  try {
    return JSON.stringify(valor);
  } catch {
    return String(valor);
  }
}

function aplanar(obj, prefijo = '', salida = {}, nivel = 0) {
  for (const [k, v] of Object.entries(obj || {})) {
    const clave = prefijo ? `${prefijo}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && nivel < 2) {
      aplanar(v, clave, salida, nivel + 1);
    } else if (v !== null && v !== undefined && v !== '') {
      // Los objetos mas profundos que el limite se serializan: String(v) daria
      // "[object Object]" y se perderia justo lo que se quiere ver en el aviso.
      if (Array.isArray(v)) {
        salida[clave] = v.map((x) => (x && typeof x === 'object' ? jsonCorto(x) : String(x))).join(', ');
      } else if (typeof v === 'object') {
        salida[clave] = jsonCorto(v);
      } else {
        salida[clave] = String(v);
      }
    }
  }
  return salida;
}

// Telegram solo acepta http/https (y tg://) en los botones de enlace
function urlValida(valor) {
  try {
    const u = new URL(String(valor));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Devuelve { url, clave } con el enlace para contestar, o null si no se puede armar.
// Primero busca una URL ya lista en el payload; si no hay, la arma con la plantilla y el id.
export function enlaceChat(plano) {
  for (const k of Object.keys(plano)) {
    if (CLAVES_URL.includes(hoja(k)) && urlValida(plano[k])) {
      return { url: plano[k], clave: k };
    }
  }

  const plantilla = process.env.CHAT_URL_TEMPLATE;
  if (plantilla && plantilla.includes('{id}')) {
    for (const k of Object.keys(plano)) {
      if (esClaveId(k)) {
        const url = plantilla.replace('{id}', encodeURIComponent(plano[k]));
        if (urlValida(url)) return { url, clave: k };
      }
    }
  }

  return null;
}

// Arma el aviso: primero los campos reconocidos, luego el resto de lo que venga.
// Devuelve { html, boton } — boton es el reply_markup para contestar en la plataforma.
export function construirAviso(datos, titulo) {
  const plano = aplanar(datos);
  const usadas = new Set();
  const lineas = [];

  const publicados = new Set();

  for (const { etiqueta, claves } of CAMPOS) {
    const encontrada = claves
      .map((clave) => Object.keys(plano).find((k) => hoja(k) === clave))
      .find(Boolean);
    if (encontrada) {
      usadas.add(encontrada);
      publicados.add(plano[encontrada]);
      lineas.push(`<b>${etiqueta}:</b> ${esc(plano[encontrada])}`);
    }
  }

  // El enlace va en el boton, no repetido como texto crudo
  const enlace = enlaceChat(plano);
  if (enlace) {
    usadas.add(enlace.clave);
    // El mismo id suele venir repetido (raiz y anidado): se publica una sola vez
    const valor = plano[enlace.clave];
    for (const k of Object.keys(plano)) {
      if (plano[k] === valor && esClaveId(k)) usadas.add(k);
    }
  }

  // El volcado de campos desconocidos evita perder datos con plataformas nuevas,
  // pero con Zernio es casi todo plumbing y repeticion. Se filtra, y con
  // NOTIFY_EXTRAS=false se apaga del todo.
  const extras = process.env.NOTIFY_EXTRAS === 'false' ? [] : Object.keys(plano).filter(
    (k) => !usadas.has(k)
        && !CLAVES_RUIDO.includes(hoja(k))
        && !publicados.has(plano[k]), // ya salio arriba con su etiqueta
  );
  if (extras.length) {
    if (lineas.length) lineas.push('');
    for (const k of extras.slice(0, 25)) {
      lineas.push(`<b>${esc(k)}:</b> ${esc(plano[k].slice(0, 300))}`);
    }
  }

  const encabezado = `🔔 <b>${esc(titulo || process.env.NOTIFY_TITLE || 'Aviso para asesor')}</b>`;
  const cuerpo = lineas.length ? lineas.join('\n') : '<i>(sin datos en el cuerpo de la peticion)</i>';
  // NOTIFY_TZ y no TZ: Vercel reserva TZ y rechaza definirla como variable de entorno
  const zona = process.env.NOTIFY_TZ || process.env.TZ || 'America/Mexico_City';
  const hora = new Date().toLocaleString('es-MX', { timeZone: zona });
  const html = `${encabezado}\n\n${cuerpo}\n\n🕒 <i>${esc(hora)}</i>`;

  const boton = enlace
    ? { inline_keyboard: [[{ text: process.env.CHAT_BUTTON_TEXT || '💬 Contestar', url: enlace.url }]] }
    : undefined;

  return { html, boton };
}

// Secreto opcional: por cabecera x-webhook-secret, Authorization: Bearer, o ?token=
function autorizado(req) {
  const secreto = process.env.NOTIFY_SECRET;
  if (!secreto) return true;
  const bearer = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const enviado = req.get('x-webhook-secret') || bearer || req.query.token || '';
  return enviado === secreto;
}

// Acepta POST (json o formulario) y GET (parametros en la URL), porque no todas
// las plataformas dejan elegir el metodo o el cuerpo de la peticion.
async function manejar(req, res) {
  if (!autorizado(req)) return res.status(401).json({ ok: false, error: 'secreto invalido' });

  const datos = req.method === 'GET' ? req.query : { ...req.query, ...(req.body || {}) };
  const { token, ...limpio } = datos; // el token de auth no se publica en el chat

  const { html, boton } = construirAviso(limpio, limpio.titulo || limpio.title);

  try {
    await sendMessage(html, boton ? { reply_markup: boton } : {});
    res.json({ ok: true, enviado: true, conBoton: Boolean(boton) });
  } catch (err) {
    // Si Telegram rechaza la URL del boton, el aviso importa mas que el enlace:
    // se reenvia sin boton y con el enlace como texto, para no perder el mensaje.
    if (boton && /BUTTON_URL_INVALID|button/i.test(err.message)) {
      const url = boton.inline_keyboard[0][0].url;
      try {
        await sendMessage(`${html}\n\n🔗 ${esc(url)}`);
        console.error('Boton rechazado por Telegram, enviado como texto:', err.message);
        return res.json({ ok: true, enviado: true, conBoton: false, aviso: 'boton invalido' });
      } catch (err2) {
        err = err2;
      }
    }
    console.error('No se pudo avisar por Telegram:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
}

notify.get('/notify', manejar);
notify.post('/notify', manejar);
