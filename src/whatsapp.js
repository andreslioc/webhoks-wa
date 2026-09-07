const GRAPH = 'https://graph.facebook.com/v21.0';

// Descarga un archivo de WhatsApp: primero resuelve la URL temporal, luego baja los bytes.
// Ambas llamadas requieren el access token de la app de Meta.
export async function downloadMedia(mediaId) {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new Error('Falta WHATSAPP_TOKEN para descargar media');

  const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) throw new Error(`No se pudo resolver media ${mediaId}: ${metaRes.status}`);
  const meta = await metaRes.json();

  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!fileRes.ok) throw new Error(`No se pudo descargar media ${mediaId}: ${fileRes.status}`);
  const buffer = Buffer.from(await fileRes.arrayBuffer());

  return { buffer, mime: meta.mime_type, size: meta.file_size, sha256: meta.sha256 };
}

const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/amr': 'amr',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'application/pdf': 'pdf',
};

export function guessFilename(mime, fallback = 'archivo') {
  const ext = EXT[(mime || '').split(';')[0]] || 'bin';
  return `${fallback}.${ext}`;
}
