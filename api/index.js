// Punto de entrada para Vercel: reexporta la app de Express.
// vercel.json manda todas las rutas aca, asi que /notify, /webhook y /health
// siguen funcionando igual que en local.
export { default } from '../src/server.js';
