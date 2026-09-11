const DEFAULT_TABLE = 'products';
const DEFAULT_CACHE_MS = 5 * 60 * 1000;

const STOPWORDS = new Set([
  'a', 'al', 'algo', 'como', 'con', 'cual', 'cuanto', 'de', 'del', 'el', 'en',
  'es', 'esta', 'este', 'hola', 'la', 'las', 'lo', 'los', 'me', 'para', 'por',
  'precio', 'producto', 'que', 'quiero', 'se', 'sirve', 'su', 'tiene', 'un', 'una',
  'usar', 'vale', 'y', 'cuales', 'manejan', 'ofrecen', 'opciones', 'productos',
]);

let cacheCatalogo = { venceEn: 0, filas: [] };

function configSupabase() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.SUPABASE_PRODUCTS_TABLE || DEFAULT_TABLE;
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SECRET_KEY');
  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) throw new Error('SUPABASE_PRODUCTS_TABLE no es valido');
  return { url, key, table };
}

async function consultarSupabase(parametros, fetchImpl = fetch) {
  const { url, key, table } = configSupabase();
  const endpoint = new URL(`${url}/rest/v1/${table}`);
  for (const [nombre, valor] of Object.entries(parametros)) endpoint.searchParams.set(nombre, valor);
  const respuesta = await fetchImpl(endpoint, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(8_000),
  });
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const detalle = datos?.message || datos?.error || `HTTP ${respuesta.status}`;
    throw new Error(`Supabase rechazo la consulta: ${detalle}`);
  }
  return datos;
}

