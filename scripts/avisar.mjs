#!/usr/bin/env node
// Dispara el webhook /notify a mano, para probar sin depender de la plataforma.
//   node scripts/avisar.mjs --nombre "Ana Perez" --telefono "+52 811 222 3333" \
//     --mensaje "Quiere asesor" --id a1b2c3
// Cualquier --clave valor se manda tal cual en el JSON, asi que sirve para
// probar los nombres de campo que use tu plataforma:
//   node scripts/avisar.mjs --nombre Ana --conversation_url https://...
import 'dotenv/config';

const args = process.argv.slice(2);
const datos = {};
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('--')) continue;
  const clave = args[i].slice(2);
  const valor = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
  datos[clave] = valor;
}

// --id es un atajo de conversation_id (el que usa CHAT_URL_TEMPLATE)
if (datos.id) {
  datos.conversation_id = datos.id;
  delete datos.id;
}

if (!Object.keys(datos).length) {
  console.error('Sin datos. Ejemplo:\n  node scripts/avisar.mjs --nombre "Ana" --mensaje "Hola" --id a1b2c3');
  process.exit(1);
}

const base = process.env.NOTIFY_URL || `http://localhost:${process.env.PORT || 3000}`;
const url = `${base.replace(/\/+$/, '')}/notify`;

const cabeceras = { 'Content-Type': 'application/json' };
if (process.env.NOTIFY_SECRET) cabeceras['x-webhook-secret'] = process.env.NOTIFY_SECRET;

try {
  const res = await fetch(url, { method: 'POST', headers: cabeceras, body: JSON.stringify(datos) });
  const cuerpo = await res.text();
  console.log(`${res.status} ${cuerpo}`);
  if (!res.ok) process.exit(1);

  const { conBoton } = JSON.parse(cuerpo);
  if (conBoton === false) {
    console.error('\nAviso enviado, pero SIN boton para contestar.');
    console.error('Falta CHAT_URL_TEMPLATE en el .env, o el id/enlace no venia en los datos.');
  }
} catch (err) {
  console.error(`No se pudo llamar a ${url}: ${err.message}`);
  console.error('Esta corriendo el servidor? (npm start)');
  process.exit(1);
}
