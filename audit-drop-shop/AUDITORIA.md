# Auditoría integral de Drop Shop

Fecha de observación: 8 de septiembre de 2026  
Storefront: https://drop-shop-g7.myshopify.com/  
Mercado y moneda observados: Colombia / COP

## Veredicto

**NO-GO para escalar tráfico frío de TikTok.** La tienda sí permite descubrir, agregar y llegar a un checkout funcional, pero hoy combina riesgo legal objetivo, productos sanitariamente sensibles sin evidencia colombiana visible, catálogo con 51 % de agotados, precios de $0, ausencia de instrumentación TikTok/GA4 verificable y un LCP móvil de 4,9 s.

El veredicto estricto del protocolo UX es **INCOMPLETE**: no se completó una compra ni se enviaron formularios que notifican a terceros; tampoco se alcanzó la cobertura exigida por ruta de capturas, consola/red, axe, escenarios ni medición INP. El veredicto comercial es **FAIL / NO-GO** porque los hallazgos P0 ya comprobados bastan para impedir el escalamiento.

**Persona lock de la prueba:** compradora nueva llegada desde TikTok, 25–40 años, móvil, con baja confianza inicial y una intención rápida/impulsiva. Se mantuvo esta perspectiva en búsqueda, PDP, carrito y checkout.

### Top 5 de bloqueo comercial

1. Identidad legal, enlace SIC y texto de retracto incompletos/desactualizados.
2. Productos sanitariamente sensibles sin evidencia INVIMA visible.
3. Catálogo con 32/63 agotados y cuatro precios de $0.
4. Medición TikTok/GA4 y deduplicación de Purchase no verificables.
5. PDP con accesibilidad crítica y LCP móvil de 4,91 s.

### Alcance realmente verificado

- Navegación real en Chrome headless de home, búsqueda, colección, PDP disponible, PDP agotada, carrito y comienzo de checkout.
- Responsive observado en 320, 375, 390, 430, 768 y 1440 px.
- 19 rutas sometidas a axe-core: home, 11 colecciones, 4 páginas, 2 PDP y carrito.
- Lighthouse reproducible en home, móvil y desktop.
- Barrido de los **63 productos públicos** mediante `/products.json`, sitemap y las 63 PDP. El storefront y sitemap exponen 63, no 140. Los otros 77 son **NOT VERIFIED**: podrían estar archivados, en borrador o haber sido una cifra histórica.
- Matriz fuente: `catalogo-publico-63.csv` y `catalogo-publico-63.json`.
- Revisión del repositorio disponible. No es el theme: contiene un servicio Express de webhooks WhatsApp/Telegram. Liquid, secciones, snippets, metafields, metaobjects, configuración de apps y checkout extensibility son **NOT VERIFIED** en código fuente.
- No se realizaron pruebas intrusivas ni se completó una compra.

## 1. Executive summary — los 19 hallazgos que importan

