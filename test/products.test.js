import test from 'node:test';
import assert from 'node:assert/strict';
import {
  construirContextoProducto,
  detectarTema,
  fichaApta,
  seleccionarProducto,
} from '../src/products.js';

const catalogo = [
  {
    id: '1',
    name: 'Love Spell Fragrance Mist',
    sku: 'BelVic-001',
    brand: "Victoria's Secret",
    category: 'Belleza',
    presentation: '250 ml',
    keywords: ['love spell', 'bruma floral'],
  },
  {
    id: '2',
    name: 'Horbäach Magnesium Bisglycinate 750mg',
    sku: 'SalHor-396',
    brand: 'Horbäach',
    category: 'Salud',
    presentation: '120 cápsulas',
    keywords: ['magnesio', 'bisglicinato'],
  },
  {
    id: '3',
    name: 'Natural Vitality CALM Magnesium',
    sku: 'SalNat-002',
    brand: 'Natural Vitality',
    category: 'Salud',
    presentation: 'Polvo',
    keywords: ['magnesio', 'calm'],
  },
];

test('encuentra un producto por nombre dentro de una pregunta', () => {
  const resultado = seleccionarProducto(catalogo, 'Hola, ¿cuánto vale Love Spell Fragrance Mist?');
  assert.equal(resultado.estado, 'encontrado');
  assert.equal(resultado.producto.id, '1');
  assert.equal(resultado.confianza, 'exacta');
});

test('encuentra por SKU normalizado', () => {
  const resultado = seleccionarProducto(catalogo, 'Necesito el SalHor-396');
  assert.equal(resultado.estado, 'encontrado');
  assert.equal(resultado.producto.id, '2');
});

test('no inventa un producto inexistente', () => {
  const resultado = seleccionarProducto(catalogo, '¿Qué sabes de PRUEBA-MARYAN-999999?');
  assert.equal(resultado.estado, 'no_encontrado');
});

test('pide aclaracion cuando una palabra coincide con varios productos', () => {
  const resultado = seleccionarProducto(catalogo, 'Quiero consultar el magnesio');
  assert.equal(resultado.estado, 'ambiguo');
  assert.equal(resultado.candidatos.length, 2);
});

test('rechaza fichas de demostracion aunque tengan fecha de verificacion', () => {
  const resultado = fichaApta({
    verified_at: new Date().toISOString(),
    advisor_summary: 'Registro de demostración; no es un producto real.',
    precautions: 'No debe usarse como base de una respuesta.',
    full_answer: { what_it_is: 'demo' },
  });
  assert.deepEqual(resultado, { apta: false, motivo: 'producto_de_demostracion' });
});

test('el contexto de precio no incluye campos extensos de uso', () => {
  const producto = {
    id: '1', name: 'Love Spell', sku: 'A1', brand: 'Marca', presentation: '250 ml',
    format: 'Bruma', verified_at: new Date().toISOString(), price_cop: 60000,
    usage_mode: 'texto que no debe viajar', precautions: 'texto que no debe viajar',
    claims_allowed: ['aroma floral'], claims_forbidden: ['cura'], verification_gaps: [],
    full_answer: { what_it_is: 'Bruma corporal' }, advisor_summary: 'Resumen',
  };
  assert.deepEqual(detectarTema('¿Cuánto cuesta Love Spell?'), ['precio']);
  const { contexto } = construirContextoProducto(producto, '¿Cuánto cuesta Love Spell?');
  assert.equal(contexto.precio_cop, 60000);
  assert.equal(contexto.modo_uso, undefined);
  assert.equal(contexto.resumen_asesor, undefined);
});
