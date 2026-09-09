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
    .wide { grid-column: 1 / -1; }
    .card { border: 1px solid #27272a; border-radius: 14px; background: #111113; padding: 18px; }
    .value { display: block; font-size: 25px; font-weight: 650; margin-top: 8px; }
    .notice { margin-top: 14px; border-radius: 12px; padding: 14px 16px; background: #172554; color: #bfdbfe; font-size: 14px; line-height: 1.45; }
    .warning { background: #3f2607; color: #fde68a; }
    footer { color: #71717a; font-size: 13px; margin-top: 16px; line-height: 1.5; }
    .chart-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 18px; }
    select { color: #fafafa; background: #18181b; border: 1px solid #3f3f46; border-radius: 9px; padding: 8px 10px; }
    svg { display: block; width: 100%; height: 230px; overflow: visible; }
    .axis { stroke: #3f3f46; stroke-width: 1; }
    .line { fill: none; stroke: #60a5fa; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    .point { fill: #09090b; stroke: #93c5fd; stroke-width: 3; }
    .chart-label { fill: #a1a1aa; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th, td { text-align: right; padding: 11px 8px; border-bottom: 1px solid #27272a; }
    th:first-child, td:first-child { text-align: left; }
    th { color: #a1a1aa; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
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
    <div class="card wide">
      <div class="chart-head"><div><span class="label">Gasto por semana</span><span class="value" id="costoMes">—</span></div><select id="mes"></select></div>
      <svg id="grafica" viewBox="0 0 680 230" role="img" aria-label="Costo estimado por semana"></svg>
    </div>
    <div class="card wide">
      <span class="label">Seguimiento mensual</span>
      <table><thead><tr><th>Mes</th><th>Solicitudes</th><th>Tokens</th><th>Estimado</th></tr></thead><tbody id="meses"></tbody></table>
    </div>
  </section>
  <div class="notice" id="estado">Consultando el contador…</div>
  <footer>Se actualiza cada 10 segundos. Cuenta desde el despliegue que incorpora este medidor; no puede recuperar consumo anterior.</footer>
</main>
<script>
  const fmt = new Intl.NumberFormat('es-CO');
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 6, maximumFractionDigits: 6 });
  const query = location.search;
  let ultimo = null;
  function dibujar() {
    if (!ultimo) return;
    const mes = document.querySelector('#mes').value;
    const semanas = ultimo.semanas.filter(x => x.mes === mes);
    const totalMes = ultimo.meses.find(x => x.mes === mes);
    document.querySelector('#costoMes').textContent = usd.format(totalMes?.costoEstimadoUsd || 0) + ' en el mes';
    const svg = document.querySelector('#grafica');
    const ancho = 680, alto = 230, left = 48, right = 20, top = 22, bottom = 36;
    const max = Math.max(...semanas.map(x => x.costoEstimadoUsd), 0.000001);
    const puntos = semanas.map((x, i) => {
      const px = semanas.length === 1 ? ancho / 2 : left + i * (ancho - left - right) / (semanas.length - 1);
      const py = top + (1 - x.costoEstimadoUsd / max) * (alto - top - bottom);
      return { x, px, py };
    });
    svg.innerHTML = '<line class="axis" x1="' + left + '" y1="' + (alto-bottom) + '" x2="' + (ancho-right) + '" y2="' + (alto-bottom) + '"/>'
      + (puntos.length ? '<polyline class="line" points="' + puntos.map(p => p.px + ',' + p.py).join(' ') + '"/>' : '')
      + puntos.map(p => '<g><circle class="point" cx="' + p.px + '" cy="' + p.py + '" r="5"><title>Semana ' + p.x.semana + ': ' + usd.format(p.x.costoEstimadoUsd) + '</title></circle><text class="chart-label" text-anchor="middle" x="' + p.px + '" y="' + (alto-12) + '">Sem ' + p.x.semana + '</text><text class="chart-label" text-anchor="middle" x="' + p.px + '" y="' + (p.py-12) + '">' + usd.format(p.x.costoEstimadoUsd) + '</text></g>').join('');
  }
  async function actualizar() {
    const boton = document.querySelector('#actualizar');
    boton.disabled = true;
    try {
      const respuesta = await fetch('/gastos.json' + query, { cache: 'no-store' });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.error || 'No se pudo consultar');
      ultimo = datos;
      document.querySelector('#costo').textContent = usd.format(datos.costoEstimadoUsd);
      document.querySelector('#solicitudes').textContent = fmt.format(datos.solicitudes);
      document.querySelector('#total').textContent = fmt.format(datos.tokensTotales);
      document.querySelector('#entrada').textContent = fmt.format(datos.tokensEntrada);
      document.querySelector('#salida').textContent = fmt.format(datos.tokensSalida);
      document.querySelector('#modelo').textContent = datos.modelo;
      document.querySelector('#tarifa').textContent = '$' + datos.tarifaEntradaUsdPorMillon + '/M entrada · $' + datos.tarifaSalidaUsdPorMillon + '/M salida · ' + datos.fuenteTarifa;
      const selector = document.querySelector('#mes');
      const elegido = selector.value;
      selector.innerHTML = datos.meses.slice().reverse().map(x => '<option value="' + x.mes + '">' + x.mes + '</option>').join('');
      if (elegido && datos.meses.some(x => x.mes === elegido)) selector.value = elegido;
      document.querySelector('#meses').innerHTML = datos.meses.slice().reverse().map(x => '<tr><td>' + x.mes + '</td><td>' + fmt.format(x.solicitudes) + '</td><td>' + fmt.format(x.tokensTotales) + '</td><td>' + usd.format(x.costoEstimadoUsd) + '</td></tr>').join('') || '<tr><td colspan="4">Aún no hay consumo registrado</td></tr>';
      dibujar();
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
  document.querySelector('#mes').addEventListener('change', dibujar);
  actualizar();
  setInterval(actualizar, 10000);
</script>
</body>
</html>`);
});
