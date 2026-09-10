const memoria = new Map();
const PREFIX = 'webhoks-wa:maryan:product';

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

function clave(conversationId, accountId) {
  if (!conversationId) return null;
  return `${PREFIX}:${accountId || 'default'}:${conversationId}`;
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

export async function recordarProducto({ conversationId, accountId, producto }) {
  const key = clave(conversationId, accountId);
  if (!key || !producto?.id) return false;
  const valor = JSON.stringify({ id: producto.id, name: producto.name, sku: producto.sku, guardadoEn: Date.now() });
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
