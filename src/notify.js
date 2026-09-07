import express from 'express';
import { sendMessage, esc } from './telegram.js';

export const notify = express.Router();

// Alias comunes: la plataforma que llame al webhook puede nombrar los campos como quiera
const CAMPOS = [
  { etiqueta: 'Nombre',   claves: ['nombre', 'name', 'cliente', 'contacto', 'full_name', 'nombre_completo'] },
  { etiqueta: 'Telefono', claves: ['telefono', 'phone', 'celular', 'whatsapp', 'numero', 'movil', 'tel'] },
  { etiqueta: 'Email',    claves: ['email', 'correo', 'mail', 'e_mail'] },
  { etiqueta: 'Motivo',   claves: ['motivo', 'asunto', 'reason', 'subject', 'tema', 'servicio'] },
  { etiqueta: 'Mensaje',  claves: ['mensaje', 'message', 'texto', 'text', 'comentario', 'consulta', 'nota'] },
  { etiqueta: 'Origen',   claves: ['origen', 'source', 'canal', 'channel', 'campana', 'campaign'] },
];

const norm = (k) => String(k).toLowerCase().replace(/[\s-]+/g, '_');

function aplanar(obj, prefijo = '', salida = {}, nivel = 0) {
  for (const [k, v] of Object.entries(obj || {})) {
    const clave = prefijo ? `${prefijo}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && nivel < 2) {
      aplanar(v, clave, salida, nivel + 1);
    } else if (v !== null && v !== undefined && v !== '') {
      salida[clave] = Array.isArray(v) ? v.join(', ') : String(v);
    }
  }
  return salida;
}

// Arma el aviso: primero los campos reconocidos, luego el resto de lo que venga
export function construirAviso(datos, titulo) {
  const plano = aplanar(datos);
  const usadas = new Set();
  const lineas = [];

  for (const { etiqueta, claves } of CAMPOS) {
    const encontrada = Object.keys(plano).find((k) => claves.includes(norm(k.split('.').pop())));
    if (encontrada) {
      usadas.add(encontrada);
      lineas.push(`<b>${etiqueta}:</b> ${esc(plano[encontrada])}`);
    }
  }

  const extras = Object.keys(plano).filter((k) => !usadas.has(k));
  if (extras.length) {
    if (lineas.length) lineas.push('');
    for (const k of extras.slice(0, 25)) {
      lineas.push(`<b>${esc(k)}:</b> ${esc(plano[k].slice(0, 300))}`);
    }
  }

  const encabezado = `🔔 <b>${esc(titulo || process.env.NOTIFY_TITLE || 'Aviso para asesor')}</b>`;
  const cuerpo = lineas.length ? lineas.join('\n') : '<i>(sin datos en el cuerpo de la peticion)</i>';
  const hora = new Date().toLocaleString('es-MX', { timeZone: process.env.TZ || 'America/Mexico_City' });

  return `${encabezado}\n\n${cuerpo}\n\n🕒 <i>${esc(hora)}</i>`;
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

  try {
    await sendMessage(construirAviso(limpio, limpio.titulo || limpio.title));
    res.json({ ok: true, enviado: true });
  } catch (err) {
    console.error('No se pudo avisar por Telegram:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
}

notify.get('/notify', manejar);
notify.post('/notify', manejar);