1. **P0 — identificación legal ausente.** No se muestra razón social, NIT ni dirección de notificación judicial. La Ley 1480, art. 50, exige esos datos a proveedores de comercio electrónico.
2. **P0 — política de retracto desactualizada.** La página promete devolver el dinero dentro de 30 días calendario después de ejercido el retracto; la Ley 2439 de 2024 redujo ese plazo máximo de devolución a 15 días calendario para comercio electrónico. La página afirma estar actualizada el 18/09/2025, cuando el cambio ya estaba vigente.
3. **P0 — falta el enlace visible a la SIC.** La política dice que el comprador “puede acudir” a la SIC, pero no ofrece el enlace visible y fácilmente identificable exigido tras la Ley 2439 de 2024.
4. **P0 — dos medicamentos sensibles.** Differin/adapaleno y Lumify/brimonidina se venden con claims terapéuticos apoyados en FDA/fabricante, sin número ni estado de registro INVIMA visible. Pausar venta y pauta hasta revisión documental.
5. **P0 — otros dos productos de riesgo.** DABALASH declara un análogo de prostaglandinas y restricciones de embarazo; Colgate hace claims de caries, gingivitis, sensibilidad y periodontitis basados en FDA. Requieren revisión sanitaria colombiana antes de pauta.
6. **P1 — cuatro productos públicos muestran $0.** Aunque están agotados, el catálogo muestra precio cero y las URLs son indexables; esto degrada confianza, feeds, schema y retargeting.
7. **P1 — no existe dominio comercial propio.** Toda la experiencia y los canonicals usan `drop-shop-g7.myshopify.com`. La percepción de provisionalidad en tráfico frío es una inferencia de auditoría; objetivamente, limita la autoridad de marca y la memorabilidad.
8. **P0 — catálogo dominado por agotados.** 32 de 63 productos no están disponibles. `/collections/all` ordena alfabéticamente y abre con un producto agotado; aparecen varios agotados antes de productos comprables.
9. **P0 — analítica de adquisición no verificable.** Se observó Shopify Analytics y dos web pixels genéricos, pero ningún request o identificador de GA4, GTM, TikTok Pixel o Meta Pixel. TikTok Events API, deduplicación y Purchase son **NOT VERIFIED**.
10. **P0 — accesibilidad crítica en PDP.** axe detectó `aria-allowed-attr` crítico en seis controles del carrusel y un sticky ATC sin nombre accesible; varias rutas tienen regiones desplazables sin teclado y contraste serio.
11. **P0 — mobile no cumple performance objetivo.** Lighthouse móvil: 71/100, FCP 3,94 s, LCP 4,91 s, TBT 58,5 ms, CLS 0, TTI 9,92 s. LCP incumple tanto el objetivo de 2,5 s como el hard gate pragmático de 4 s. Además, transfirió 2,78 MB en 268 requests; Shopify Forms aportó 259 KB con ~95 % sin uso en el recorrido.
12. **P1 — popup demasiado temprano.** En catálogo apareció antes de poder evaluar productos y cubrió casi toda la pantalla de 390 px. Para TikTok frío interrumpe la intención en lugar de capturarla.
13. **P1 — confianza afirmada, no demostrada.** “Importamos directo”, “cada unidad llega con su sello intacto”, “orgánico certificado USDA”, “100 % puro” y “libre de hexano” no se acompañan de evidencia accesible. El producto “open Box” contradice la promesa absoluta de sello intacto.
14. **P1 — entrega y pagos se esconden hasta checkout.** La FAQ no da rango de entrega ni enumera medios; solo en checkout se comprobó Standard gratis y Wompi +4. La PDP no resuelve estas objeciones cerca del ATC.
15. **P1 — carrito parcialmente sin traducir.** La página muestra “Cart”, “You may also like” y “View all” junto a contenido en español.
16. **P1 — búsqueda sin estrategia de recuperación.** “magnesio” devuelve cero resultados y luego productos no relacionados; esto parece error, no alternativa útil. Actualmente no hay suplementos públicos.
17. **P1 — no hay prueba social verificable.** No se observaron reviews, UGC, compradores verificados, cifras auditables ni evidencia de entrega. No se recomienda inventarlas: primero hay que construir el sistema de recolección.
18. **P1 — ALT de catálogo sin administrar.** Los 343 registros de imagen en el endpoint público tienen ALT nulo; el theme genera fallback para algunas vistas y en home expone códigos internos como “BelOrd-217 | principal”.
19. **P1 — el repositorio auxiliar tiene deuda de seguridad.** `npm audit` reportó 3 vulnerabilidades moderadas; la validación de firma de Meta y el secreto de `/notify` son opcionales, se admite secreto por query string/GET, no hay rate limit ni idempotencia y los medios se cargan completos en memoria.

## 2. Qué está bien y debe conservarse

- La home responde en menos de cinco segundos qué vende: belleza y cuidado personal. El hero tiene un CTA único y visible.
- “Envíos a toda Colombia” y WhatsApp aparecen por encima del pliegue.
- La dirección visual es distintiva y consistente: paleta berry/crema, fotografía de producto y tipografía editorial. En 1440 y 390 px la jerarquía del hero funciona.
- La marca evita promesas milagro en la home y la página “Quiénes somos” declara: “No vendemos una transformación”. Es una base de copy responsable.
- Las PDP observadas tienen 5–6 imágenes, precio claro, selector de cantidad, ATC, buy now, modo de uso, advertencias y WhatsApp.
- Los ocho productos de “Más vendidos” estaban disponibles durante el barrido; esa colección sí prioriza capacidad de compra.
- Las 63 PDP tienen canonical, meta description, Product schema, Availability schema y SKU.
- Checkout: Colombia preseleccionado, envío Standard gratis, total en COP, Wompi visible y políticas enlazadas.
- Header seguro: HSTS, `X-Frame-Options: DENY`, CSP con `frame-ancestors 'none'` y `X-Content-Type-Options: nosniff`.
- Hay skip link, labels en formularios y la home obtuvo 100 en la corrida automatizada de Lighthouse Accessibility. Eso no neutraliza los fallos de PDP, pero demuestra una base aprovechable.
- La política distingue retracto de garantía y explica reversión de pago, productos dañados y canales de PQR. Debe corregirse, no eliminarse.

## 3–5. Qué está mal, qué falta y qué eliminaría

### Qué está mal

- Legal: identidad incompleta, devolución del dinero tras retracto indicada en 30 días, enlace SIC ausente y promoción “Días del Sí — agosto 2025” todavía publicada en septiembre de 2026.
- Catálogo: agotados arriba, $0, duplicados y mezcla de cosméticos con medicamentos.
- Funnel: no hay landing TikTok, no hay message match por campaña y el popup aparece antes de que exista confianza.
- Confianza: las afirmaciones de importación/originalidad no tienen evidencia visible ni sujeto jurídico responsable.
- UX: traducciones rotas, resultados de búsqueda irrelevantes y tablet 768 con gran vacío vertical antes del mensaje principal.
- Técnica: error CSP al intentar embeber Shop Pay, 403 asociado; en checkout apareció además un 401 de `private_access_tokens` en la sesión automatizada. Verificar en Chrome real y eliminar ruido si no afecta funcionalidad.

