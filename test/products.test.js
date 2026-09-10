import test from 'node:test';
import assert from 'node:assert/strict';
import {
  construirContextoProducto,
  detectarTema,
  detectarNecesidad,
  fichaApta,
  seleccionarProducto,
  seleccionarPorNecesidad,
} from '../src/products.js';
import { indiceOpcion } from '../src/product-memory.js';

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
  {
    id: '4',
    name: 'Thermogenic Fat Burner',
    sku: 'FIT-1',
    brand: 'Marca',
    category: 'Suplementos',
    presentation: '60 cápsulas',
    keywords: ['quemador de grasa', 'control de peso', 'metabolismo'],
    purpose: 'Apoyo diurno para el metabolismo.',
  },
  {
    id: '5',
    name: 'Nighttime Weight Loss',
    sku: 'FIT-2',
    brand: 'Marca',
    category: 'Suplementos',
    presentation: '30 cápsulas',
    keywords: ['nighttime fat burner', 'control de peso'],
    purpose: 'Complemento nocturno.',
  },
  {
    id: '6',
    name: 'Multivitamínico general',
    sku: 'VIT-1',
    brand: 'Marca',
    category: 'Suplementos',
    presentation: '30 cápsulas',
    keywords: ['metabolismo'],
    purpose: 'Apoyo nutricional general.',
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

test('reconoce bajar de peso como una busqueda por necesidad', () => {
  assert.equal(detectarNecesidad('¿Qué tiene para bajar de peso?')?.id, 'control_peso');
  const resultado = seleccionarPorNecesidad(catalogo, '¿Qué tiene para bajar de peso?');
  assert.equal(resultado.estado, 'encontrados');
  assert.deepEqual(resultado.candidatos.map((p) => p.id), ['4', '5']);
});

test('interpreta la seleccion ordinal de una lista recordada', () => {
  assert.equal(indiceOpcion('Me interesa el segundo'), 1);
  assert.equal(indiceOpcion('La opción 1'), 0);
  assert.equal(indiceOpcion('No sé cuál'), -1);
});
