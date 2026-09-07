import { esc } from './telegram.js';

// Construye el encabezado comun: quien escribio y a que numero de negocio
export function header(contact, metadata) {
  const name = contact?.profile?.name;
  const from = contact?.wa_id;
  const who = name ? `${esc(name)} (<code>${esc(from)}</code>)` : `<code>${esc(from || 'desconocido')}</code>`;
  const to = metadata?.display_phone_number ? ` → ${esc(metadata.display_phone_number)}` : '';
  return `📩 <b>WhatsApp</b> de ${who}${to}`;
}

// Devuelve el texto plano de un mensaje segun su tipo, o null si es media
export function describe(msg) {
  switch (msg.type) {
    case 'text':
      return esc(msg.text?.body ?? '');
    case 'button':
      return `🔘 Boton: <b>${esc(msg.button?.text ?? '')}</b>`;
    case 'interactive': {
      const i = msg.interactive || {};
      const picked = i.button_reply?.title || i.list_reply?.title || '';
      const id = i.button_reply?.id || i.list_reply?.id || '';
      return `🔘 Respuesta: <b>${esc(picked)}</b>${id ? ` (<code>${esc(id)}</code>)` : ''}`;
    }
    case 'location': {
      const l = msg.location || {};
      const label = [l.name, l.address].filter(Boolean).map(esc).join(' — ');
      const link = `https://maps.google.com/?q=${l.latitude},${l.longitude}`;
      return `📍 Ubicacion${label ? `: ${label}` : ''}\n<a href="${link}">${l.latitude}, ${l.longitude}</a>`;
    }
    case 'contacts': {
      const names = (msg.contacts || []).map((c) => esc(c.name?.formatted_name || '')).join(', ');
      return `👤 Contacto compartido: ${names}`;
    }
    case 'reaction':
      return `${esc(msg.reaction?.emoji || '')} reacciono al mensaje <code>${esc(msg.reaction?.message_id || '')}</code>`;
    case 'unsupported':
      return '⚠️ Mensaje de tipo no soportado por la API';
    default:
      return null;
  }
}

// Mapea el tipo de WhatsApp al metodo de envio de Telegram
export const MEDIA_KIND = {
  image: 'photo',
  sticker: 'photo',
  audio: 'voice',
  video: 'video',
  document: 'document',
};

// Traduce un cambio de estado (sent/delivered/read/failed) a una linea legible
export function describeStatus(status) {
  const icon = { sent: '✅', delivered: '📬', read: '👀', failed: '❌' }[status.status] || 'ℹ️';
  const err = (status.errors || []).map((e) => e.title || e.message).filter(Boolean).join('; ');
  return `${icon} Estado <b>${esc(status.status)}</b> del mensaje <code>${esc(status.id)}</code> hacia <code>${esc(status.recipient_id)}</code>${err ? `\n${esc(err)}` : ''}`;
}