### Qué falta

- Razón social, NIT, domicilio y dirección de notificación, teléfono, email de dominio propio y responsable de datos.
- Enlace visible a la SIC.
- Registros/NSO/condición de venta y trazabilidad de importador para productos regulados.
- Rango de preparación y entrega por zona, transportadores y medios de pago antes del ATC.
- Evidencia de originalidad: política documental, fotos reales de lote, importador/titular y proceso de validación sin revelar datos sensibles.
- Reviews verificadas/UGC con consentimiento, no testimonios fabricados.
- GA4, TikTok Pixel + Events API y taxonomía UTM comprobables.
- Landings con message match, bundles reales y segmentación por necesidad.
- Consentimiento de marketing y tratamiento de datos explícito, granular y demostrable en newsletter/contacto.

### Qué eliminaría o pausaría

- Pausar Differin, Lumify, DABALASH y Colgate de TikTok y de posiciones premium hasta revisión sanitaria.
- Despublicar/corregir los cuatro productos de $0.
- Desindexar o eliminar las colecciones vacías `pepas`, `comida-para-animales`, `asset-pack-12758679554-example-products` y `ofertas`; revisar también `frontpage` (1 producto agotado).
- Retirar la promoción de agosto de 2025 de la página legal.
- Quitar el CTA mayorista de las PDP usadas como destino TikTok; mantener el mayorista en una ruta separada.
- Suprimir el popup inmediato; reactivarlo tras intención (p. ej. segundo PDP, 45–60 s o exit intent en desktop) y limitar frecuencia.
- Reescribir cualquier afirmación absoluta de sello/originalidad que no pueda probarse para cada unidad.

## Scorecard

| Área | Score | Justificación |
|---|---:|---|
| CRO | 51/100 | Hero y ATC claros; confianza, popup, entrega, social proof y catálogo reducen conversión. |
| UX/UI mobile | 56/100 | 390/430 funciona; popup invasivo, 768 débil, búsqueda y traducción fallan. |
| TikTok funnel | 24/100 | No hay landings/message match ni medición TikTok verificable. |
| PDP | 54/100 | Buenas imágenes y controles; falta prueba, logística, regulación y accesibilidad. |
| Copy | 60/100 | Voz de marca clara; errores, claims no probados y lenguaje FDA reducen rigor. |
| Trust | 35/100 | Se entiende la oferta, pero no quién responde legalmente ni cómo prueba autenticidad. |
| Compliance sanitario | 25/100 | Cosméticos/medicamentos mezclados y cuatro productos sensibles. Suplementos: **NOT VERIFIED** porque no hay ninguno público. |
| Compliance e-commerce | 30/100 | Hay política y PQR; faltan identidad/SIC y el plazo de retracto es incorrecto. |
| Merchandising | 28/100 | Más vendidos bien; 51 % agotado, $0, duplicados y colección general alfabética. |
| SEO | 57/100 | Canonicals/schema/sitemap bien; sin dominio propio, home sin description y colecciones basura. |
| Performance | 62/100 | Desktop 95 y CLS 0; mobile LCP 4,9 s/71 y 268 requests. |
| Shopify Technical | **NOT VERIFIED** | No hay theme Shopify en el repositorio disponible. |
| Analytics | 18/100 | Solo Shopify observado; GA4/TikTok/Meta y deduplicación no verificables. |
| Accessibility | 30/100 | Home fuerte, pero PDP con violaciones críticas y colecciones con fallos serios. |
| Security | 48/100 | Perímetro Shopify sólido; errores de integración y webhook auxiliar sin hardening. |
| CRM | 22/100 | Newsletter/descuento visibles; automatizaciones, consentimiento y retención no verificables. |

**Score general: 40/100**, promedio simple de las 15 áreas puntuables. Shopify Technical se excluye por falta de fuente.

## Priorización cuantitativa

`Priority score = Impacto × Confianza / Esfuerzo`.

