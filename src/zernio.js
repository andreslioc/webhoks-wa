const DEFAULT_BASE_URL = 'https://zernio.com/api';
const DEFAULT_DEBOUNCE_MS = 15_000;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function primerTexto(...valores) {
  return valores.find((valor) => typeof valor === 'string' && valor.trim())?.trim();
}

export function leerContextoZernio(datos = {}) {
  const variables = datos.variables || datos.vars || {};
  const mensajeObjeto = datos.message && typeof datos.message === 'object' ? datos.message : {};
  const conversacion = datos.conversation && typeof datos.conversation === 'object' ? datos.conversation : {};
  const cuenta = datos.account && typeof datos.account === 'object' ? datos.account : {};

  return {
    conversationId: primerTexto(
      datos.conversationId,
      datos.conversation_id,
      mensajeObjeto.conversationId,
      conversacion.id,
      variables.conversationId,
      variables.conversation_id,
      variables.message?.conversationId,
      variables.conversation?.id,
    ),
    accountId: primerTexto(
      datos.accountId,
      datos.account_id,
      cuenta.accountId,
      cuenta.id,
      variables.accountId,
      variables.account_id,
      variables.account?.accountId,
      variables.account?.id,
    ),
    messageId: primerTexto(
      datos.messageId,
      datos.message_id,
      mensajeObjeto.platformMessageId,
      mensajeObjeto.id,
      variables.messageId,
      variables.message_id,
      variables.message?.platformMessageId,
      variables.message?.id,
    ),
  };
}

function debounceMs() {
  const configurado = Number(process.env.GEMINI_DEBOUNCE_MS);
  if (!Number.isFinite(configurado)) return DEFAULT_DEBOUNCE_MS;
  return Math.max(0, Math.min(configurado, 45_000));
}

function debounceMaxMs() {
  const configurado = Number(process.env.GEMINI_DEBOUNCE_MAX_MS);
  if (!Number.isFinite(configurado)) return 45_000;
  return Math.max(debounceMs(), Math.min(configurado, 60_000));
}

function normalizar(texto) {
  return String(texto || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

export async function agruparMensajesZernio(
  { mensaje, conversationId, accountId, messageId, recibidoEn = Date.now() },
  fetchImpl = fetch,
) {
  const apiKey = process.env.ZERNIO_API_KEY;
  if (!apiKey || !conversationId || !accountId) {
    return {
      mensaje,
      mensajesAgrupados: 1,
      agrupado: false,
      motivo: !apiKey ? 'falta ZERNIO_API_KEY' : 'faltan conversationId o accountId',
    };
  }

  const base = (process.env.ZERNIO_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const url = new URL(`${base}/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages`);
  url.searchParams.set('accountId', accountId);
  url.searchParams.set('limit', '50');
  url.searchParams.set('sortOrder', 'desc');

  const ventana = debounceMs();
  const limite = debounceMaxMs();
  const inicioEspera = Date.now();
  let mensajes = [];
  let espera = ventana;

  do {
    if (espera > 0) await esperar(espera);
    const respuesta = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      throw new Error(datos?.error || `Zernio HTTP ${respuesta.status}`);
    }
    mensajes = Array.isArray(datos.messages) ? datos.messages : [];

    const ultimoEntrante = mensajes
      .filter((item) => item?.direction === 'incoming' && item?.isDeleted !== true)
      .map((item) => Date.parse(item.createdAt))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0];
    const silencio = ultimoEntrante ? Date.now() - ultimoEntrante : ventana;
    espera = Math.max(0, ventana - silencio);
  } while (espera > 0 && Date.now() - inicioEspera + espera <= limite);

  const ancla = messageId
    ? mensajes.find((item) => item?.id === messageId || item?.platformMessageId === messageId)
    : undefined;
  // Si Zernio no entrega el id del primer mensaje al workflow, tomamos una
  // ventana pequeña alrededor de la llegada de la petición.
  const desde = ancla?.createdAt ? Date.parse(ancla.createdAt) : recibidoEn - 5_000;
  const entrantes = mensajes
    .filter((item) => item?.direction === 'incoming' && item?.isDeleted !== true)
    .filter((item) => Number.isFinite(Date.parse(item.createdAt)) && Date.parse(item.createdAt) >= desde)
    .filter((item) => typeof item.message === 'string' && item.message.trim())
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  const vistos = new Set();
  const textos = [];
  for (const item of entrantes) {
    const clave = item.id || `${item.createdAt}:${normalizar(item.message)}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    textos.push(item.message.trim());
  }

  if (!textos.some((texto) => normalizar(texto) === normalizar(mensaje))) {
    textos.unshift(mensaje);
  }

  return {
    mensaje: textos.join('\n').slice(0, 8_000),
    mensajesAgrupados: textos.length,
    agrupado: textos.length > 1,
  };
}
