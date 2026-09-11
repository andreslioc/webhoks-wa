import test from 'node:test';
import assert from 'node:assert/strict';
import { construirAviso } from '../src/notify.js';

test('el aviso prioriza el ultimo mensaje del cliente y oculta textos anteriores', () => {
  const { html } = construirAviso({
    titulo: 'Atención humana requerida',
    nombre: 'Felipe',
    motivo: 'producto_no_encontrado',
    ultimoMensaje: '¿Cuál es el producto más barato que tienen?',
    inboundText: 'Mensaje anterior',
    triggerText: 'Ayaaaa',
  });

  assert.match(html, /<b>Mensaje:<\/b> ¿Cuál es el producto más barato que tienen\?/);
  assert.doesNotMatch(html, /Mensaje anterior|trigger_text|Ayaaaa|<b>titulo:<\/b>/);
});