| Orden | Hallazgo | Clase | I | E | C | Score |
|---:|---|---|---:|---:|---:|---:|
| 1 | Identidad legal/NIT/dirección ausentes | P0 | 5 | 1 | 5 | 25,0 |
| 2 | Reembolso tras retracto: política 30 días vs. máximo legal 15 | P0 | 5 | 1 | 5 | 25,0 |
| 3 | Cuatro productos $0 públicos | P1 | 5 | 1 | 5 | 25,0 |
| 4 | Enlace visible a SIC ausente | P0 | 5 | 1 | 5 | 25,0 |
| 5 | Popup cubre catálogo antes de generar confianza | P1 | 4 | 1 | 5 | 20,0 |
| 6 | Promoción agosto 2025 aún publicada | P1 | 4 | 1 | 5 | 20,0 |
| 7 | Carrito con textos en inglés | P1 | 4 | 1 | 5 | 20,0 |
| 8 | Claims absolutos sin evidencia visible | P0 | 5 | 1 | 3 | 15,0 |
| 9 | Differin/Lumify sin evidencia INVIMA visible | P0 | 5 | 2 | 5 | 12,5 |
| 10 | 32/63 agotados y colección abre con agotado | P0 | 5 | 2 | 5 | 12,5 |
| 11 | Dominio `myshopify.com` como dominio público | P1 | 5 | 2 | 5 | 12,5 |
| 12 | Violaciones axe críticas en PDP | P0 | 4 | 2 | 5 | 10,0 |
| 13 | DABALASH/Colgate requieren revisión sanitaria | P0 | 5 | 2 | 4 | 10,0 |
| 14 | No hay prueba social verificable | P1 | 5 | 2 | 4 | 10,0 |
| 15 | LCP móvil 4,91 s | P0 | 5 | 3 | 5 | 8,3 |
| 16 | Entrega y pagos solo claros en checkout | P1 | 4 | 2 | 4 | 8,0 |
| 17 | GA4/TikTok no observados | P0 | 5 | 3 | 4 | 6,7 |
| 18 | 343 imágenes sin ALT de catálogo | P1 | 3 | 2 | 4 | 6,0 |
| 19 | Búsqueda cero muestra productos irrelevantes | P1 | 3 | 2 | 4 | 6,0 |
| 20 | Webhook sin hardening e idempotencia | P1 | 4 | 3 | 4 | 5,3 |

## 6. Auditoría por experto

1. **CRO:** existe claridad inicial, pero la oferta pierde impulso al entrar a un catálogo agotado y una capa de email. La prioridad no es rediseñar el hero: es sanear inventario, prueba y objeciones.
2. **UX/UI mobile:** 390/430 conserva jerarquía y CTA. A 320 el hero queda muy apretado; a 768 aparece un vacío vertical importante. El popup domina el viewport y el WhatsApp flotante compite con controles.
3. **TikTok Social Commerce:** falta un destino por video/ángulo. Enviar tráfico a home o `/collections/all` causa fuga, catálogo irrelevante y exposición de productos regulados.
4. **Direct response copy:** “Lo bueno para ti, sin postureo” es memorable, pero necesita una línea probatoria: quién importa, cuánto tarda, cómo se valida y qué garantía concreta existe.
5. **Compliance sanitario colombiano:** no hay suplementos públicos; no aplicar reglas de suplementos a cosméticos. Differin/Lumify son el riesgo máximo; DABALASH/Colgate requieren clasificación documental. FDA no sustituye INVIMA.
6. **Protección al consumidor Colombia:** corregir identidad, SIC y plazo de devolución del dinero tras ejercer el retracto antes de captar tráfico. **LEGAL REVIEW REQUIRED.**
7. **Shopify developer:** storefront parece theme 8 con componentes modernos, pero no se entregó código. Hay doble footer/landmarks, traducciones incompletas, web pixels opacos y Forms global pesado.
8. **Web performance:** el problema móvil es red/critical path, no TBT. Optimizar hero/carrousel, fuentes, Forms y Shop account antes de micro-optimizar JS propio.
9. **SEO técnico:** canonicals y Product schema pasan; el dominio, meta de home, empty collections y taxonomía dañan indexación/calidad.
10. **Merchandising:** `/collections/all` no debe ser la principal PLP. Ordenar disponibles por margen/ventas/creatividad TikTok; mandar agotados al final con waitlist real.
11. **Analytics:** Shopify emite eventos estándar, pero no hay destino publicitario verificable ni evento WhatsApp. No escalar sin prueba end-to-end de eventos.
12. **CRM/retention:** el incentivo existe; faltan welcome, browse/cart abandon, postcompra, replenishment y solicitud de review con consentimiento.
13. **Accesibilidad:** las PDP fallan el hard gate por ARIA crítico; carruseles y product cards desplazables no son operables por teclado.
14. **Seguridad:** Shopify protege infraestructura; apps/pixels y webhook son la superficie propia. Hacer obligatorios los secretos, limitar payloads, rate-limit e idempotencia.
15. **Marca/trust:** buena estética y tono, débil identidad empresarial. Un Gmail genérico y un dominio Shopify hacen más daño que la falta de otro badge.
16. **Psicología del consumidor:** el comprador frío busca reducción de riesgo. La tienda pide email antes de explicar evidencia, tiempos, pago y responsable.
17. **Red team:** el sitio parece vendible hasta que se revisa quién responde, qué está disponible y por qué confiar en claims/origen. El mayor riesgo es una apariencia pulida sobre evidencia incompleta.

## 7. Matriz de productos

La matriz completa contiene 63 filas y campos de handle, URL, título, vendor, categoría, tipo, colecciones, stock, precios, compare-at, $0, duplicados, imágenes, ALT, descripción, ingredientes, Supplement Facts, porción, cantidad, uso, advertencias, contraindicaciones, claims, meta/OG, canonical, JSON-LD/Product/availability schema, GTIN, SKU, relacionados y clasificación regulatoria.

Hallazgos agregados:

- 63 productos públicos y 63 URLs de producto en sitemap; no 140.
- 31 disponibles / 32 agotados.
- 4 con precio $0, todos agotados.
- 2 filas con título exacto duplicado: dos “Cepillo dental Electrico Phillips Sonicare 4100”, a $346.900 y $293.997.
- 343 imágenes de catálogo; ninguna sin imagen principal, pero los 343 ALT fuente vienen nulos. El theme hace fallback parcial.
- 61/63 no contienen un bloque explícito de ingredientes; 51/63 no contienen advertencias detectables; 57/63 no contienen contraindicaciones detectables. En cosméticos no todo campo es obligatorio de la misma forma, pero para productos sensibles la omisión es crítica.
- 63/63 tienen Product y availability schema; 63/63 tienen SKU; 0/63 tienen GTIN/UPC público.
- 52 SAFE, 7 REVIEW, 2 HIGH RISK y 2 REMOVE / REWRITE después de clasificación contextual.

### 15 PDP representativas revisadas

| Producto | Selección | Diagnóstico |
|---|---|---|
| Ácido azelaico The Ordinary | best seller/disponible | Compra funciona; falta entrega/pagos/prueba cerca del ATC. |
| Ácido salicílico The Ordinary | best seller | Copy comercial prudente; corregir acentos/título. |
| Aceite de ricino Majestic Pure | agotado/claim | USDA/100 % puro/libre de hexano sin evidencia visible. |
| Differin adapaleno | medicamento | REMOVE/REWRITE y pausar hasta INVIMA. |
| Lumify brimonidina | medicamento | REMOVE/REWRITE y pausar hasta INVIMA. |
| DABALASH | cosmético sensible | HIGH RISK por análogo de prostaglandinas/embarazo. |
| Colgate Total 24 horas | higiene oral sensible | HIGH RISK por claims terapéuticos basados en FDA. |
| Pure Vitamin C10 | facial/disponible | REVIEW de antioxidante/función de ingredientes. |
| Sérum pestañas The Ordinary | claim de crecimiento | Reescribir título salvo soporte autorizado. |
| Protector solar Neutrogena SPF45 | solar | Validar NSO, SPF/rotulado y responsable colombiano. |
| Cepillo Revlon +15 % | promoción | Compare-at correcto; falta condición/duración de promo visible. |
| Sonicare 4100 x2 | duplicado | Resolver color/modelo y diferencia de precio. |
| Cabezal Revlon open box | $0/agotado | Contradice “sello intacto”; despublicar o política open-box separada. |
| Cabezales Sonicare C2 | $0/agotado | Corregir precio/feed/schema. |
| Fixodent Extra Hold | higiene oral | Validar categoría, instrucciones/advertencias y autorización aplicable. |

Archivos: `catalogo-publico-63.csv`, `catalogo-publico-63.json`, `matriz-claims.csv`, `inventario-rutas.json`.

## 8. P0 — antes de TikTok

1. Corregir la página legal con abogado colombiano: identidad completa, enlace SIC y devolución a 15 días. **LEGAL REVIEW REQUIRED.**
2. Pausar cuatro productos sensibles y obtener registro/NSO, titular/importador, condición de venta y copy aprobado.
3. Corregir/despublicar $0 y eliminar agotados de posiciones/feeds; disponibles primero.
4. Configurar dominio propio y email del dominio.
5. Instrumentar y probar GA4 + TikTok Pixel/Events API desde ViewContent hasta Purchase sin duplicación.
6. Reparar ARIA crítico de PDP y keyboard access de carruseles.
7. Reducir LCP móvil a ≤2,5 s.
8. Sustituir claims absolutos por evidencia verificable o lenguaje limitado.

## 9–10. P1 y P2

### P1 — conversión y confianza

- Mostrar en PDP: envío estimado, costo/gratis, Wompi/medios, garantía y autenticidad documentada.
- Retrasar popup y aplicar frequency cap.
- Traducir carrito por completo.
- Reviews verificadas y UGC real con consentimiento.
- Mejorar zero-result search: categorías, corrección y contacto; nunca productos aleatorios sin rótulo.
- ALT descriptivos; no SKU/nombre de archivo.
- Separar mayorista del funnel B2C.
- Política de waitlist para agotados.

### P2 — SEO, contenido y refinamiento

- Meta description única para home y páginas `Quiénes somos`/`Contacto` (hoy su OG description es solo “Drop Shop”).
- Desindexar colecciones vacías y limpiar sitemap.
- Organization schema con razón social, contacto, dirección y `sameAs`; añadir WebSite/SearchAction y Breadcrumb donde aplique.
- Corregir títulos: “Phillipd”, “Phillips”, “Electrico”, “Acido”, dobles espacios, unidades “236(Mg)”, “1Fl Oz”, “Suga”, “Body Mist” como crema.
- Añadir contenido de colección útil, no SEO vacío.
- Resolver duplicados y establecer redirect 301 si se consolida URL.
- Completar GTIN/UPC cuando sea legítimo; no inventarlo.

## Auditoría de claims

La clasificación completa está en `matriz-claims.csv`.

