const USAGE_KEY = 'webhoks-wa:gemini:usage';

const memoria = {
  solicitudes: 0,
  tokensEntrada: 0,
  tokensSalida: 0,
  tokensPensamiento: 0,
  tokensTotales: 0,
  actualizadoEn: null,
};

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

async function redis(command) {
  const config = redisConfig();
  if (!config) return null;

  const respuesta = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(3_000),
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || datos.error) {
    throw new Error(datos.error || `Redis HTTP ${respuesta.status}`);
  }
  return datos.result;
}

function precios(modelo) {
  const entradaRaw = process.env.GEMINI_INPUT_USD_PER_MILLION;
  const salidaRaw = process.env.GEMINI_OUTPUT_USD_PER_MILLION;
  const entradaConfigurada = Number(entradaRaw);
  const salidaConfigurada = Number(salidaRaw);
  if (entradaRaw?.trim() && salidaRaw?.trim() && entradaConfigurada >= 0 && salidaConfigurada >= 0) {
    return { entrada: entradaConfigurada, salida: salidaConfigurada, fuente: 'variables de entorno' };
  }

  if (modelo === 'gemini-3.1-flash-lite') {
    return { entrada: 0.25, salida: 1.50, fuente: 'tarifa estándar publicada' };
  }

  return { entrada: 0, salida: 0, fuente: 'sin tarifa configurada' };
}

function completar(datos, persistencia) {
  const modelo = process.env.GEMINI_MODEL || process.env.AI_MODEL_DEFAULT || 'gemini-3.1-flash-lite';
  const tarifa = precios(modelo);
  const tokensEntrada = numero(datos.tokensEntrada);
  const tokensSalida = numero(datos.tokensSalida);
  const costoEntradaUsd = tokensEntrada * tarifa.entrada / 1_000_000;
  const costoSalidaUsd = tokensSalida * tarifa.salida / 1_000_000;

  return {
    solicitudes: numero(datos.solicitudes),
    tokensEntrada,
    tokensSalida,
    tokensPensamiento: numero(datos.tokensPensamiento),
    tokensTotales: numero(datos.tokensTotales),
    costoEstimadoUsd: costoEntradaUsd + costoSalidaUsd,
    modelo,
    tarifaEntradaUsdPorMillon: tarifa.entrada,
    tarifaSalidaUsdPorMillon: tarifa.salida,
    fuenteTarifa: tarifa.fuente,
    persistencia,
    actualizadoEn: datos.actualizadoEn || null,
  };
}

export async function registrarUsoGemini(usage = {}) {
  const incremento = {
    solicitudes: 1,
    tokensEntrada: numero(usage.total_input_tokens),
    tokensSalida: numero(usage.total_output_tokens),
    tokensPensamiento: numero(usage.total_thought_tokens),
    tokensTotales: numero(usage.total_tokens),
  };
  const actualizadoEn = new Date().toISOString();

  for (const [campo, valor] of Object.entries(incremento)) memoria[campo] += valor;
  memoria.actualizadoEn = actualizadoEn;

  if (!redisConfig()) return;

  try {
    await redis([
      'EVAL',
      "redis.call('HINCRBY', KEYS[1], 'solicitudes', ARGV[1]); redis.call('HINCRBY', KEYS[1], 'tokensEntrada', ARGV[2]); redis.call('HINCRBY', KEYS[1], 'tokensSalida', ARGV[3]); redis.call('HINCRBY', KEYS[1], 'tokensPensamiento', ARGV[4]); redis.call('HINCRBY', KEYS[1], 'tokensTotales', ARGV[5]); redis.call('HSET', KEYS[1], 'actualizadoEn', ARGV[6]); return 1",
      '1',
      USAGE_KEY,
      String(incremento.solicitudes),
      String(incremento.tokensEntrada),
      String(incremento.tokensSalida),
      String(incremento.tokensPensamiento),
      String(incremento.tokensTotales),
      actualizadoEn,
    ]);
  } catch (error) {
    console.error('No se pudo persistir el uso de Gemini:', error.message);
  }
}

export async function obtenerUsoGemini() {
  if (!redisConfig()) return completar(memoria, 'memoria temporal');

  try {
    const plano = await redis(['HGETALL', USAGE_KEY]);
    const datos = {};
    for (let i = 0; i < (plano || []).length; i += 2) datos[plano[i]] = plano[i + 1];
    return completar(datos, 'Upstash Redis');
  } catch (error) {
    console.error('No se pudo leer el uso persistente de Gemini:', error.message);
    return completar(memoria, 'memoria temporal (Redis no disponible)');
  }
}
