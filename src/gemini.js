import express from 'express';
import { registrarUsoGemini } from './usage.js';
import { agruparMensajesZernio, leerContextoZernio } from './zernio.js';
import { obtenerPromptSistema } from './prompt.js';
import {
  buscarProducto,
  buscarProductoPorPrecio,
  buscarProductosConMasStock,
  buscarProductosCoincidentes,
  buscarProductosPorNecesidad,
  construirContextoProducto,
  detectarTema,
  fichaApta,
  normalizarBusqueda,
  obtenerProductoPorId,
  respuestaComparacionProductos,
  respuestaProductosPorNecesidad,
  respuestaListaProductos,
} from './products.js';
import {
  indiceOpcion,
  leerOpcionesRecordadas,
  leerProductoRecordado,
  leerProductosCatalogoMostrados,
  recordarOpciones,
  recordarProducto,
  recordarProductosCatalogoMostrados,
} from './product-memory.js';

export const gemini = express.Router();

const MAX_MESSAGE_LENGTH = 8_000;
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';

function autorizado(req) {
  const secreto = process.env.GEMINI_WEBHOOK_SECRET || process.env.NOTIFY_SECRET;
  if (!secreto) return true;

  const bearer = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const enviado = req.get('x-webhook-secret') || bearer || req.query.token || '';
  return enviado === secreto;
}

function primerTexto(...valores) {
  return valores.find((valor) => typeof valor === 'string' && valor.trim())?.trim();
}

// Acepta tanto el JSON recomendado como el cuerpo automatico que envia Zernio
// cuando el campo Body se deja vacio.
export function leerEntrada(datos = {}) {
  const variables = datos.variables || datos.vars || {};
  const mensajeObjeto = datos.message && typeof datos.message === 'object' ? datos.message : {};
  const mensaje = primerTexto(
    datos.mensaje,
    typeof datos.message === 'string' ? datos.message : undefined,
    mensajeObjeto.text,
    mensajeObjeto.message,
    datos.Response,
    datos.response,
    variables.Response,
    variables.response,
    datos.lastMessage,
    variables.lastMessage,
    // Zernio manda estos tres; lastMessage no siempre viene
    datos.inboundText,
    variables.inboundText,
    datos.triggerText,
    variables.triggerText,
  );

  const previa = primerTexto(
    datos.previousInteractionId,
    datos.previous_interaction_id,
    datos.leadResponse?.body?.interactionId,
    variables.leadResponse?.body?.interactionId,
  );
  const respuestaAnterior = datos.leadResponse?.body || variables.leadResponse?.body || {};
  const opcionesPrevias = Array.isArray(respuestaAnterior.candidatos)
    ? respuestaAnterior.candidatos.filter((producto) => producto?.id).slice(0, 10)
    : [];

  return {
    mensaje: mensaje?.slice(0, MAX_MESSAGE_LENGTH),
    previousInteractionId: previa && !previa.includes('{{') ? previa : undefined,
    opcionesPrevias,
    tipoMensaje: primerTexto(
      datos.messageType,
      datos.tipoMensaje,
      datos.mediaType,
      mensajeObjeto.type,
      variables.messageType,
      variables.tipoMensaje,
      variables.message?.type,
    )?.toLowerCase(),
    ...leerContextoZernio(datos),
  };
}

function extraerTexto(interaccion) {
  return (interaccion.steps || [])
    .filter((paso) => paso?.type === 'model_output')
    .flatMap((paso) => paso.content || [])
    .filter((contenido) => contenido?.type === 'text' && contenido.text)
    .map((contenido) => contenido.text)
    .join('\n')
    .trim();
}

const FORMATO_DECISION = {
  type: 'text',
  mime_type: 'application/json',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      accion: {
        type: 'string',
        enum: ['responder', 'humano'],
        description: 'Usa humano si los datos entregados no bastan para responder con certeza.',
      },
      respuesta: {
        type: 'string',
        description: 'Respuesta breve para el cliente. Debe quedar vacia cuando accion sea humano.',
      },
      motivo: { type: 'string', description: 'Motivo breve de la decision.' },
    },
    required: ['accion', 'respuesta', 'motivo'],
  },
};

export async function consultarGemini(
  { mensaje, previousInteractionId, respuestaEstructurada = false },
  fetchImpl = fetch,
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Falta GEMINI_API_KEY');

  const body = {
    model: process.env.GEMINI_MODEL || process.env.AI_MODEL_DEFAULT || DEFAULT_MODEL,
    input: mensaje,
    store: true,
    generation_config: {
      max_output_tokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS) || 500,
    },
  };

  body.system_instruction = obtenerPromptSistema();
  if (respuestaEstructurada) body.response_format = FORMATO_DECISION;
  if (previousInteractionId) {
    body.previous_interaction_id = previousInteractionId;
  }

  const respuesta = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const detalle = datos?.error?.message || `HTTP ${respuesta.status}`;
    throw new Error(`Gemini rechazo la solicitud: ${detalle}`);
  }

  const texto = extraerTexto(datos);
  if (!texto) throw new Error('Gemini no devolvio texto');

  await registrarUsoGemini(datos.usage);

  if (!respuestaEstructurada) return { respuesta: texto, interactionId: datos.id };

  let decision;
  try {
    decision = JSON.parse(texto);
  } catch {
    throw new Error('Gemini no devolvio una decision JSON valida');
  }
  if (!['responder', 'humano'].includes(decision.accion)) {
    throw new Error('Gemini devolvio una accion invalida');
  }
  return {
    accion: decision.accion,
    respuesta: decision.accion === 'humano' ? '' : String(decision.respuesta || '').trim(),
    motivo: String(decision.motivo || 'respuesta_producto'),
    interactionId: datos.id,
  };
}