- **SAFE (52):** sin término de alto riesgo en texto extraíble. SAFE no significa automáticamente autorizado; exige coincidencia con etiqueta/NSO.
- **REVIEW (7):** hipoalergénico, antioxidante, crecimiento de pestañas, tratamiento capilar/facial, USDA/100 % puro y embarazo en contexto cosmético.
- **HIGH RISK (2):** DABALASH y Colgate por composición/claims sensibles.
- **REMOVE / REWRITE (2):** Differin y Lumify hasta verificación INVIMA.
- **Suplementos:** ninguno público; Supplement Facts/porción no aplican a este catálogo. Crear landings “magnesio”, “descanso” o “multivitamínicos” sería engañoso hoy.
- **Mascotas/alimentos:** no hay productos en las colecciones públicas; las colecciones vacías deben salir de indexación.
- **Claims en imágenes:** se revisaron las piezas visibles de home y la muestra PDP. El OCR exhaustivo de las 343 imágenes no se pudo verificar; se requiere export original o Digital Asset Manager para cerrar este punto. **NOT VERIFIED**, no se asume ausencia.

## 11. Funnel TikTok recomendado

No usar la taxonomía de suplementos propuesta en el prompt mientras no existan productos públicos autorizados. Arquitectura basada en el catálogo real:

- `/pages/tiktok-belleza` — hub sin navegación secundaria; máximo 3 rutas.
- `/pages/tiktok-rostro` — creativo/landing por necesidad cosmética no terapéutica.
- `/pages/tiktok-cabello` — rutinas y herramientas.
- `/pages/tiktok-aromas` — Victoria's Secret/Bath & Body con autenticidad demostrada.
- `/pages/tiktok-higiene` — oral/grooming, excluyendo productos sensibles hasta compliance.
- `/pages/tiktok-ofertas` — solo inventario real, condiciones y vigencia.
- `/pages/tiktok-producto-[slug]` — advertorial corto para cada creativo ganador; no una landing genérica.

Flujo:

`Video (un problema/uso no médico) → landing con el mismo producto/visual/precio → 3 pruebas de confianza → demostración/uso → CTA sticky → PDP o ATC → carrito con entrega/pago → checkout`.

Reglas:

- Un creativo, un ángulo, una landing y un CTA principal.
- Ocultar navegación completa, mayorista, popup temprano y productos regulados.
- Mantener WhatsApp secundario y contextual con `product_id`, landing y UTM.
- No usar urgencia/escasez sin inventario y fecha reales.
- Mostrar precio, unidades, stock, entrega, pagos, devoluciones y responsable antes del primer CTA repetido.

## 12. Wireframe textual

### Home

1. Header compacto: logo, búsqueda, catálogo, ayuda, carrito.
2. Hero actual, conservando estética; añadir “Importador/responsable: [razón social] · Colombia” y link “Cómo verificamos”.
3. Barra probatoria: entrega estimada, pagos, garantía, soporte.
4. “Compra por necesidad” con cuatro categorías reales.
5. Más vendidos: solo disponibles, ATC rápido y rating solo si verificable.
6. Proceso de autenticidad con documentos/fotos reales.
7. UGC/reviews verificadas.
8. Rutina/educación actual.
9. FAQ logística/pago/devolución.
10. Newsletter después de valor; footer legal completo + SIC.

### Landing TikTok producto

1. Header mínimo: logo + carrito.
2. Above fold: mismo producto/visual del video, precio COP, disponibilidad, beneficio cosmético prudente, CTA.
3. Tres micropruebas: originalidad documentada, envío, pago/garantía.
4. Video demo subtitulado + instrucciones.
5. Qué incluye/cantidad/ingredientes/advertencias.
6. Evidencia real (reviews verificadas/UGC/licencias aplicables).
7. FAQ de cinco objeciones.
8. Sticky ATC accesible; WhatsApp secundario.
9. Footer legal compacto.

## Analytics recomendado

### Taxonomía UTM TikTok

- `utm_source=tiktok`
- `utm_medium=paid_social|organic_social|creator`
- `utm_campaign=co_{objective}_{category}_{offer}_{yyyymm}`
- `utm_content={creator}_{hook}_{format}_{creative_id}`
- `utm_term={audience_or_adgroup}`
- Persistir `ttclid` y UTMs first-touch/latest-touch en first-party storage y trasladarlos al pedido/metafield permitido.

### Contrato de eventos

| Evento | Campos mínimos |
|---|---|
| PageView | event_id, page_type, URL, UTMs |
| ViewItem/ViewContent | event_id, product_id, variant_id, SKU, value, COP |
| Search | query, result_count, event_id |
| ViewCollection | collection_id/handle, product_count |
| AddToCart/RemoveFromCart | product_id, variant_id, SKU, quantity, value, COP, event_id |
| ViewCart | items, value, COP |
| BeginCheckout | items, value, COP, event_id |
| AddPaymentInfo | payment_type genérico, value, COP |
| Purchase | order_id, items, value, tax, shipping, COP, event_id |
| WhatsAppClick | page, product_id, placement, UTMs |
| Contact/NewsletterSignup | form_id, consent_state, event_id; nunca PII en analytics |

