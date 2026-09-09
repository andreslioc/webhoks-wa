const USAGE_KEY = 'webhoks-wa:gemini:usage';

const memoria = {
  solicitudes: 0,
  tokensEntrada: 0,
  tokensSalida: 0,
  tokensPensamiento: 0,
  tokensTotales: 0,
  actualizadoEn: null,
  dias: new Map(),
};

function diaActual() {
  const zona = process.env.GEMINI_USAGE_TZ || 'America/Bogota';
  const partes = new Intl.DateTimeFormat('en', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const valor = (tipo) => partes.find((parte) => parte.type === tipo)?.value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

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

  const resultado = {
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
  return resultado;
}

function costoDe(tokensEntrada, tokensSalida, tarifa) {
  return numero(tokensEntrada) * tarifa.entrada / 1_000_000
    + numero(tokensSalida) * tarifa.salida / 1_000_000;
}

function sumar(destino, origen) {
  destino.solicitudes += numero(origen.solicitudes);
  destino.tokensEntrada += numero(origen.tokensEntrada);
  destino.tokensSalida += numero(origen.tokensSalida);
  destino.tokensPensamiento += numero(origen.tokensPensamiento);
  destino.tokensTotales += numero(origen.tokensTotales);
}

function nuevoPeriodo(campos) {
  return {
    ...campos,
    solicitudes: 0,
    tokensEntrada: 0,
    tokensSalida: 0,
    tokensPensamiento: 0,
    tokensTotales: 0,
  };
}

function periodos(datosPorDia, modelo) {
  const tarifa = precios(modelo);
  const dias = [];
  const semanasMap = new Map();
  const mesesMap = new Map();

  for (const fecha of [...datosPorDia.keys()].sort()) {
    const valores = datosPorDia.get(fecha);
    const mes = fecha.slice(0, 7);
    const numeroSemana = Math.floor((Number(fecha.slice(8, 10)) - 1) / 7) + 1;
    const claveSemana = `${mes}-S${numeroSemana}`;
    const dia = { fecha, ...nuevoPeriodo({}) };
    sumar(dia, valores);
    dia.costoEstimadoUsd = costoDe(dia.tokensEntrada, dia.tokensSalida, tarifa);
    dias.push(dia);

    if (!semanasMap.has(claveSemana)) {
      semanasMap.set(claveSemana, nuevoPeriodo({ clave: claveSemana, mes, semana: numeroSemana }));
    }
    sumar(semanasMap.get(claveSemana), valores);

    if (!mesesMap.has(mes)) mesesMap.set(mes, nuevoPeriodo({ mes }));
    sumar(mesesMap.get(mes), valores);
  }

  const conCosto = (periodo) => ({
    ...periodo,
    costoEstimadoUsd: costoDe(periodo.tokensEntrada, periodo.tokensSalida, tarifa),
  });

  return {
    dias,
    semanas: [...semanasMap.values()].map(conCosto),
    meses: [...mesesMap.values()].map(conCosto),
  };
}

function mapaDesdeHash(plano) {
  const dias = new Map();
  for (let i = 0; i < (plano || []).length; i += 2) {
    const [fecha, campo] = String(plano[i]).split(':');
    if (!fecha || !campo) continue;
    if (!dias.has(fecha)) dias.set(fecha, nuevoPeriodo({}));
    dias.get(fecha)[campo] = numero(plano[i + 1]);
  }
  return dias;
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
  const fecha = diaActual();

  for (const [campo, valor] of Object.entries(incremento)) memoria[campo] += valor;
  memoria.actualizadoEn = actualizadoEn;
  if (!memoria.dias.has(fecha)) memoria.dias.set(fecha, nuevoPeriodo({}));
  sumar(memoria.dias.get(fecha), incremento);

  if (!redisConfig()) return;

  try {
    await redis([
      'EVAL',
      "local f={'solicitudes','tokensEntrada','tokensSalida','tokensPensamiento','tokensTotales'}; for i=1,5 do redis.call('HINCRBY',KEYS[1],f[i],ARGV[i]); redis.call('HINCRBY',KEYS[2],ARGV[7]..':'..f[i],ARGV[i]); end; redis.call('HSET',KEYS[1],'actualizadoEn',ARGV[6]); return 1",
      '2',
      USAGE_KEY,
      `${USAGE_KEY}:daily`,
      String(incremento.solicitudes),
      String(incremento.tokensEntrada),
      String(incremento.tokensSalida),
      String(incremento.tokensPensamiento),
      String(incremento.tokensTotales),
      actualizadoEn,
      fecha,
    ]);
  } catch (error) {
    console.error('No se pudo persistir el uso de Gemini:', error.message);
  }
}

export async function obtenerUsoGemini() {
  const modelo = process.env.GEMINI_MODEL || process.env.AI_MODEL_DEFAULT || 'gemini-3.1-flash-lite';
  if (!redisConfig()) {
    return { ...completar(memoria, 'memoria temporal'), ...periodos(memoria.dias, modelo) };
  }

  try {
    const plano = await redis(['HGETALL', USAGE_KEY]);
    const planoDias = await redis(['HGETALL', `${USAGE_KEY}:daily`]);
    const datos = {};
    for (let i = 0; i < (plano || []).length; i += 2) datos[plano[i]] = plano[i + 1];
    return {
      ...completar(datos, 'Upstash Redis'),
      ...periodos(mapaDesdeHash(planoDias), modelo),
    };
  } catch (error) {
    console.error('No se pudo leer el uso persistente de Gemini:', error.message);
    return {
      ...completar(memoria, 'memoria temporal (Redis no disponible)'),
      ...periodos(memoria.dias, modelo),
    };
  }
}