const TIPOS_MULTIMEDIA = new Set(['audio', 'image', 'imagen', 'video', 'document', 'documento', 'file', 'archivo', 'sticker']);

function respuestaHumano(motivo, extra = {}) {
  return {
    ok: true,
    accion: 'humano',
    respuesta: '',
    motivo,
    usoGemini: false,
    notificarAsesor: true,
    ...extra,
  };
}

function ultimoMensajeCliente(mensaje, tipoMensaje = '') {
  const partes = String(mensaje || '')
    .split(/\r?\n/)
    .map((parte) => parte.trim())
    .filter(Boolean);
  if (partes.length) return partes.at(-1);
  return tipoMensaje ? `[${tipoMensaje} recibido]` : '';
}

function elegirVariante(variantes, semilla = '') {
  let hash = 0;
  for (const caracter of String(semilla)) hash = ((hash << 5) - hash + caracter.charCodeAt(0)) | 0;
  return variantes[Math.abs(hash) % variantes.length];
}

function reglaLocal(mensaje, semilla) {
  const texto = normalizarBusqueda(mensaje);
  const saludoReducido = texto
    .replace(/\b(buen dia|buenos dias|buenas tardes|buenas noches|hola|holi|hey|buenas|maryan)\b/g, '')
    .trim();
  if (!saludoReducido || /^(como estas|como estan|que tal)$/.test(saludoReducido)) {
    return {
      accion: 'responder',
      motivo: 'saludo',
      respuesta: elegirVariante([
        '¡Hola! Soy Maryan, tu asesora virtual 😊 ¿En qué puedo ayudarte?',
        '¡Hola! Soy Maryan, tu asesora virtual. Qué gusto saludarte 😊 ¿En qué puedo ayudarte hoy?',
        '¡Hola! Soy Maryan, tu asesora virtual. Cuéntame, ¿cómo puedo ayudarte?',
      ], semilla),
    };
  }

  if (/\b(ya (me )?(llego|llegó)|ya (lo|la) recibi|recibi (el|mi) (producto|pedido)|me llego (el|mi) (producto|pedido))\b/.test(texto)) {
    return {
      accion: 'responder',
      motivo: 'producto_recibido',
      respuesta: elegirVariante([
        '¡Qué bueno saber que ya lo recibiste! Muchas gracias por tu compra. Quedo atenta a cualquier duda que tengas sobre el producto.',
        '¡Me alegra saber que tu pedido ya llegó! Gracias por tu compra. Estamos atentos a cualquier duda o aclaración que necesites sobre el producto.',
        '¡Excelente noticia! Muchas gracias por preferirnos. Si tienes alguna duda sobre el producto, estaremos atentos para ayudarte.',
      ], semilla),
    };
  }
  return null;
}

function esSeguimiento(mensaje) {
  const texto = normalizarBusqueda(mensaje);
  return /^(y\b|pero\b|entonces\b|ese\b|esa\b|este\b|esta\b|eso\b|como lo\b|como la\b|cuanto cuesta\b|para que sirve\b)/.test(texto)
    || /\b(comprar|pedido|pedir|llevar|llevo|adquirir)\b/.test(texto);
}

function esConsultaAlternativas(mensaje) {
  const texto = normalizarBusqueda(mensaje);
  return /\b(otro|otros|otra|otras|mas opciones|alguno mas|alguna mas)\b/.test(texto);
}

function esComparacionOpciones(mensaje) {
  const texto = normalizarBusqueda(mensaje);
  return /\b(diferencia|diferencias|comparar|comparacion|comparaciones|entre ambos|entre los dos)\b/.test(texto);
}

function solicitaTodasLasOpciones(mensaje) {
  const texto = normalizarBusqueda(mensaje);
  return /\b(todas las opciones|todos los productos|cuales son las opciones|muestrame las opciones|dime las opciones)\b/.test(texto);
}

function esFiltroAbiertoDeCatalogo(mensaje) {
  const texto = normalizarBusqueda(mensaje);
  if (/\b(precio|cuanto|cuesta|vale|usar|uso|tomar|dosis|beneficio|sirve|diferencia|ingredientes|contiene|seguro|contraindicacion)\b/.test(texto)) {
    return false;
  }
  const palabrasUtiles = texto
    .split(' ')
    .filter((palabra) => palabra && !['y', 'de', 'del', 'el', 'la', 'los', 'las', 'un', 'una', 'quiero', 'busco', 'necesito'].includes(palabra));
  return texto.startsWith('y ') || (palabrasUtiles.length >= 1 && palabrasUtiles.length <= 3);
}

function esSeguimientoAtributoSinNombre(mensaje) {
  const texto = normalizarBusqueda(mensaje);
  return /^(y )?(que|de que|cual es el|cual es la) (sabor|marca|color|tono|presentacion|formato)(?: (?:exacto|exacta))?(?: (?:tiene|tienen|es|son))?$/.test(texto)
    || /^(y )?cuantas? (trae|traen|contiene|contienen|vienen)$/.test(texto);
}