Purchase debe emitirse una sola vez por `order_id`. Browser y Events API comparten `event_id`; validar deduplicación en TikTok Events Manager y GA4 DebugView. No marcar como completo hasta observar pedido de prueba y sus reintentos.

## 13. Roadmap de cuatro semanas

### Semana 1 — riesgo y catálogo

- Legal colombiano: identidad, enlace SIC y devolución del dinero tras retracto en máximo 15 días.
- Pausar productos sensibles; expediente por producto.
- Corregir $0, agotados, duplicados, títulos y colecciones vacías.
- Dominio/email propio.
- Instrumentación base y plan de QA de eventos.

### Semana 2 — PDP, accesibilidad y confianza

- Módulo de logística/pagos/garantía cerca del ATC.
- Evidencia de abastecimiento/originalidad.
- Corregir ARIA, keyboard, contraste, headings y doble footer.
- Traducir carrito y mejorar zero-results.
- Retrasar popup.

### Semana 3 — performance y TikTok

- Hero responsive por viewport; cargar solo slide activo.
- Reducir fuentes, Forms y Shop account no esenciales.
- Lanzar 2 landings piloto: rostro y aromas.
- TikTok Pixel/Events API, GA4 y dashboard de funnel.

### Semana 4 — prueba y optimización

- Compra real controlada y QA de Purchase/dedup/UTM.
- 5–10 creativos con message match; no escalar aún por ROAS de un día.
- Recolectar reviews postcompra verificadas.
- Tests: popup timing, logística junto al ATC, landing vs PDP; proteger margen/AOV.

## 14. Quick wins

- Ocultar $0 y ordenar disponibles primero.
- Corregir 30 → 15 días y añadir enlace SIC, tras revisión legal.
- Traducir tres textos del carrito.
- Cambiar popup de 2–3 s a intención/frequency cap.
- Añadir “Envío Standard gratis · Wompi” cerca del ATC si esas condiciones son universalmente ciertas; si no, mostrar condición exacta.
- Meta description de home.
- Retirar promo 2025.
- Reescribir “sello intacto” para contemplar explícitamente open box o eliminar open box.
- Despublicar empty collections.
- Corregir el nombre accesible del sticky ATC.

## 15. Backlog técnico

Ubicaciones Shopify son **sospechadas**, no verificadas, porque falta el theme:

- `layout/theme.liquid`: revisar carga global de Shopify Forms, account/shop pay, pixels, fuentes y CSP error.
- sección hero custom / `assets/dropshop.css`: `srcset/sizes`, slide activo eager, resto diferido, fix tablet 768.
- `snippets/product-card.liquid`: agotados, $0, ALT, contraste compare-at y carrusel accesible.
- `sections/main-product.liquid` o bloque custom: sticky ATC name, ARIA dots, trust/logística y mayorista condicional.
- `sections/main-cart.liquid` / locales `es.json`: “Cart”, “You may also like”, “View all”.
- footer custom (`#shopify-section-…__dropshop_pie`): un solo `contentinfo`; mover WhatsApp flotante fuera de footer landmark.
- template de información/acerca-de: identidad, SIC, retracto, promo histórica.
- Search template/predictive search: zero-result recommendations etiquetadas y relevantes.
- Shopify Customer Events: inventario de custom/app pixels, propietarios, consentimiento y eventos.
- Markets/domain: dominio primario y redirects.

Repositorio auxiliar:

- `src/server.js:21`: fallar cerrado si falta `WHATSAPP_APP_SECRET` en producción.
- `src/notify.js:62`: hacer obligatorio `NOTIFY_SECRET`; eliminar auth por query/GET.
- `src/server.js:13`: límites explícitos de JSON/form y rate limit.
- `src/server.js:45`: idempotencia por event/message id antes de responder 200.
- `src/whatsapp.js:17`: streaming y máximo de bytes antes de cargar media en memoria.
- `package-lock.json`: actualizar Express/qs; `npm audit` confirmó 3 moderadas.
- Añadir tests de firma, replay, payload grande, idempotencia y fallo Telegram.

## Performance audit

| Métrica | Mobile | Desktop | Objetivo |
|---|---:|---:|---:|
| Lighthouse Performance | 71 | 95 | — |
| FCP | 3,94 s | 1,14 s | <1,8 s recomendado |
| LCP | 4,91 s | 1,20 s | ≤2,5 s |
| CLS | 0 | 0 | ≤0,10 |
| TBT | 58,5 ms | 0 ms | proxy de laboratorio |
| TTI | 9,92 s | 1,20 s | — |
| Transferencia | 2,78 MB | 3,36 MB | reducir sin sacrificar CRO |
| INP | **NOT VERIFIED** | **NOT VERIFIED** | ≤200 ms |

Diagnóstico: TTFB fue 74 ms; el servidor no es el cuello de botella. El LCP es la imagen hero, correctamente discoverable/eager, pero el carrusel descarga piezas sobredimensionadas y se encadena con fuentes/Shop components. Lighthouse detectó 34,8 ms de forced reflow en código inline y un Forms bundle con ~245 KB sin uso.

## SEO técnico

