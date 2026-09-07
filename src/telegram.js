const API = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';

function config() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error('Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en el entorno');
  }
  return { token, chatId, threadId: process.env.TELEGRAM_THREAD_ID || undefined };
}

async function call(method, body) {
  const { token } = config();
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram ${method} fallo: ${data.error_code} ${data.description}`);
  }
  return data.result;
}

// Escapa el subconjunto de HTML que acepta Telegram (parse_mode: HTML)
export function esc(text = '') {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function sendMessage(html, options = {}) {
  const { chatId, threadId } = config();
  return call('sendMessage', {
    chat_id: chatId,
    message_thread_id: threadId,
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...options,
  });
}

// Envia un archivo por URL publica. kind: photo | document | audio | video
export async function sendMedia(kind, url, caption) {
  const { chatId, threadId } = config();
  const field = { photo: 'photo', document: 'document', audio: 'audio', video: 'video' }[kind] || 'document';
  const method = { photo: 'sendPhoto', document: 'sendDocument', audio: 'sendAudio', video: 'sendVideo' }[kind] || 'sendDocument';
  return call(method, {
    chat_id: chatId,
    message_thread_id: threadId,
    [field]: url,
    caption,
    parse_mode: 'HTML',
  });
}

// Sube un archivo desde memoria (multipart), para media que requiere autenticacion en origen
export async function uploadMedia(kind, buffer, filename, mime, caption) {
  const { token, chatId, threadId } = config();
  const field = { photo: 'photo', document: 'document', audio: 'audio', video: 'video', voice: 'voice' }[kind] || 'document';
  const method = { photo: 'sendPhoto', document: 'sendDocument', audio: 'sendAudio', video: 'sendVideo', voice: 'sendVoice' }[kind] || 'sendDocument';

  const form = new FormData();
  form.set('chat_id', chatId);
  if (threadId) form.set('message_thread_id', threadId);
  if (caption) {
    form.set('caption', caption.slice(0, 1024));
    form.set('parse_mode', 'HTML');
  }
  form.set(field, new Blob([buffer], { type: mime || 'application/octet-stream' }), filename);

  const res = await fetch(`${API}/bot${token}/${method}`, { method: 'POST', body: form });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram ${method} fallo: ${data.error_code} ${data.description}`);
  }
  return data.result;
}