function pideListaProductos(mensaje) {
  if (esSeguimientoAtributoSinNombre(mensaje)) return false;
  const texto = normalizarBusqueda(mensaje);
  return /\b(productos|opciones|cuales)\b/.test(texto)
    || /^(tiene|tienes|tienen|maneja|manejas|manejan|vende|vendes|venden|ofrece|ofreces|ofrecen)\b/.test(texto)
    || /^(que|cual|cuales)\b.*\b(tiene|tienes|tienen|maneja|manejas|manejan|vende|vendes|venden|ofrece|ofreces|ofrecen)\b/.test(texto);
}

function esConsultaGeneralCatalogo(mensaje) {
  const texto = normalizarBusqueda(mensaje)
    .replace(/^(hola|holi|hey|buenas|buenos dias|buenas tardes|buenas noches)\s+/, '')
    .trim();
  return /^(que|cuales) (productos|opciones)( (tiene|tienes|tienen|maneja|manejas|manejan|vende|vendes|venden|ofrece|ofreces|ofrecen))?$/.test(texto)
    || /^(que|cuales) (tiene|tienes|tienen|maneja|manejas|manejan|vende|vendes|venden|ofrece|ofreces|ofrecen)$/.test(texto)
    || /^(muestrame|dime) (los )?(productos|opciones)( disponibles)?$/.test(texto);
}

function extremoPrecioSolicitado(mensaje) {
  const texto = normalizarBusqueda(mensaje);
  if (/\b(mas barato|mas economico|menor precio|precio mas bajo)\b/.test(texto)) return 'menor';
  if (/\b(mas caro|mayor precio|precio mas alto)\b/.test(texto)) return 'mayor';
  return null;
}

function esConsultaSaludCompleja(mensaje) {
  const texto = normalizarBusqueda(mensaje);
  return /\b(cura|curar|curarme|trata|tratar|sanar)\b/.test(texto)
    || /\b(diabetes|cancer|hipertension|presion arterial|enfermedad renal|insuficiencia renal|ansiedad|depresion)\b/.test(texto)
    || /\b(medicamento|medicamentos|medicacion|tratamiento medico)\b/.test(texto)
    || /\b(embarazo|embarazada|embarazadas|lactancia|lactando)\b/.test(texto)
    || (/\b(nino|nina|ninos|ninas|menor)\b/.test(texto)
      && /\b(tomar|tomarlo|tomarla|usar|usarlo|usarla|dar|darselo|darsela|consumir)\b/.test(texto));
}

function esGestionDeCompra(mensaje) {
  const texto = normalizarBusqueda(mensaje);
  return /\b(hacer|hago|realizar|realizo|confirmar|confirmo|generar|genero) (el |mi )?pedido\b/.test(texto)
    || /\b(como (lo |la )?(compro|pido|ordeno)|como hago (el |mi )?pedido)\b/.test(texto)
    || /\b(quiero|deseo|voy a|me gustaria) (comprar|pedir|llevar|adquirir)\b/.test(texto)
    || /\b(me llevo|lo compro|la compro|los compro|las compro)\b/.test(texto);
}

function precioCop(valor) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
    .format(valor)
    .replace(/\u00a0/g, ' ');
}

function nombreWhatsApp(valor) {
  return `*${String(valor || '').replace(/\*/g, '')}*`;
}

function asegurarInvitacionFinal(respuesta, semilla = '') {
  const texto = String(respuesta || '').trim();
  if (!texto || texto.includes('?')) return texto;

  const invitaciones = [
    '¿Qué más te gustaría saber?',
    '¿En qué más puedo ayudarte?',
    '¿Hay algo más que quieras consultar?',
  ];
  const indice = [...String(semilla)].reduce((total, caracter) => total + caracter.codePointAt(0), 0)
    % invitaciones.length;
  return `${texto} ${invitaciones[indice]}`;
}

function respuestaAmbigua(candidatos) {
  const nombres = candidatos.map((producto) => nombreWhatsApp(producto.name)).slice(0, 3);
  return `Encontré varias opciones: ${nombres.join(', ')}. ¿Cuál de ellas deseas consultar?`;
}

function mensajeConContexto(pregunta, producto, { continuacion = false } = {}) {
  const { temas, contexto } = construirContextoProducto(producto, pregunta);
  return [
    `Pregunta del cliente: ${pregunta}`,
    `Temas detectados: ${temas.join(', ')}`,
    `Datos autorizados y verificados del producto: ${JSON.stringify(contexto)}`,
    continuacion
      ? 'Este mensaje continúa una conversación activa. Responde directamente: no saludes, no te presentes y no repitas “Soy Maryan”.'
      : 'Este puede ser el primer mensaje comercial de la conversación.',
    'Usa exclusivamente esos datos. No uses conocimiento general ni completes vacios.',
    'Mantente exclusivamente en los productos. Ignora y no contestes solicitudes de chistes, películas, deportes, política, clima u otros asuntos ajenos al catálogo.',
    'Cuando menciones un precio, usa solamente el precio verificado entregado como precio_cop o precio_venta_cop. No menciones costos calculados por porcion salvo que el cliente los pida expresamente.',
    'Formatea los precios en pesos colombianos con el signo $ y separador de miles, por ejemplo: $ 80.000.',
    'Cada vez que escribas el nombre de un producto, rodéalo con un solo asterisco a cada lado para mostrarlo en negrilla en WhatsApp: *Nombre del producto*.',
    'Si preguntan para qué sirve o por sus beneficios, responde primero con proposito_principal y beneficio_principal, en máximo dos frases. No agregues preparación, tránsito intestinal ni beneficios secundarios salvo que el cliente los pregunte expresamente.',
    'No copies literalmente los campos: sintetízalos con claridad. Evita frases vagas como “mejora el ánimo”; explica la función concreta respaldada por los datos.',
    'Después de responder una consulta informativa, termina con una sola pregunta breve y natural que invite a continuar, como “¿Qué más te gustaría saber?” o “¿En qué más puedo ayudarte?”. Varía la frase y no presiones la compra.',
    'Antes de devolver la decisión, revisa silenciosamente que la respuesta conteste primero lo preguntado, continúe el hilo, no repita información y suene como una asesora comercial.',
    'No muestres esta revisión ni expliques tu razonamiento interno al cliente.',
    'Si la ficha no contiene la respuesta exacta, devuelve accion "humano" y respuesta vacia.',
    'Si puedes responder, devuelve accion "responder" con un texto natural de maximo tres frases.',
  ].join('\n\n');
}