export function normalizarBusqueda(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokensUtiles(valor) {
  return normalizarBusqueda(valor)
    .split(' ')
    .map((token) => {
      if (STOPWORDS.has(token)) return '';
      const singular = token.length >= 5 && token.endsWith('s') ? token.slice(0, -1) : token;
      return STOPWORDS.has(singular) ? '' : singular;
    })
    .filter((token) => token.length >= 2);
}

function similitudToken(a, b) {
  if (a === b) return 1;
  if (a.length < 5 || b.length < 5) return 0;
  const pares = (texto) => {
    const resultado = [];
    for (let i = 0; i < texto.length - 1; i += 1) resultado.push(texto.slice(i, i + 2));
    return resultado;
  };
  const izquierda = pares(a);
  const derecha = pares(b);
  const disponibles = [...derecha];
  let coincidencias = 0;
  for (const par of izquierda) {
    const posicion = disponibles.indexOf(par);
    if (posicion >= 0) {
      coincidencias += 1;
      disponibles.splice(posicion, 1);
    }
  }
  return (2 * coincidencias) / (izquierda.length + derecha.length || 1);
}

function camposIndice(producto) {
  const keywords = Array.isArray(producto.keywords) ? producto.keywords : [];
  return [producto.name, producto.sku, producto.brand, producto.category, producto.presentation, ...keywords]
    .filter(Boolean);
}

export function puntuarProducto(producto, consulta) {
  const q = normalizarBusqueda(consulta);
  const nombre = normalizarBusqueda(producto.name);
  const sku = normalizarBusqueda(producto.sku);
  const keywords = (Array.isArray(producto.keywords) ? producto.keywords : []).map(normalizarBusqueda);
  const consultaTokens = tokensUtiles(q);
  const nombreTokens = new Set(tokensUtiles(producto.name));
  const marcaTokens = new Set(tokensUtiles(producto.brand));
  const otrosTokens = new Set(tokensUtiles([
    producto.category,
    producto.presentation,
    ...keywords,
  ].join(' ')));
  const productoTokens = new Set([...nombreTokens, ...marcaTokens, ...otrosTokens]);
  let score = 0;
  let exacto = false;

  if (sku && q.includes(sku)) {
    score += 1_000;
    exacto = true;
  }
  if (nombre && q.includes(nombre)) {
    score += 800;
    exacto = true;
  } else if (q.length >= 5 && nombre.includes(q)) {
    score += 500;
  }
  for (const keyword of keywords) {
    if (keyword.length >= 4 && q.includes(keyword)) {
      score += keyword.includes(' ') ? 120 : 60;
    }
  }

  let tokensExactos = 0;
  let tokensAproximados = 0;
  for (const token of consultaTokens) {
    if (nombreTokens.has(token)) {
      tokensExactos += 1;
      score += 70;
      continue;
    }
    if (marcaTokens.has(token)) {
      tokensExactos += 1;
      score += 35;
      continue;
    }
    if (otrosTokens.has(token)) {
      tokensExactos += 1;
      score += 20;
      continue;
    }
    if ([...nombreTokens].some((candidato) => similitudToken(token, candidato) >= 0.82)) {
      tokensAproximados += 1;
      score += 30;
    } else if ([...productoTokens].some((candidato) => similitudToken(token, candidato) >= 0.86)) {
      tokensAproximados += 1;
      score += 12;
    }
  }

  return { producto, score, exacto, tokensExactos, tokensAproximados };
}

export function seleccionarProducto(catalogo, consulta) {
  const evaluados = (catalogo || [])
    .map((producto) => puntuarProducto(producto, consulta))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const primero = evaluados[0];
  if (!primero || primero.score < 70) return { estado: 'no_encontrado', candidatos: [] };

  const cercanos = evaluados.filter((item) => primero.score - item.score <= 30).slice(0, 3);
  if (!primero.exacto && cercanos.length > 1) {
    return { estado: 'ambiguo', candidatos: cercanos.map((item) => item.producto) };
  }

  return {
    estado: 'encontrado',
    producto: primero.producto,
    candidatos: [primero.producto],
    confianza: primero.exacto ? 'exacta' : 'aproximada',
  };
}

export async function cargarCatalogo(fetchImpl = fetch) {
  const ahora = Date.now();
  if (cacheCatalogo.venceEn > ahora && cacheCatalogo.filas.length) return cacheCatalogo.filas;
  const filas = await consultarSupabase({
    select: 'id,name,sku,brand,category,presentation,keywords,purpose,verified_at',
    limit: '1000',
  }, fetchImpl);
  const ttl = Number(process.env.PRODUCT_CATALOG_CACHE_MS) || DEFAULT_CACHE_MS;
  cacheCatalogo = { filas: Array.isArray(filas) ? filas : [], venceEn: ahora + Math.max(5_000, ttl) };
  return cacheCatalogo.filas;
}

const DETALLE = [
  'id', 'name', 'sku', 'brand', 'category', 'subcategory', 'presentation', 'format',
  'price_cop', 'description', 'purpose', 'audience', 'active_ingredients', 'benefits',
  'faqs', 'objections', 'differentiators', 'precautions', 'contraindications',
  'claims_allowed', 'claims_caution', 'claims_forbidden', 'verification_gaps',
  'caution_guidance', 'avoid_guidance', 'vs_similares', 'advisor_summary',
  'full_answer', 'live_ready', 'verified_at', 'updated_at',
].join(',');

export async function obtenerProductoPorId(id, fetchImpl = fetch) {
  if (!id) return null;
  const filas = await consultarSupabase({ select: DETALLE, id: `eq.${id}`, limit: '1' }, fetchImpl);
  return Array.isArray(filas) ? filas[0] || null : null;
}

export async function buscarProducto(consulta, fetchImpl = fetch) {
  const catalogo = await cargarCatalogo(fetchImpl);
  const seleccion = seleccionarProducto(catalogo, consulta);
  if (seleccion.estado !== 'encontrado') return seleccion;
  const producto = await obtenerProductoPorId(seleccion.producto.id, fetchImpl);
  return { ...seleccion, producto };
}

export async function buscarProductosCoincidentes(consulta, { excluirIds = [], limite = 5 } = {}, fetchImpl = fetch) {
  const excluidos = new Set(excluirIds.filter(Boolean));
  const catalogo = await cargarCatalogo(fetchImpl);
  const candidatos = catalogo
    .map((producto) => puntuarProducto(producto, consulta))
    .filter((item) => !excluidos.has(item.producto.id) && item.score >= 60)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);
  const detalles = await Promise.all(
    candidatos.map((item) => obtenerProductoPorId(item.producto.id, fetchImpl)),
  );
  return detalles.filter((producto) => producto && fichaApta(producto).apta);
}

function precioVentaCop(valor) {
  const precio = Number(valor);
  if (!Number.isFinite(precio)) return null;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(precio).replace(/\u00a0/g, ' ');
}

function textoComparacion(producto) {
  const full = producto.full_answer || {};
  return normalizarBusqueda([
    producto.name,
    producto.presentation,
    full.different,
    producto.advisor_summary,
  ].filter(Boolean).join(' '));
}

