const memoria = new Map();
const PREFIX = 'webhoks-wa:maryan:product';
const OPTIONS_PREFIX = 'webhoks-wa:maryan:options';
const CATALOG_PREFIX = 'webhoks-wa:maryan:catalog-shown';

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

function clave(conversationId, accountId) {
  if (!conversationId) return null;
  return `${PREFIX}:${accountId || 'default'}:${conversationId}`;
}

function claveOpciones(conversationId, accountId) {
  if (!conversationId) return null;
  return `${OPTIONS_PREFIX}:${accountId || 'default'}:${conversationId}`;
}

function claveCatalogo(conversationId, accountId) {
  if (!conversationId) return null;
  return `${CATALOG_PREFIX}:${accountId || 'default'}:${conversationId}`;
}

function ttlSegundos() {
  const valor = Number(process.env.PRODUCT_MEMORY_TTL_SECONDS);
  return Number.isFinite(valor) ? Math.max(300, valor) : 86_400;
}

async function redis(command) {
  const config = redisConfig();
  if (!config) return null;
  const respuesta = await fetch(config.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(3_000),
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || datos.error) throw new Error(datos.error || `Redis HTTP ${respuesta.status}`);
  return datos.result;
}

export async function recordarProducto({ conversationId, accountId, producto, consulta }) {
  const key = clave(conversationId, accountId);
  if (!key || !producto?.id) return false;
  const valor = JSON.stringify({
    id: producto.id,
    name: producto.name,
    sku: producto.sku,
    consulta: String(consulta || '').slice(0, 500),
    guardadoEn: Date.now(),
  });
  memoria.set(key, { valor, venceEn: Date.now() + ttlSegundos() * 1_000 });
  if (redisConfig()) await redis(['SET', key, valor, 'EX', String(ttlSegundos())]);
  return true;
}

export async function leerProductoRecordado({ conversationId, accountId }) {
  const key = clave(conversationId, accountId);
  if (!key) return null;
  if (redisConfig()) {
    const valor = await redis(['GET', key]);
    return valor ? JSON.parse(valor) : null;
  }
  const guardado = memoria.get(key);
  if (!guardado || guardado.venceEn <= Date.now()) {
    memoria.delete(key);
    return null;
  }
  return JSON.parse(guardado.valor);
}

export async function recordarOpciones({ conversationId, accountId, productos }) {
  const key = claveOpciones(conversationId, accountId);
  if (!key || !Array.isArray(productos) || !productos.length) return false;
  const valor = JSON.stringify(productos.slice(0, 10).map(({ id, name, sku }) => ({ id, name, sku })));
  memoria.set(key, { valor, venceEn: Date.now() + 2 * 60 * 60 * 1_000 });
  if (redisConfig()) await redis(['SET', key, valor, 'EX', String(2 * 60 * 60)]);
  return true;
}

export async function leerOpcionesRecordadas({ conversationId, accountId }) {
  const key = claveOpciones(conversationId, accountId);
  if (!key) return [];
  if (redisConfig()) {
    const valor = await redis(['GET', key]);
    return valor ? JSON.parse(valor) : [];
  }
  const guardado = memoria.get(key);
  if (!guardado || guardado.venceEn <= Date.now()) {
    memoria.delete(key);
    return [];
  }
  return JSON.parse(guardado.valor);
}

export async function leerProductosCatalogoMostrados({ conversationId, accountId }) {
  const key = claveCatalogo(conversationId, accountId);
  if (!key) return [];
  if (redisConfig()) {
    const valor = await redis(['GET', key]);
    return valor ? JSON.parse(valor) : [];
  }
  const guardado = memoria.get(key);
  if (!guardado || guardado.venceEn <= Date.now()) {
    memoria.delete(key);
    return [];
  }
  return JSON.parse(guardado.valor);
}

export async function recordarProductosCatalogoMostrados({
  conversationId,
  accountId,
  productos,
  reiniciar = false,
}) {
  const key = claveCatalogo(conversationId, accountId);
  if (!key || !Array.isArray(productos) || !productos.length) return false;
  const anteriores = reiniciar ? [] : await leerProductosCatalogoMostrados({ conversationId, accountId });
  const ids = [...new Set([
    ...anteriores,
    ...productos.map((producto) => producto?.id).filter(Boolean),
  ])].slice(-200);
  const valor = JSON.stringify(ids);
  memoria.set(key, { valor, venceEn: Date.now() + 2 * 60 * 60 * 1_000 });
  if (redisConfig()) await redis(['SET', key, valor, 'EX', String(2 * 60 * 60)]);
  return true;
}

export function indiceOpcion(mensaje) {
  const texto = String(mensaje || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(primero|primera|numero 1|opcion 1|el 1)\b/.test(texto)) return 0;
  if (/\b(segundo|segunda|numero 2|opcion 2|el 2)\b/.test(texto)) return 1;
  if (/\b(tercero|tercera|numero 3|opcion 3|el 3)\b/.test(texto)) return 2;
  if (/\b(cuarto|cuarta|numero 4|opcion 4|el 4)\b/.test(texto)) return 3;
  if (/\b(quinto|quinta|numero 5|opcion 5|el 5)\b/.test(texto)) return 4;
  if (/\b(sexto|sexta|numero 6|opcion 6|el 6)\b/.test(texto)) return 5;
  if (/\b(septimo|septima|numero 7|opcion 7|el 7)\b/.test(texto)) return 6;
  if (/\b(octavo|octava|numero 8|opcion 8|el 8)\b/.test(texto)) return 7;
  if (/\b(noveno|novena|numero 9|opcion 9|el 9)\b/.test(texto)) return 8;
  if (/\b(decimo|decima|numero 10|opcion 10|el 10)\b/.test(texto)) return 9;
  return -1;
}