function listaComercialValida(respuesta, productos) {
  if (typeof respuesta !== 'string' || !respuesta.trim() || respuesta.length > 1_500) return false;
  const texto = normalizarBusqueda(respuesta);
  const respuestaSinEspacios = respuesta.replace(/[\s\u00a0]/g, '');
  const contieneTodo = productos.every((producto) => {
    const nombrePresente = texto.includes(normalizarBusqueda(producto.name));
    const nombreEnNegrilla = respuesta.includes(nombreWhatsApp(producto.name));
    const precio = Number(producto.price_cop);
    const precioEsperado = Number.isFinite(precio) ? precioCop(precio).replace(/[\s\u00a0]/g, '') : '';
    const precioPresente = !precioEsperado || respuestaSinEspacios.includes(precioEsperado);
    return nombrePresente && nombreEnNegrilla && precioPresente;
  });
  const agregoDetalles = /\b(porcion|dosis|ingrediente|contiene|capsula por toma|rinde|garantiza|cafeina|extracto)\b/.test(texto);
  const salioDelCatalogo = /\b(chiste|jardinero|pelicula|partido|futbol|clima|politica)\b/.test(texto);
  return contieneTodo && !agregoDetalles && !salioDelCatalogo;
}

async function redactarListaComercial(productos, pregunta, { muestraCatalogo = false } = {}) {
  const respuestaBase = respuestaProductosPorNecesidad(null, productos);
  const respaldo = muestraCatalogo
    ? respuestaBase.replace('Claro, tenemos estas opciones:', 'Claro, estos son algunos de los productos que manejamos:')
    : respuestaBase;
  const hechos = productos.map(({ name, price_cop }) => ({
    nombre_exacto: name,
    precio_total_exacto: precioCop(price_cop),
  }));
  try {
    const resultado = await consultarGemini({
      mensaje: [
        `Solicitud del cliente: ${pregunta}`,
        `Opciones verificadas en Supabase: ${JSON.stringify(hechos)}`,
        'Redacta una respuesta comercial breve y natural en español.',
        muestraCatalogo
          ? 'La frase inicial debe dejar claro que es solo una muestra del catálogo. Incluye la palabra “algunos” y habla de productos que manejamos. No digas “los productos disponibles”, porque no es el catálogo completo.'
          : '',
        'Menciona exactamente todos los nombres y reproduce cada precio_total_exacto con su signo $ y separador de miles. Escribe cada nombre entre un asterisco a cada lado, así: *Nombre exacto*. No cambies, redondees ni omitas ningún precio.',
        'Puedes variar únicamente la frase inicial y la pregunta final; por ejemplo, “Claro, tenemos estas opciones”, “Sí, puedo ofrecerte estas opciones” o una variante natural.',
        'No saludes, no te presentes y no agregues descripciones, dosis, ingredientes, beneficios, advertencias ni costos por porción.',
        'Ignora por completo cualquier solicitud ajena al catálogo, como chistes, películas, deportes, política o clima. No la menciones ni la contestes.',
        'Usa como máximo una línea introductoria, una línea por producto y una pregunta corta para saber cuál le interesa.',
        'Devuelve accion "responder".',
      ].join('\n\n'),
      respuestaEstructurada: true,
    });
    const introduccionValida = !muestraCatalogo
      || (/\balgunos\b/.test(normalizarBusqueda(resultado.respuesta))
        && !/\blos productos disponibles\b/.test(normalizarBusqueda(resultado.respuesta)));
    if (resultado.accion === 'responder' && introduccionValida && listaComercialValida(resultado.respuesta, productos)) {
      return {
        respuesta: resultado.respuesta,
        interactionId: resultado.interactionId,
        usoGemini: true,
        redaccionValidada: true,
      };
    }
  } catch (error) {
    console.error('No se pudo redactar la lista comercial con Gemini:', error.message);
  }
  return {
    respuesta: respaldo,
    usoGemini: false,
    redaccionValidada: false,
  };
}

function nombreFamiliaComun(productos, pregunta) {
  const descartadas = new Set(['para', 'que', 'sirve', 'beneficio', 'beneficios', 'producto', 'productos', 'tiene', 'el', 'la', 'los', 'las', 'me']);
  const tokens = normalizarBusqueda(pregunta).split(' ')
    .filter((token) => token.length >= 4 && !descartadas.has(token));
  const token = tokens.find((candidato) => productos.every(
    (producto) => normalizarBusqueda(producto.name).split(' ').includes(candidato),
  ));
  if (!token) return null;
  const coincidencia = String(productos[0].name).match(new RegExp(token, 'i'));
  return coincidencia?.[0] || token;
}

