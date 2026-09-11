import test from 'node:test';
import assert from 'node:assert/strict';
import {
  construirContextoProducto,
  construirContextoComparacion,
  detectarTema,
  detectarNecesidad,
  fichaApta,
  normalizarBusqueda,
  puntuarProducto,
  seleccionarProducto,
  seleccionarProductosCoincidentes,
  seleccionarPorNecesidad,
  respuestaComparacionProductos,
  respuestaProductosPorNecesidad,
  respuestaListaProductos,
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

test('una consulta compuesta no devuelve productos que solo coinciden con el formato generico', () => {
  const productos = [
    {
      id: 'apple',
      name: 'Organic Apple Cider Vinegar Gummies',
      brand: 'Nature Health',
      keywords: ['gomitas de vinagre de manzana', 'apple cider vinegar'],
    },
    {
      id: 'weight',
      name: 'Thermogenic Fat Burner Gummies',
      brand: 'Fit Labs',
      keywords: ['gomitas para control de peso'],
    },
    {
      id: 'women',
      name: 'MultiGummies for Women',
      brand: 'Daily Health',
      keywords: ['gomitas multivitamínicas'],
    },
  ];

  const resultado = seleccionarProductosCoincidentes(
    productos,
    '¿Tienen gomitas de vinagre de manzana y a qué precio?',
  );

  assert.deepEqual(resultado.map((producto) => producto.id), ['apple']);

  const seleccion = seleccionarProducto(
    productos,
    '¿Tienen gomitas de vinagre de manzana y a qué precio?',
  );
  assert.equal(seleccion.estado, 'encontrado');
  assert.equal(seleccion.producto.id, 'apple');
});

test('encuentra una referencia aunque el cliente escriba varias palabras con errores', () => {
  const productos = [
    {
      id: 'apple',
      name: 'Organic Apple Cider Vinegar Gummies',
      keywords: ['gomitas de vinagre de manzana'],
    },
    {
      id: 'women',
      name: 'MultiGummies for Women',
      keywords: ['gomitas multivitamínicas'],
    },
  ];

  const resultado = seleccionarProducto(
    productos,
    '¿Tienen gomitaz de binagre de mansana?',
  );

  assert.equal(resultado.estado, 'encontrado');
  assert.equal(resultado.producto.id, 'apple');
  assert.deepEqual(
    detectarTema('¿A ke presio tienen las gomitaz de binagre de mansana?'),
    ['precio'],
  );
  assert.deepEqual(detectarTema('¿Para ke sirbe?'), ['beneficios']);
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

test('reconoce una pregunta de preparación como uso del producto', () => {
  assert.deepEqual(detectarTema('¿Cómo se prepara?'), ['uso']);
});

test('usa live_ready cuando la preparación verificada no está en usage_mode', () => {
  const producto = {
    id: '1', name: 'MaxCalm', full_answer: {}, usage_mode: '',
    live_ready: ['Disuelve dos cucharaditas en agua caliente y completa con agua al gusto.'],
    claims_allowed: [], claims_forbidden: [],
  };
  const { contexto } = construirContextoProducto(producto, '¿Cómo se prepara?');
  assert.deepEqual(contexto.respuestas_verificadas, producto.live_ready);
});

test('para qué sirve prioriza propósito y beneficio principal', () => {
  const producto = {
    id: '1', name: 'MaxCalm',
    purpose: 'Apoyo para la relajación, la calma ante el estrés ocasional y el descanso nocturno.',
    benefits: [
      { rank: 2, claim: 'Ayuda a mantener el tránsito intestinal fluido.' },
      { rank: 1, claim: 'El magnesio participa en el funcionamiento normal de músculos y sistema nervioso.' },
    ],
    full_answer: {
      what_for: 'Se disuelve en agua.',
      benefits: 'Ayuda al tránsito intestinal.',
    },
    claims_allowed: [], claims_forbidden: [],
  };
  const { contexto } = construirContextoProducto(producto, '¿Para qué sirve?');
  assert.match(contexto.proposito_principal, /relajación/);
  assert.match(contexto.beneficio_principal, /funcionamiento normal/);
  assert.equal(contexto.para_que, undefined);
  assert.equal(contexto.beneficios, undefined);
});

test('construye una comparacion de varias fichas verificadas', () => {
  const productos = [
    {
      id: '1', name: 'MaxCalm saborizado', presentation: '16 oz', price_cop: 145600,
      full_answer: { different: 'Sabor frambuesa-limón.' }, claims_allowed: [], claims_forbidden: [],
    },
    {
      id: '2', name: 'MaxCalm sin sabor', presentation: '16 oz', price_cop: 143260,
      full_answer: { different: 'Presentación neutra sin sabor.' }, claims_allowed: [], claims_forbidden: [],
    },
  ];
  assert.deepEqual(detectarTema('¿Qué diferencias tienen?'), ['diferencias']);
  const contexto = construirContextoComparacion(productos, '¿Qué diferencias tienen?');
  assert.equal(contexto.length, 2);
  assert.equal(contexto[0].precio_venta_cop, 145600);
  assert.match(contexto[1].diferencia, /sin sabor/);
});

test('responde comparaciones solo con diferencias y precios de las fichas', () => {
  const respuesta = respuestaComparacionProductos([
    {
      name: 'MaxCalm saborizado', price_cop: 145600,
      full_answer: { different: 'Sabor frambuesa-limón y mezcla de citrato y glicinato.' },
    },
    {
      name: 'MaxCalm sin sabor', price_cop: 143260,
      full_answer: { different: 'Presentación neutra sin sabor y mezcla de citrato y glicinato.' },
    },
  ]);
  assert.match(respuesta, /sabor a frambuesa-limón/i);
  assert.match(respuesta, /no tiene sabor/i);
  assert.match(respuesta, /145[\.\s]600/);
  assert.match(respuesta, /143[\.\s]260/);
});

test('resume como asesora cuando la diferencia principal es el sabor', () => {
  const respuesta = respuestaComparacionProductos([
    {
      name: 'MaxCalm Magnesium Glycinate Drink Mix', presentation: '16 oz', price_cop: 145600,
      full_answer: { different: 'Frasco frambuesa-limón de 16 onzas; combina citrato y glicinato.' },
    },
    {
      name: 'MaxCalm Powder Unflavored', presentation: '16 oz', price_cop: 143260,
      full_answer: { different: 'Frasco sin sabor de 16 onzas; combina citrato y glicinato.' },
    },
  ]);
  assert.match(respuesta, /^Claro, mira: la diferencia principal entre estos dos es el sabor\./);
  assert.match(respuesta, /tiene sabor a frambuesa-limón/);
  assert.match(respuesta, /no tiene sabor/);
  assert.match(respuesta, /Ambos combinan citrato y glicinato/);
  assert.doesNotMatch(respuesta, /registradas en sus fichas/);
});

test('reconoce bajar de peso como una busqueda por necesidad', () => {
  assert.equal(detectarNecesidad('¿Qué tiene para bajar de peso?')?.id, 'control_peso');
  const resultado = seleccionarPorNecesidad(catalogo, '¿Qué tiene para bajar de peso?');
  assert.equal(resultado.estado, 'encontrados');
  assert.deepEqual(resultado.candidatos.map((p) => p.id), ['4', '5']);
});

test('la búsqueda por necesidad muestra solo nombres y precios totales', () => {
  const respuesta = respuestaProductosPorNecesidad(
    { id: 'control_peso', etiqueta: 'el control de peso' },
    [
      { name: 'Nighttime Weight Loss', price_cop: 84100, claims_allowed: ['Dato que no debe mostrarse'] },
      { name: 'Thermogenic Fat Burner', price_cop: 137590, presentation: '60 cápsulas' },
    ],
  );
  assert.equal(respuesta, [
    'Claro, tenemos estas opciones:',
    '• *Nighttime Weight Loss* — $ 84.100.',
    '• *Thermogenic Fat Burner* — $ 137.590.',
    '¿Cuál te interesa?',
  ].join('\n'));
  assert.doesNotMatch(respuesta, /por toma|ingrediente|complemento|garantiza/i);
});

test('interpreta la seleccion ordinal de una lista recordada', () => {
  assert.equal(indiceOpcion('Me interesa el segundo'), 1);
  assert.equal(indiceOpcion('La opción 1'), 0);
  assert.equal(indiceOpcion('No sé cuál'), -1);
  assert.equal(indiceOpcion('El cuarto'), 3);
  assert.equal(indiceOpcion('La opción 10'), 9);
});

test('encuentra productos por componentes de active_ingredients', () => {
  const producto = {
    name: 'Suplemento nocturno',
    active_ingredients: [{ name: 'Glicinato de magnesio', amount: '200 mg' }],
  };
  const resultado = puntuarProducto(producto, 'Y glicinato de magnesio?');
  assert.ok(resultado.score >= 70);
});

test('normaliza variantes frecuentes de ashwagandha', () => {
  assert.equal(normalizarBusqueda('¿Y ashawanda?'), 'y ashwagandha');
  const resultado = puntuarProducto(
    { name: 'Ashwagandha Root Extract', keywords: ['ashwagandha'] },
    '¿Y ashawanda?',
  );
  assert.ok(resultado.score >= 70);
});

test('presenta una lista de productos sin enviar al asesor', () => {
  const respuesta = respuestaListaProductos([
    { ...catalogo[3], price_cop: 145600 },
    { ...catalogo[4], price_cop: 143260 },
  ]);
  assert.match(respuesta, /Claro, manejamos estas opciones/);
  assert.match(respuesta, /Thermogenic Fat Burner/);
  assert.match(respuesta, /Nighttime Weight Loss/);
  assert.match(respuesta, /145[\.\s]600/);
  assert.match(respuesta, /143[\.\s]260/);
  assert.match(respuesta, /Cuál deseas conocer mejor/);
});

test('normaliza maxcalms en plural para encontrar todas las referencias', () => {
  const referencias = [
    { name: 'Natural Vitality MAXCALM Powder Unflavored', keywords: ['MaxCalm Natural Vitality'] },
    { name: 'Natural Vitality MaxCalm Magnesium Glycinate', keywords: ['Maxcalm'] },
  ];
  const puntajes = referencias.map((producto) => puntuarProducto(producto, '¿Cuáles maxcalms tienes?').score);
  assert.ok(puntajes.every((puntaje) => puntaje >= 60));
});

test('lista todas las referencias restringidas sin ofrecerlas para venta', () => {
  const productos = [
    {
      name: 'MAXCALM Unflavored', presentation: '16 oz',
      claims_allowed: ['Producto con Alerta Sanitaria No. 260-2026 del INVIMA'],
      full_answer: { commercial: 'No se vende en Colombia.' },
    },
    {
      name: 'MAXCALM Relaxing Drink Mix', presentation: '16 oz',
      full_answer: { what_for: 'Esta referencia no se ofrece en Colombia.' },
    },
  ];
  const respuesta = respuestaListaProductos(productos);
  assert.match(respuesta, /En nuestra base aparecen estas referencias/);
  assert.match(respuesta, /MAXCALM Unflavored/);
  assert.match(respuesta, /MAXCALM Relaxing Drink Mix/);
  assert.match(respuesta, /no están disponibles para venta en Colombia/);
  assert.doesNotMatch(respuesta, /Cuál deseas conocer mejor/);
});
