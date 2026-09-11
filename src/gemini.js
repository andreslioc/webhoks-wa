import express from 'express';
import { registrarUsoGemini } from './usage.js';
import { agruparMensajesZernio, leerContextoZernio } from './zernio.js';
import { obtenerPromptSistema } from './prompt.js';
import {
  buscarProducto,
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
  recordarOpciones,
  recordarProducto,
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
    ? respuestaAnterior.candidatos.filter((producto) => producto?.id).slice(0, 5)
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
  return /^(y\b|pero\b|entonces\b|ese\b|esa\b|este\b|esta\b|eso\b|como lo\b|como la\b|cuanto cuesta\b|para que sirve\b)/.test(texto);
}

function esConsultaAlternativas(mensaje) {
  const texto = normalizarBusqueda(mensaje);
  return /\b(otro|otros|otra|otras|mas opciones|alguno mas|alguna mas)\b/.test(texto);
}

function esComparacionOpciones(mensaje) {
  const texto = normalizarBusqueda(mensaje);
  return /\b(diferencia|diferencias|comparar|comparacion|comparaciones|entre ambos|entre los dos)\b/.test(texto);
}

function pideListaProductos(mensaje) {
  const texto = normalizarBusqueda(mensaje);
  return /\b(productos|opciones|cuales)\b/.test(texto)
    || /^(tiene|tienes|tienen|maneja|manejas|manejan|vende|vendes|venden|ofrece|ofreces|ofrecen)\b/.test(texto)
    || /^(que|cual|cuales)\b.*\b(tiene|tienes|tienen|maneja|manejas|manejan|vende|vendes|venden|ofrece|ofreces|ofrecen)\b/.test(texto);
}

function precioCop(valor) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valor);
}

function respuestaAmbigua(candidatos) {
  const nombres = candidatos.map((producto) => producto.name).slice(0, 3);
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
    'Cuando menciones un precio, usa solamente precio_venta_cop. No menciones costos calculados por porcion salvo que el cliente los pida expresamente.',
    'Si la ficha no contiene la respuesta exacta, devuelve accion "humano" y respuesta vacia.',
    'Si puedes responder, devuelve accion "responder" con un texto natural de maximo tres frases.',
  ].join('\n\n');
}

gemini.post('/gemini', async (req, res) => {
  if (!autorizado(req)) {
    return res.status(401).json({ ok: false, error: 'secreto invalido' });
  }

  const entrada = leerEntrada(req.body);
  if (TIPOS_MULTIMEDIA.has(entrada.tipoMensaje)) {
    return res.json(respuestaHumano('contenido_multimedia'));
  }
  if (!entrada.mensaje) {
    return res.status(400).json({ ok: false, error: 'falta mensaje' });
  }

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

    if (esComparacionOpciones(mensaje)) {
      let opciones = await leerOpcionesRecordadas(entrada);
      if (opciones.length < 2) opciones = entrada.opcionesPrevias;
      if (opciones.length >= 2) {
        const productos = (await Promise.all(
          opciones.map((opcion) => obtenerProductoPorId(opcion.id)),
        )).filter((producto) => producto && fichaApta(producto).apta);
        if (productos.length >= 2) {
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
            });
          }
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
          return res.json({
            ok: true,
            accion: 'responder',
            respuesta: respuestaListaProductos(alternativas, { adicionales: true }),
            motivo: 'productos_relacionados',
            usoGemini: false,
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
          respuesta: `Por el momento esas son las opciones relacionadas que encuentro: ${opcionesMostradas.map((producto) => producto.name).join(', ')}. ¿Cuál deseas conocer mejor?`,
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
        return res.json({
          ok: true,
          accion: 'responder',
          respuesta: respuestaListaProductos(coincidencias),
          motivo: 'lista_productos_coincidentes',
          usoGemini: false,
          notificarAsesor: false,
          candidatos: coincidencias.map(({ id, name, sku, price_cop }) => ({ id, name, sku, price_cop })),
        });
      }
    }

    let busqueda = await buscarProducto(mensaje);
    let productoRecordado = false;
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
        return res.json({
          ok: true,
          accion: 'responder',
          respuesta: respuestaProductosPorNecesidad(necesidad.intencion, necesidad.productos),
          motivo: `busqueda_necesidad_${necesidad.intencion.id}`,
          usoGemini: false,
          notificarAsesor: false,
          candidatos: necesidad.productos.map(({ id, name, sku, price_cop }) => ({ id, name, sku, price_cop })),
        });
      }
    }

    if (busqueda.estado === 'no_encontrado') {
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
      return res.json(respuestaHumano('producto_no_encontrado'));
    }

    const aptitud = fichaApta(busqueda.producto);
    if (!aptitud.apta) {
      return res.json(respuestaHumano(aptitud.motivo, {
        producto: { id: busqueda.producto.id, name: busqueda.producto.name, sku: busqueda.producto.sku },
      }));
    }

    await recordarProducto({ ...entrada, producto: busqueda.producto, consulta: mensaje });
    const temas = detectarTema(mensaje);
    if (temas.length === 1 && temas[0] === 'precio') {
      if (!Number.isFinite(Number(busqueda.producto.price_cop))) {
        return res.json(respuestaHumano('precio_no_disponible'));
      }
      return res.json({
        ok: true,
        accion: 'responder',
        respuesta: `El precio de ${busqueda.producto.name} es ${precioCop(busqueda.producto.price_cop)}.`,
        motivo: 'precio_verificado',
        usoGemini: false,
        notificarAsesor: false,
        producto: { id: busqueda.producto.id, name: busqueda.producto.name, sku: busqueda.producto.sku },
      });
    }

    const preguntaGemini = busqueda.confianza === 'opcion_recordada'
      ? `El cliente eligió ${busqueda.producto.name} de la lista que se le mostró. Preséntale brevemente qué es y su precio total de venta. No calcules ni menciones el costo por porción.`
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
      respuesta: humano ? '' : resultado.respuesta,
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
    return res.json(respuestaHumano('error_interno', { degradado: true, error: error.message }));
  }
});