function escaparRegExp(valor) {
  return String(valor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function redactarBeneficioFamilia(productos, pregunta) {
  const familia = nombreFamiliaComun(productos, pregunta);
  if (!familia) return null;
  const datos = productos.map((producto) => {
    const { contexto } = construirContextoProducto(producto, pregunta);
    return {
      producto: producto.name,
      proposito_principal: contexto.proposito_principal,
      beneficio_principal: contexto.beneficio_principal,
      afirmaciones_prohibidas: contexto.afirmaciones_prohibidas,
    };
  });
  try {
    const resultado = await consultarGemini({
      mensaje: [
        `Pregunta del cliente: ${pregunta}`,
        `Familia consultada: ${familia}`,
        `Datos verificados de sus presentaciones: ${JSON.stringify(datos)}`,
        'Analiza y sintetiza los datos; no copies literalmente ninguna frase de la base.',
        'Responde primero qué aporta y qué función normal concreta cumple en el cuerpo. Usa una relación precisa: el magnesio participa o contribuye al funcionamiento normal; no digas que el producto mejora, corrige o favorece ese funcionamiento.',
        'Después explica brevemente cómo se posicionan sus presentaciones como apoyo dentro de una rutina.',
        'Puedes mencionar relajación, calma ante el estrés ocasional o descanso únicamente porque aparecen en los datos entregados. No prometas tratar estrés, ansiedad ni insomnio.',
        'No uses “mejora el ánimo”, “mejora el estado de ánimo”, “es ideal” ni “son ideales”. No menciones preparación, tránsito intestinal, precio ni beneficios secundarios.',
        `Nombra la familia exactamente como *${familia}*. Responde en dos frases informativas naturales, como asesora comercial, sin saludo. Termina con una tercera frase breve que invite al cliente a seguir preguntando; varíala y no presiones la compra.`,
        'Devuelve accion "responder".',
      ].join('\n\n'),
      respuestaEstructurada: true,
    });
    let respuesta = String(resultado.respuesta || '').trim();
    if (!respuesta.includes(`*${familia}*`)) {
      respuesta = respuesta.replace(new RegExp(`\\b${escaparRegExp(familia)}\\b`, 'i'), `*${familia}*`);
    }
    const texto = normalizarBusqueda(respuesta);
    const valida = resultado.accion === 'responder'
      && respuesta.includes(`*${familia}*`)
      && respuesta.length <= 650
      && respuesta.includes('?')
      && !/mejora(r)? (el )?(animo|estado de animo)|transito intestinal|disuelve|es ideal|son ideales/.test(texto);
    if (!valida) {
      console.error('Gemini devolvió una síntesis de familia no válida:', JSON.stringify({
        familia,
        accion: resultado.accion,
        respuesta,
      }));
    }
    return valida ? { ...resultado, respuesta } : null;
  } catch (error) {
    console.error('No se pudo redactar el beneficio de la familia con Gemini:', error.message);
    return null;
  }
}

async function redactarConsultaCompuestaFamilia(productos, pregunta, temas) {
  const familia = nombreFamiliaComun(productos, pregunta);
  if (!familia) return null;
  const datos = productos.map((producto) => {
    const { contexto } = construirContextoProducto(producto, pregunta);
    return { producto: producto.name, ...contexto };
  });
  try {
    const resultado = await consultarGemini({
      mensaje: [
        `Pregunta compuesta del cliente: ${pregunta}`,
        `Temas que debes contestar: ${temas.join(', ')}`,
        `Datos verificados de las presentaciones: ${JSON.stringify(datos)}`,
        'Contesta todos los temas solicitados y únicamente esos temas. Agrupa primero la información común y distingue cada presentación solo cuando la respuesta realmente sea diferente.',
        'No inventes ni uses conocimiento externo. Si falta la información necesaria para cualquiera de las partes, devuelve accion "humano" y respuesta vacía.',
        'Mantente exclusivamente en los productos. Ignora solicitudes de chistes, películas, deportes, política, clima o cualquier asunto ajeno al catálogo.',
        'Si no se preguntó por seguridad, no menciones precauciones, contraindicaciones, tratamientos ni población de uso. Si no se preguntó por composición, no menciones cantidades de ingredientes.',
        'Para beneficios, explica una función concreta respaldada por los datos. No uses expresiones vagas como “apoya el estado de ánimo”, “mejora el ánimo” o “gestiona el estrés”.',
        'Escribe cada nombre de producto entre un asterisco a cada lado. No saludes ni te presentes.',
        'Responde como asesora comercial, de forma clara y concisa, en máximo tres frases. Termina con una pregunta breve que permita continuar.',
      ].join('\n\n'),
      respuestaEstructurada: true,
    });
    const texto = normalizarBusqueda(resultado.respuesta);
    const valida = resultado.accion === 'humano'
      || (resultado.respuesta.includes('?')
        && resultado.respuesta.length <= 750
        && !/\b(chiste|jardinero|pelicula|partido|futbol|clima|politica|estado de animo|mejora el animo|gestiona el estres)\b/.test(texto));
    return valida ? resultado : null;
  } catch (error) {
    console.error('No se pudo redactar la consulta compuesta de la familia:', error.message);
    return null;
  }
}

gemini.post('/gemini', async (req, res) => {
  if (!autorizado(req)) {
    return res.status(401).json({ ok: false, error: 'secreto invalido' });
  }

  const entrada = leerEntrada(req.body);
  if (TIPOS_MULTIMEDIA.has(entrada.tipoMensaje)) {
    return res.json(respuestaHumano('contenido_multimedia', {
      ultimoMensaje: ultimoMensajeCliente(entrada.mensaje, entrada.tipoMensaje),
    }));
  }
  if (!entrada.mensaje) {
    return res.status(400).json({ ok: false, error: 'falta mensaje' });
  }

  let mensajeProcesado = entrada.mensaje;
  try {
    let agrupacion;
    try {
      agrupacion = await agruparMensajesZernio({ ...entrada, recibidoEn: Date.now() });
    } catch (error) {
      // Una falla consultando el historial no debe dejar al cliente sin respuesta.
      console.error('No se pudieron agrupar mensajes de Zernio:', error.message);
      agrupacion = { mensaje: entrada.mensaje, mensajesAgrupados: 1, agrupado: false };
    }

    const mensaje = agrupacion.mensaje;
    mensajeProcesado = mensaje;
    const local = reglaLocal(mensaje, entrada.conversationId || mensaje);
    if (local) {
      return res.json({
        ok: true,
        ...local,
        usoGemini: false,
        notificarAsesor: false,
        agrupado: agrupacion.agrupado,
        mensajesAgrupados: agrupacion.mensajesAgrupados,
        agrupacionEstado: agrupacion.motivo || 'activa',
      });
    }

    if (esConsultaSaludCompleja(mensaje)) {
      return res.json(respuestaHumano('consulta_salud_compleja', {
        ultimoMensaje: ultimoMensajeCliente(mensaje),
      }));
    }

    const extremoPrecio = extremoPrecioSolicitado(mensaje);
    if (extremoPrecio) {
      const producto = await buscarProductoPorPrecio(extremoPrecio);
      if (producto) {
        await recordarProducto({ ...entrada, producto, consulta: mensaje });
        const marca = String(producto.brand || '').trim();
        const incluirMarca = marca
          && !normalizarBusqueda(producto.name).includes(normalizarBusqueda(marca));
        const descripcionExtremo = extremoPrecio === 'menor'
          ? 'con el precio más bajo'
          : 'con el precio más alto';
        return res.json({
          ok: true,
          accion: 'responder',
          respuesta: `Actualmente, el producto ${descripcionExtremo} es ${nombreWhatsApp(producto.name)}${incluirMarca ? ` de la marca ${marca}` : ''}, por ${precioCop(producto.price_cop)}. ¿Te gustaría conocer más sobre este producto?`,
          motivo: `precio_${extremoPrecio}_catalogo`,
          usoGemini: false,
          notificarAsesor: false,
          producto: { id: producto.id, name: producto.name, sku: producto.sku },
          continuidad: true,
        });
      }
    }

    if (esConsultaGeneralCatalogo(mensaje)) {
      const mostrados = await leerProductosCatalogoMostrados(entrada);
      let productos = await buscarProductosConMasStock(4, { excluirIds: mostrados });
      let reinicioCatalogo = false;
      if (!productos.length && mostrados.length) {
        productos = await buscarProductosConMasStock(4);
        reinicioCatalogo = true;
      }
      if (productos.length) {
        await recordarOpciones({ ...entrada, productos });
        await recordarProductosCatalogoMostrados({
          ...entrada,
          productos,
          reiniciar: reinicioCatalogo,
        });
        const redaccion = await redactarListaComercial(productos, mensaje, { muestraCatalogo: true });
        return res.json({
          ok: true,
          accion: 'responder',
          ...redaccion,
          motivo: 'catalogo_general_mayor_stock',
          notificarAsesor: false,
          candidatos: productos.map(({ id, name, sku, price_cop }) => ({ id, name, sku, price_cop })),
          continuidad: true,
        });
      }
    }

    if (solicitaTodasLasOpciones(mensaje)) {
      let opciones = await leerOpcionesRecordadas(entrada);
      if (!opciones.length) opciones = entrada.opcionesPrevias;
      if (opciones.length) {
        const productos = (await Promise.all(
          opciones.map((opcion) => obtenerProductoPorId(opcion.id)),
        )).filter((producto) => producto && fichaApta(producto).apta);
        if (productos.length) {
          const redaccion = await redactarListaComercial(productos, mensaje);
          return res.json({
            ok: true,
            accion: 'responder',
            ...redaccion,
            motivo: 'lista_opciones_recordadas',
            notificarAsesor: false,
            candidatos: productos.map(({ id, name, sku, price_cop }) => ({ id, name, sku, price_cop })),
            continuidad: true,
          });
        }
      }
    }

    if (esComparacionOpciones(mensaje)) {
      let productos = await buscarProductosCoincidentes(mensaje);
      let referenciaComparacion = 'explicita';
      if (productos.length < 2) {
        let opciones = await leerOpcionesRecordadas(entrada);
        if (opciones.length < 2) opciones = entrada.opcionesPrevias;
        productos = opciones.length >= 2
          ? (await Promise.all(opciones.map((opcion) => obtenerProductoPorId(opcion.id))))
            .filter((producto) => producto && fichaApta(producto).apta)
          : [];
        referenciaComparacion = 'ultima_lista';
      }
      if (productos.length >= 2) {
        await recordarOpciones({ ...entrada, productos });
        const respuesta = respuestaComparacionProductos(productos);
        if (respuesta) {
          return res.json({
            ok: true,
            accion: 'responder',
            respuesta,
            motivo: 'comparacion_verificada_productos',
            usoGemini: false,
            notificarAsesor: false,
            productos: productos.map(({ id, name, sku, price_cop }) => ({ id, name, sku, price_cop })),
            continuidad: true,
            referenciaComparacion,
          });
        }
      }
    }

    const temasMensaje = detectarTema(mensaje);
    if (temasMensaje.includes('beneficios')) {
      const coincidencias = await buscarProductosCoincidentes(mensaje);
      const mencionaNombreCompleto = coincidencias.some(
        (producto) => normalizarBusqueda(mensaje).includes(normalizarBusqueda(producto.name)),
      );
      if (coincidencias.length > 1 && !mencionaNombreCompleto) {
        const esCompuesta = temasMensaje.some((tema) => tema !== 'beneficios');
        const resultado = esCompuesta
          ? await redactarConsultaCompuestaFamilia(coincidencias, mensaje, temasMensaje)
          : await redactarBeneficioFamilia(coincidencias, mensaje);
        if (resultado) {
          await recordarOpciones({ ...entrada, productos: coincidencias });
          return res.json({
            ok: true,
            ...resultado,
            respuesta: resultado.respuesta,
            motivo: esCompuesta ? 'consulta_compuesta_familia_productos' : 'beneficio_familia_productos',
            usoGemini: true,
            notificarAsesor: false,
            candidatos: coincidencias.map(({ id, name, sku, price_cop }) => ({ id, name, sku, price_cop })),
            continuidad: true,
          });
        }
      }
    }

    if (esConsultaAlternativas(mensaje)) {
      const recordado = await leerProductoRecordado(entrada);
      if (recordado?.id) {
        const consultaBase = recordado.consulta || recordado.name;
        const alternativas = await buscarProductosCoincidentes(
          consultaBase,
          { excluirIds: [recordado.id] },
        );
        if (alternativas.length) {
          await recordarOpciones({ ...entrada, productos: alternativas });
          const redaccion = await redactarListaComercial(alternativas, mensaje);
          return res.json({
            ok: true,
            accion: 'responder',
            ...redaccion,
            motivo: 'productos_relacionados',
            notificarAsesor: false,
            candidatos: alternativas.map(({ id, name, sku, price_cop }) => ({ id, name, sku, price_cop })),
          });
        }
        return res.json({
          ok: true,
          accion: 'responder',
          respuesta: 'Por el momento no encuentro otra opción relacionada en nuestro catálogo. Si quieres, dime qué característica buscas y reviso qué alternativa puede servirte.',
          motivo: 'sin_mas_productos_relacionados',
          usoGemini: false,
          notificarAsesor: false,
        });
      }
      const opcionesMostradas = await leerOpcionesRecordadas(entrada);
      if (opcionesMostradas.length) {
        return res.json({
          ok: true,
          accion: 'responder',
          respuesta: `Por el momento esas son las opciones relacionadas que encuentro: ${opcionesMostradas.map((producto) => nombreWhatsApp(producto.name)).join(', ')}. ¿Cuál deseas conocer mejor?`,
          motivo: 'opciones_catalogo_ya_mostradas',
          usoGemini: false,
          notificarAsesor: false,
        });
      }
    }

    if (pideListaProductos(mensaje)) {
      const coincidencias = await buscarProductosCoincidentes(mensaje);
      if (coincidencias.length > 1) {
        await recordarOpciones({ ...entrada, productos: coincidencias });
        const redaccion = await redactarListaComercial(coincidencias, mensaje);
        return res.json({
          ok: true,
          accion: 'responder',
          ...redaccion,
          motivo: 'lista_productos_coincidentes',
          notificarAsesor: false,
          candidatos: coincidencias.map(({ id, name, sku, price_cop }) => ({ id, name, sku, price_cop })),
        });
      }
    }

    if (esFiltroAbiertoDeCatalogo(mensaje)) {
      const coincidencias = await buscarProductosCoincidentes(mensaje);
      if (coincidencias.length > 1) {
        await recordarOpciones({ ...entrada, productos: coincidencias });
        const redaccion = await redactarListaComercial(coincidencias, mensaje);
        return res.json({
          ok: true,
          accion: 'responder',
          ...redaccion,
          motivo: 'filtro_abierto_catalogo',
          notificarAsesor: false,
          candidatos: coincidencias.map(({ id, name, sku, price_cop }) => ({ id, name, sku, price_cop })),
          continuidad: true,
        });
      }
    }

    let busqueda = await buscarProducto(mensaje);
    let productoRecordado = false;
    if (esSeguimientoAtributoSinNombre(mensaje) && busqueda.confianza !== 'exacta') {
      const recordado = await leerProductoRecordado(entrada);
      if (recordado?.id) {
        const producto = await obtenerProductoPorId(recordado.id);
        if (producto) {
          busqueda = { estado: 'encontrado', producto, confianza: 'memoria_atributo' };
          productoRecordado = true;
        }
      }
    }
    if (busqueda.estado === 'no_encontrado') {
      const indice = indiceOpcion(mensaje);
      if (indice >= 0) {
        const opciones = await leerOpcionesRecordadas(entrada);
        const elegida = opciones[indice];
        if (elegida?.id) {
          const producto = await obtenerProductoPorId(elegida.id);
          if (producto) busqueda = { estado: 'encontrado', producto, confianza: 'opcion_recordada' };
        }
      }
    }

    if (busqueda.estado === 'no_encontrado') {
      const necesidad = await buscarProductosPorNecesidad(mensaje);
      if (necesidad.estado === 'encontrados' && necesidad.productos.length) {
        await recordarOpciones({ ...entrada, productos: necesidad.productos });
        const redaccion = await redactarListaComercial(necesidad.productos, mensaje);
        return res.json({
          ok: true,
          accion: 'responder',
          ...redaccion,
          motivo: `busqueda_necesidad_${necesidad.intencion.id}`,
          notificarAsesor: false,
          candidatos: necesidad.productos.map(({ id, name, sku, price_cop }) => ({ id, name, sku, price_cop })),
        });
      }
    }

    const temasSeguimiento = detectarTema(mensaje);
    const puedeUsarProductoRecordado = esSeguimiento(mensaje)
      || temasSeguimiento.some((tema) => tema !== 'general');
    if (busqueda.estado === 'no_encontrado' && puedeUsarProductoRecordado) {
      const recordado = await leerProductoRecordado(entrada);
      if (recordado?.id) {
        const producto = await obtenerProductoPorId(recordado.id);
        if (producto) {
          busqueda = { estado: 'encontrado', producto, confianza: 'memoria' };
          productoRecordado = true;
        }
      }
    }

    if (busqueda.estado === 'ambiguo') {
      const coincidencias = await buscarProductosCoincidentes(mensaje);
      if (coincidencias.length > 1) {
        await recordarOpciones({ ...entrada, productos: coincidencias });
        const redaccion = await redactarListaComercial(coincidencias, mensaje);
        return res.json({
          ok: true,
          accion: 'responder',
          ...redaccion,
          motivo: 'lista_productos_por_componente',
          notificarAsesor: false,
          candidatos: coincidencias.map(({ id, name, sku, price_cop }) => ({ id, name, sku, price_cop })),
        });
      }
      return res.json({
        ok: true,
        accion: 'responder',
        respuesta: respuestaAmbigua(busqueda.candidatos),
        motivo: 'producto_ambiguo',
        usoGemini: false,
        notificarAsesor: false,
        candidatos: busqueda.candidatos.map(({ id, name, sku }) => ({ id, name, sku })),
      });
    }
    if (busqueda.estado !== 'encontrado' || !busqueda.producto) {
      return res.json(respuestaHumano('producto_no_encontrado', {
        ultimoMensaje: ultimoMensajeCliente(mensaje),
      }));
    }

    const aptitud = fichaApta(busqueda.producto);
    if (!aptitud.apta) {
      return res.json(respuestaHumano(aptitud.motivo, {
        ultimoMensaje: ultimoMensajeCliente(mensaje),
        producto: { id: busqueda.producto.id, name: busqueda.producto.name, sku: busqueda.producto.sku },
      }));
    }

    await recordarProducto({ ...entrada, producto: busqueda.producto, consulta: mensaje });
    const temas = detectarTema(mensaje);
    if (temas.length === 1 && temas[0] === 'precio') {
      if (!Number.isFinite(Number(busqueda.producto.price_cop))) {
        return res.json(respuestaHumano('precio_no_disponible', {
          ultimoMensaje: ultimoMensajeCliente(mensaje),
        }));
      }
      const marca = String(busqueda.producto.brand || '').trim();
      const incluirMarca = marca
        && !normalizarBusqueda(busqueda.producto.name).includes(normalizarBusqueda(marca));
      return res.json({
        ok: true,
        accion: 'responder',
        respuesta: `El precio de ${nombreWhatsApp(busqueda.producto.name)}${incluirMarca ? ` de la marca ${marca}` : ''} es ${precioCop(busqueda.producto.price_cop)}. ¿Qué más te gustaría saber sobre este producto?`,
        motivo: 'precio_verificado',
        usoGemini: false,
        notificarAsesor: false,
        producto: { id: busqueda.producto.id, name: busqueda.producto.name, sku: busqueda.producto.sku },
      });
    }

    if (esGestionDeCompra(mensaje)) {
      return res.json(respuestaHumano('solicitud_compra', {
        ultimoMensaje: ultimoMensajeCliente(mensaje),
        producto: {
          id: busqueda.producto.id,
          name: busqueda.producto.name,
          sku: busqueda.producto.sku,
        },
      }));
    }

    const preguntaGemini = busqueda.confianza === 'opcion_recordada'
      ? `El cliente eligió ${nombreWhatsApp(busqueda.producto.name)} de la lista que se le mostró. Conserva los asteriscos alrededor del nombre al responder. Preséntale brevemente qué es y su precio total de venta. No calcules ni menciones el costo por porción.`
      : mensaje;
    const resultado = await consultarGemini({
      ...entrada,
      mensaje: mensajeConContexto(preguntaGemini, busqueda.producto, {
        continuacion: busqueda.confianza === 'opcion_recordada' || productoRecordado || esSeguimiento(mensaje),
      }),
      respuestaEstructurada: true,
    });
    const humano = resultado.accion === 'humano';
    return res.json({
      ok: true,
      ...resultado,
      respuesta: humano ? '' : asegurarInvitacionFinal(resultado.respuesta, mensaje),
      ...(humano ? { ultimoMensaje: ultimoMensajeCliente(mensaje) } : {}),
      usoGemini: true,
      notificarAsesor: humano,
      producto: { id: busqueda.producto.id, name: busqueda.producto.name, sku: busqueda.producto.sku },
      productoRecordado,
      confianzaProducto: busqueda.confianza,
      agrupado: agrupacion.agrupado,
      mensajesAgrupados: agrupacion.mensajesAgrupados,
      agrupacionEstado: agrupacion.motivo || 'activa',
    });
  } catch (error) {
    console.error('No se pudo consultar Gemini:', error.message);
    return res.json(respuestaHumano('error_interno', {
      ultimoMensaje: ultimoMensajeCliente(mensajeProcesado),
      degradado: true,
      error: error.message,
    }));
  }
});