function saborProducto(producto) {
  const texto = textoComparacion(producto);
  if (/sin sabor|unflavored|sabor neutro|sabor original/.test(texto)) return { tipo: 'sin_sabor', etiqueta: 'no tiene sabor' };
  if (texto.includes('frambuesa') && texto.includes('limon')) return { tipo: 'sabor', etiqueta: 'tiene sabor a frambuesa-limón' };
  const sabores = ['vainilla', 'chocolate', 'fresa', 'naranja', 'limon', 'frambuesa', 'menta', 'cereza'];
  const encontrado = sabores.find((sabor) => texto.includes(sabor));
  return encontrado ? { tipo: 'sabor', etiqueta: `tiene sabor a ${encontrado}` } : null;
}

function comparacionPrincipalDeSabor(productos) {
  if (productos.length !== 2) return null;
  const sabores = productos.map(saborProducto);
  if (sabores.some((sabor) => !sabor) || sabores[0].tipo === sabores[1].tipo) return null;
  const descripciones = productos.map((producto, indice) => {
    const precio = precioVentaCop(producto.price_cop);
    return `${producto.name} ${sabores[indice].etiqueta}${precio ? ` y cuesta ${precio}` : ''}`;
  });
  const textos = productos.map(textoComparacion);
  const mismaComposicion = textos.every((texto) => texto.includes('citrato') && texto.includes('glicinato'));
  const mismaPresentacion = textos.every((texto) => /16 oz|16 onzas/.test(texto));
  const coincidencias = [
    mismaComposicion ? 'Ambos combinan citrato y glicinato de magnesio' : '',
    mismaPresentacion ? 'los dos vienen en presentación de 16 oz' : '',
  ].filter(Boolean);
  return [
    'Claro, mira: la diferencia principal entre estos dos es el sabor.',
    `${descripciones[0]}; en cambio, ${descripciones[1]}.`,
    coincidencias.length ? `${coincidencias.join(' y ')}.` : '',
    '¿Cuál prefieres?',
  ].filter(Boolean).join(' ');
}

export function respuestaListaProductos(productos, { adicionales = false } = {}) {
  const lineas = productos.map((producto) => {
    const detalle = producto.presentation || producto.format || producto.brand;
    const precioVenta = precioVentaCop(producto.price_cop);
    return `• ${producto.name}${detalle ? `: ${detalle}` : ''}${precioVenta ? ` — ${precioVenta}` : ''}.`;
  });
  const todosRestringidos = productos.length > 0 && productos.every((producto) => {
    const full = producto.full_answer || {};
    const control = normalizarBusqueda([
      producto.advisor_summary,
      full.what_for,
      full.commercial,
      full.warning,
      ...(Array.isArray(producto.live_ready) ? producto.live_ready : []),
    ].filter(Boolean).join(' '));
    return /no se (vende|ofrece)|venta (esta )?prohibida|venta y consumo (estan )?prohibidos|comercializacion.*ilegal|alerta sanitaria/.test(control);
  });
  const alerta = productos
    .flatMap((producto) => Array.isArray(producto.claims_allowed) ? producto.claims_allowed : [])
    .find((texto) => /alerta sanitaria/i.test(String(texto)));
  const detalleAlerta = alerta ? String(alerta).replace(/^producto con\s+/i, '') : '';
  return [
    todosRestringidos
      ? 'En nuestra base aparecen estas referencias:'
      : (adicionales ? 'Claro, también tenemos estas opciones relacionadas:' : 'Claro, manejamos estas opciones:'),
    ...lineas,
    todosRestringidos
      ? `Sin embargo, sus fichas indican que no están disponibles para venta en Colombia${detalleAlerta ? ` debido a la ${detalleAlerta}` : ''}.`
      : '¿Cuál deseas conocer mejor?',
  ].join('\n');
}

const INTENCIONES = [
  {
    id: 'control_peso',
    etiqueta: 'el control de peso',
    consultas: [
      'bajar de peso', 'perder peso', 'controlar el peso', 'control de peso',
      'adelgazar', 'quemar grasa', 'quema grasa', 'reducir peso', 'weight loss',
    ],
    senalesFuertes: [
      'control de peso', 'bajar de peso', 'perder peso', 'weight loss',
      'fat burner', 'quemador de grasa', 'quemar grasa',
    ],
    senalesApoyo: ['control de antojos', 'termogenico', 'metabolismo'],
  },
];

