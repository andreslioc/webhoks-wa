# Design Review: Drop Shop storefront

Reviewed against: user-supplied e-commerce/TikTok/mobile brief  
Date: 2026-09-08

## Screenshots captured

| Screenshot | Breakpoint/state |
|---|---|
| `screenshots/drop-home-320.png` | Mobile 320 |
| `screenshots/drop-flow-home-before.png` | Mobile 375 |
| `screenshots/drop-home-390.png` | Mobile 390 |
| `screenshots/drop-home-430.png` | Mobile 430 |
| `screenshots/drop-home-768.png` | Tablet 768 |
| `screenshots/drop-home-1440.png` | Desktop 1440 |
| `screenshots/drop-collection-all-390.png` | Catálogo + popup 390 |
| `screenshots/drop-flow-search-typed.png` | Search zero result |
| `screenshots/drop-purchase-pdp-before.png` | PDP available |
| `screenshots/drop-purchase-after-atc.png` | PDP after ATC |
| `screenshots/drop-purchase-cart.png` | Cart |
| `screenshots/drop-purchase-checkout.png` | Checkout start |

## Summary

La dirección berry/crema y el hero son distintivos y claros en 390/430/1440. La experiencia pierde calidad en tablet, catálogo y carrito: vacío vertical a 768, popup dominante, traducciones parciales, controles que compiten y fallos críticos de accesibilidad en PDP.

## Must fix

1. PDP: carrusel con atributos ARIA inválidos y sticky ATC sin nombre accesible; axe Critical. Reparar semántica antes de lanzamiento.
2. Catálogo: popup cubre casi todo el viewport antes de evaluar el primer producto. Cambiar trigger y frequency cap.
3. Tablet: hero sitúa el mensaje demasiado abajo y separa imagen/copy. Definir composición específica 768–1024.
4. Carrito: traducir “Cart”, “You may also like” y “View all”.

## Should fix

1. Dar acceso por teclado a carruseles horizontales de product cards.
2. Corregir contraste de compare-at price y microcopy en páginas legales/PDP.
3. Evitar que WhatsApp flotante tape tabs o controles; respetar safe areas.
4. Reducir densidad vertical y tamaño de títulos PDP en 320–390 sin perder jerarquía.

## What works well

El hero tiene orden visual inequívoco, CTA visible y fotografía pertinente; la paleta y tipografía no parecen un theme genérico. Debe conservarse esa base mientras se corrigen prueba, accesibilidad y fricción.

El análisis integral y la priorización están en `audit-drop-shop/AUDITORIA.md`.
