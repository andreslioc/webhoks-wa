import express from 'express';
import { registrarUsoGemini } from './usage.js';

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
  const mensaje = primerTexto(
    datos.mensaje,
    datos.message,
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

  return {
    mensaje: mensaje?.slice(0, MAX_MESSAGE_LENGTH),
    previousInteractionId: previa && !previa.includes('{{') ? previa : undefined,
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

export async function consultarGemini({ mensaje, previousInteractionId }, fetchImpl = fetch) {
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

  if (process.env.GEMINI_SYSTEM_PROMPT) {
    body.system_instruction = process.env.GEMINI_SYSTEM_PROMPT;
  }
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

  return { respuesta: texto, interactionId: datos.id };
}

gemini.post('/gemini', async (req, res) => {
  if (!autorizado(req)) {
    return res.status(401).json({ ok: false, error: 'secreto invalido' });
  }

  const entrada = leerEntrada(req.body);
  if (!entrada.mensaje) {
    return res.status(400).json({ ok: false, error: 'falta mensaje' });
  }

  try {
    const resultado = await consultarGemini(entrada);
    return res.json({ ok: true, ...resultado });
  } catch (error) {
    console.error('No se pudo consultar Gemini:', error.message);
    const status = error.message === 'Falta GEMINI_API_KEY' ? 503 : 502;
    return res.status(status).json({ ok: false, error: error.message });
  }
});