- Primario/canonical: `drop-shop-g7.myshopify.com`; no se observó dominio propio.
- Home: sin meta description, SEO 92 Lighthouse.
- Productos: 63/63 canonical/meta/Product schema/availability/SKU presentes.
- GTIN/UPC: 0/63 público; completar solo desde fuente legítima.
- Organization schema: nombre/logo/URL, sin identidad jurídica/contacto/dirección/sameAs.
- Sitemap: 63 productos, 11 colecciones, 4 páginas; incluye cuatro colecciones basura/vacías.
- Robots: bloquea checkout/cart AJAX/facetas complejas; comportamiento Shopify razonable.
- 404 probada: devuelve HTTP 404. HTTP y dominio interno renombrado redirigen en una sola cadena al storefront observado.
- Handles de riesgo: Differin/adapaleno y Lumify/alivio. No se localizaron URLs históricas fuera del sitemap; redirects del Admin son **NOT VERIFIED**.

## Seguridad segura/no intrusiva

- Bien: TLS/Shopify, CSP, frame denial, HSTS, nosniff, firma HMAC con timing-safe cuando el secreto existe, escape HTML a Telegram.
- Riesgos: secrets opcionales, GET con token, dependencia vulnerable, ausencia de rate limit/idempotencia, media sin límite, PII reenviada a Telegram sin relación documentada en política.
- Apps/permisos: Shopify Forms, app pixel y custom pixel observados; permisos/OAuth/admin **NOT VERIFIED**.
- Secrets: no se hallaron valores reales en archivos versionados; `.env.example` contiene placeholders.

## Red team — siete abandonos

1. **Nuevo desde TikTok:** landing genérica, popup temprano, no encuentra el producto del video.
2. **Desconfiado:** no ve NIT/dirección/importador ni prueba de originalidad.
3. **Impulsivo:** ve agotados/$0 o espera hasta checkout para conocer entrega/pago.
4. **Compara precios:** duplicado Sonicare con dos precios sin explicación y descuentos sin vigencia visible.
5. **Internet lento:** LCP 4,9 s, 2,78 MB y 268 requests.
6. **Busca suplemento:** no existe; “magnesio” devuelve cero y productos irrelevantes.
7. **Quiere reclamar:** encuentra WhatsApp/email y proceso, pero política desactualizada, sin identidad jurídica/dirección y sin link SIC.

## Interaction manifest resumido

- 14:22:07 — captura home mobile antes de interacción.
- 14:22:07 — abrir modal de búsqueda.
- 14:22:08 — escribir “magnesio”.
- 14:22:09 — verificar cero resultados predictivos.
- 14:22:11 — enviar búsqueda y verificar `/search?q=magnesio`.
- 14:22:11 — abrir primer PDP sugerido; llevó a aceite de ricino agotado.
- 14:31:43 — abrir PDP disponible de ácido azelaico y activar “Agregar al carrito”.
- 14:31:45 — verificar contador de carrito = 1.
- 14:31:48 — abrir carrito y verificar total $90.915 COP.
- 14:31:48 — activar “Pagar”.
- 14:31:53 — verificar checkout Colombia, Standard gratis, Wompi y total; no se introdujeron datos ni se pagó.

Evidencia visual guardada en `../screenshots/`.

### Autocrítica del informe

- Hallazgos inicialmente redactados: 20.
- Conservados tras contrastar la evidencia: 19.
- Genéricos descartados: 0.
- Duplicados fusionados: 1 (carga excesiva se integró en performance móvil).
- Limitaciones que mantienen `INCOMPLETE`: no hubo pago ni envío de formularios; 14 capturas no cubren cada estado de las 19 rutas; no existe un log crudo completo de consola/red y axe por ruta; INP no fue medido; la batería completa de 11 escenarios no quedó ejecutada y documentada.

## Fuentes normativas principales

- Ley 1480 de 2011: https://suin-juriscol.gov.co/viewDocument.asp?id=1681955
- Ley 2439 de 2024: https://www.suin-juriscol.gov.co/viewDocument.asp?id=30054269
- SIC, obligación de enlace visible: https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/titulo-obligacion-de-incluir-enlace-la-superindustria-en-plataformas-de-comercio-electronico
- INVIMA, control de publicidad: https://www.invima.gov.co/node/125
- Resolución 1896 de 2023: https://normograma.invima.gov.co/compilacion/docs/resolucion_minsaludps_1896_2023.htm
- Consulta de registros INVIMA: https://www.invima.gov.co/consulta-registros-sanitarios

Este análisis no sustituye concepto jurídico ni sanitario. Todo P0 regulatorio requiere abogado/compliance colombiano y verificación documental por producto.

## Hold this in your hands

Si la tienda fuera un objeto físico, querría tomarla porque tiene una identidad visual cuidada y una voz más honesta que la media; al girarla, sin embargo, faltaría la etiqueta del fabricante responsable, algunas piezas marcarían cero pesos y otras prometerían respaldo extranjero donde necesito autorización colombiana. La conservaría como base, pero no la pondría todavía en manos de miles de compradores fríos.