export function detectarNecesidad(consulta) {
  const texto = normalizarBusqueda(consulta);
  return INTENCIONES.find((intencion) => intencion.consultas.some(
    (frase) => texto.includes(normalizarBusqueda(frase)),
  )) || null;
}

export function seleccionarPorNecesidad(catalogo, consulta) {
  const intencion = detectarNecesidad(consulta);
  if (!intencion) return { estado: 'sin_necesidad' };
  const puntuados = (catalogo || []).map((producto) => {
    const texto = normalizarBusqueda([
      producto.name,
      ...(Array.isArray(producto.keywords) ? producto.keywords : []),
      producto.purpose,
    ].filter(Boolean).join(' '));
    let score = 0;
    for (const frase of intencion.senalesFuertes) {
      if (texto.includes(normalizarBusqueda(frase))) score += 100;
    }
    for (const frase of intencion.senalesApoyo) {
      if (texto.includes(normalizarBusqueda(frase))) score += 15;
    }
    return { producto, score };
  }).filter((item) => item.score >= 100).sort((a, b) => b.score - a.score);

  return {
    estado: puntuados.length ? 'encontrados' : 'no_encontrados',
    intencion,
    candidatos: puntuados.slice(0, 3).map((item) => item.producto),
  };
}

export async function buscarProductosPorNecesidad(consulta, fetchImpl = fetch) {
  const catalogo = await cargarCatalogo(fetchImpl);
  const seleccion = seleccionarPorNecesidad(catalogo, consulta);
  if (seleccion.estado !== 'encontrados') return seleccion;
  const detalles = await Promise.all(
    seleccion.candidatos.map((producto) => obtenerProductoPorId(producto.id, fetchImpl)),
  );
  return {
    ...seleccion,
    productos: detalles.filter((producto) => producto && fichaApta(producto).apta),
  };
}

export function respuestaProductosPorNecesidad(intencion, productos) {
  const lineas = productos.map((producto) => {
    const permitidas = Array.isArray(producto.claims_allowed) ? producto.claims_allowed : [];
    const datos = permitidas.slice(0, 2).join('; ') || producto.presentation || 'Consulta su ficha completa';
    return `• ${producto.name}: ${datos}.`;
  });
  return [
    `Claro, tenemos estas opciones relacionadas con ${intencion.etiqueta}:`,
    ...lineas,
    'Son complementos y no garantizan pérdida de peso. ¿Cuál deseas conocer mejor?',
  ].join('\n');
}

export function fichaApta(producto) {
  if (!producto?.verified_at) return { apta: false, motivo: 'producto_no_verificado' };
  if (!producto.advisor_summary?.trim() || !producto.full_answer || typeof producto.full_answer !== 'object') {
    return { apta: false, motivo: 'ficha_incompleta' };
  }
  const textoControl = normalizarBusqueda(`${producto.advisor_summary} ${producto.precautions || ''}`);
  if (/registro de demostracion|no es un producto real|no debe usarse como base/.test(textoControl)) {
    return { apta: false, motivo: 'producto_de_demostracion' };
  }
  return { apta: true };
}

function recortar(valor, maximo = 1_200) {
  if (valor === null || valor === undefined || valor === '') return undefined;
  const texto = typeof valor === 'string' ? valor : JSON.stringify(valor);
  return texto.length > maximo ? `${texto.slice(0, maximo)}…` : valor;
}

export function detectarTema(mensaje) {
  const texto = normalizarBusqueda(mensaje);
  const temas = [];
  if (/\b(precio|cuanto|cuesta|vale|valor)\b/.test(texto)) temas.push('precio');
  if (/\b(usar|usa|uso|tomar|toma|aplicar|aplica|dosis|preparar|prepara|preparo|mezclar|mezcla|disolver|disuelve)\b/.test(texto)) temas.push('uso');
  if (/\b(para que|sirve|beneficio|beneficios|ayuda)\b/.test(texto)) temas.push('beneficios');
  if (/\b(ingrediente|ingredientes|contiene|composicion)\b/.test(texto)) temas.push('composicion');
  if (/\b(diferencia|diferencias|comparar|comparacion|comparaciones|mejor)\b/.test(texto)) temas.push('diferencias');
  if (/\b(seguro|precaucion|contraindicacion|advertencia|embarazo|medicamento)\b/.test(texto)) temas.push('seguridad');
  return temas.length ? temas : ['general'];
}

