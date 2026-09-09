import express from 'express';
import { obtenerUsoGemini } from './usage.js';

export const gastos = express.Router();

function autorizado(req) {
  const secreto = process.env.GASTOS_DASHBOARD_SECRET
    || process.env.GEMINI_WEBHOOK_SECRET
    || process.env.NOTIFY_SECRET;
  if (!secreto) return true;

  const bearer = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const enviado = req.get('x-webhook-secret') || bearer || req.query.token || '';
  return enviado === secreto;
}

gastos.get('/gastos.json', async (req, res) => {
  if (!autorizado(req)) return res.status(401).json({ ok: false, error: 'secreto invalido' });
  res.set('Cache-Control', 'no-store');
  return res.json({ ok: true, ...(await obtenerUsoGemini()) });
});

gastos.get('/gastos', (req, res) => {
  if (!autorizado(req)) return res.status(401).send('Secreto inválido');
  res.set('Cache-Control', 'no-store');
  res.type('html').send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gasto de Gemini · Webhooks</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #09090b; color: #fafafa; display: grid; place-items: center; padding: 24px; }
    main { width: min(760px, 100%); }
    header { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 22px; }
    h1 { font-size: clamp(26px, 5vw, 42px); letter-spacing: -.04em; margin: 0 0 5px; }
    .muted { color: #a1a1aa; margin: 0; }
    button { border: 1px solid #3f3f46; color: #fafafa; background: #18181b; padding: 10px 14px; border-radius: 10px; cursor: pointer; }
    button:hover { background: #27272a; }
    .hero { padding: 26px; border: 1px solid #27272a; border-radius: 18px; background: linear-gradient(145deg, #18181b, #101012); margin-bottom: 14px; }
    .label { color: #a1a1aa; font-size: 13px; text-transform: uppercase; letter-spacing: .09em; }
    .cost { font-size: clamp(42px, 10vw, 72px); line-height: 1; font-weight: 750; letter-spacing: -.06em; margin: 10px 0; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
    .card { border: 1px solid #27272a; border-radius: 14px; background: #111113; padding: 18px; }
    .value { display: block; font-size: 25px; font-weight: 650; margin-top: 8px; }
    .notice { margin-top: 14px; border-radius: 12px; padding: 14px 16px; background: #172554; color: #bfdbfe; font-size: 14px; line-height: 1.45; }
    .warning { background: #3f2607; color: #fde68a; }
    footer { color: #71717a; font-size: 13px; margin-top: 16px; line-height: 1.5; }
    @media (max-width: 540px) { header { align-items: start; flex-direction: column; } .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<main>
  <header>
    <div><h1>Uso de Gemini</h1><p class="muted" id="modelo">Cargando…</p></div>
    <button id="actualizar" type="button">Actualizar ahora</button>
  </header>
  <section class="hero">
    <div class="label">Costo estimado acumulado</div>
    <div class="cost" id="costo">—</div>
    <p class="muted" id="tarifa"></p>
  </section>
  <section class="grid">
    <div class="card"><span class="label">Solicitudes</span><span class="value" id="solicitudes">—</span></div>
    <div class="card"><span class="label">Tokens totales</span><span class="value" id="total">—</span></div>
    <div class="card"><span class="label">Tokens de entrada</span><span class="value" id="entrada">—</span></div>
    <div class="card"><span class="label">Tokens de salida</span><span class="value" id="salida">—</span></div>
  </section>
  <div class="notice" id="estado">Consultando el contador…</div>
  <footer>Se actualiza cada 10 segundos. Cuenta desde el despliegue que incorpora este medidor; no puede recuperar consumo anterior.</footer>
</main>
<script>
  const fmt = new Intl.NumberFormat('es-CO');
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 6, maximumFractionDigits: 6 });
  const query = location.search;
  async function actualizar() {
    const boton = document.querySelector('#actualizar');
    boton.disabled = true;
    try {
      const respuesta = await fetch('/gastos.json' + query, { cache: 'no-store' });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.error || 'No se pudo consultar');
      document.querySelector('#costo').textContent = usd.format(datos.costoEstimadoUsd);
      document.querySelector('#solicitudes').textContent = fmt.format(datos.solicitudes);
      document.querySelector('#total').textContent = fmt.format(datos.tokensTotales);
      document.querySelector('#entrada').textContent = fmt.format(datos.tokensEntrada);
      document.querySelector('#salida').textContent = fmt.format(datos.tokensSalida);
      document.querySelector('#modelo').textContent = datos.modelo;
      document.querySelector('#tarifa').textContent = '$' + datos.tarifaEntradaUsdPorMillon + '/M entrada · $' + datos.tarifaSalidaUsdPorMillon + '/M salida · ' + datos.fuenteTarifa;
      const persistente = datos.persistencia === 'Upstash Redis';
      const estado = document.querySelector('#estado');
      estado.className = 'notice' + (persistente ? '' : ' warning');
      estado.textContent = persistente
        ? 'Contador persistente activo. Última respuesta: ' + (datos.actualizadoEn ? new Date(datos.actualizadoEn).toLocaleString('es-CO') : 'todavía ninguna')
        : 'Contador temporal: configura Upstash Redis para que el total no se reinicie cuando Vercel cambie de instancia.';
    } catch (error) {
      const estado = document.querySelector('#estado');
      estado.className = 'notice warning';
      estado.textContent = error.message;
    } finally { boton.disabled = false; }
  }
  document.querySelector('#actualizar').addEventListener('click', actualizar);
  actualizar();
  setInterval(actualizar, 10000);
</script>
</body>
</html>`);
});