export function construirContextoComparacion(productos, mensaje) {
  return productos.map((producto) => {
    const { contexto } = construirContextoProducto(producto, mensaje);
    return {
      ...contexto,
      precio_venta_cop: producto.price_cop,
    };
  });
}

export function respuestaComparacionProductos(productos) {
  if (!Array.isArray(productos) || productos.length < 2) return null;
  const comparacionSabor = comparacionPrincipalDeSabor(productos);
  if (comparacionSabor) return comparacionSabor;
  let hayDatosVerificados = false;
  const lineas = productos.map((producto) => {
    const full = producto.full_answer || {};
    const diferenciadores = Array.isArray(producto.differentiators)
      ? producto.differentiators.join('; ')
      : String(producto.differentiators || '').trim();
    const diferencia = String(full.different || diferenciadores || '').trim();
    const presentacion = String(producto.presentation || producto.format || '').trim();
    const precio = precioVentaCop(producto.price_cop);
    if (diferencia || presentacion || precio) hayDatosVerificados = true;
    const detalles = [
      diferencia,
      !diferencia && presentacion ? `Presentación: ${presentacion}` : '',
      precio ? `Precio total: ${precio}` : '',
    ].filter(Boolean).map((texto) => texto.replace(/[.\s]+$/, ''));
    return `• ${producto.name}: ${detalles.join('. ')}.`;
  });
  if (!hayDatosVerificados) return null;
  return [
    'Claro, mira: estas son las diferencias principales:',
    ...lineas,
    '¿Cuál prefieres?',
  ].join('\n');
}

export function construirContextoProducto(producto, mensaje) {
  const temas = detectarTema(mensaje);
  const full = producto.full_answer || {};
  const contexto = {
    id: producto.id,
    nombre: producto.name,
    sku: producto.sku,
    marca: producto.brand,
    presentacion: producto.presentation,
    formato: producto.format,
    verificado_en: producto.verified_at,
  };

  if (temas.includes('precio')) contexto.precio_cop = producto.price_cop;
  if (temas.includes('uso')) {
    contexto.modo_uso = recortar(producto.usage_mode);
    contexto.precauciones = recortar(producto.precautions);
    contexto.contraindicaciones = recortar(producto.contraindications);
    contexto.advertencia = recortar(full.warning);
    if (!contexto.modo_uso) contexto.respuestas_verificadas = recortar(producto.live_ready, 1_600);
  }
  if (temas.includes('beneficios')) {
    contexto.para_que = recortar(full.what_for);
    contexto.beneficios = recortar(full.benefits || producto.benefits);
    if (!contexto.para_que && !contexto.beneficios) contexto.respuestas_verificadas = recortar(producto.live_ready, 1_600);
  }
  if (temas.includes('composicion')) {
    contexto.ingredientes_activos = recortar(producto.active_ingredients);
    if (!contexto.ingredientes_activos) contexto.respuestas_verificadas = recortar(producto.live_ready, 1_600);
  }
  if (temas.includes('diferencias')) {
    contexto.diferencia = recortar(full.different);
    contexto.comparacion = recortar(producto.vs_similares);
    if (!contexto.diferencia && !contexto.comparacion) contexto.respuestas_verificadas = recortar(producto.live_ready, 1_600);
  }
  if (temas.includes('seguridad')) {
    contexto.precauciones = recortar(producto.precautions);
    contexto.contraindicaciones = recortar(producto.contraindications);
    contexto.advertencia = recortar(full.warning);
    if (!contexto.precauciones && !contexto.contraindicaciones && !contexto.advertencia) {
      contexto.respuestas_verificadas = recortar(producto.live_ready, 1_600);
    }
  }
  if (temas.includes('general')) {
    contexto.resumen_asesor = recortar(producto.advisor_summary);
    contexto.que_es = recortar(full.what_it_is);
    contexto.precio_venta_cop = producto.price_cop;
  }

  contexto.afirmaciones_permitidas = recortar(producto.claims_allowed, 700);
  contexto.afirmaciones_prohibidas = recortar(producto.claims_forbidden, 700);
  contexto.vacios_verificacion = recortar(producto.verification_gaps, 700);
  return { temas, contexto };
}

export function limpiarCacheCatalogo() {
  cacheCatalogo = { venceEn: 0, filas: [] };
}
