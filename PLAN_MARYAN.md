# Plan de seguimiento de Maryan

Este documento registra el estado del flujo Zernio → webhook → Supabase →
Gemini → Zernio. Debe actualizarse al cambiar una regla o completar una prueba.

## Estados

- [x] Conexión de solo lectura con la tabla `products` de Supabase.
- [x] Índice liviano de nombre, SKU, marca, categoría, presentación y palabras clave.
- [x] Recuperación de una sola ficha completa después de identificar el producto.
- [x] Rechazo de fichas no verificadas, incompletas o de demostración.
- [x] Contexto reducido según precio, uso, beneficios, composición, diferencias o seguridad.
- [x] Memoria del producto por `accountId + conversationId` en Upstash Redis.
- [x] Respuesta estructurada de Gemini (`responder` o `humano`).
- [x] Producto desconocido produce transferencia silenciosa sin llamar a Gemini.
- [x] Multimedia produce transferencia silenciosa sin llamar a Gemini.
- [x] Saludo y confirmación de recibido se responden sin Gemini.
- [ ] Desplegar esta versión en Vercel.
- [ ] Conectar en Zernio las ramas `responder`, `humano` y `silencio`.
- [ ] En la rama humana, llamar `/notify`, ejecutar `Handoff` y finalizar.
- [ ] Implementar propiedad humana y estado `cerrado_reciente` por dos horas.
- [ ] Añadir cierre explícito del asesor y supresión de “gracias/ok/listo”.
- [ ] Incorporar horario inicial de 08:00 a 18:00 en `America/Bogota`.

## Casos que deben probarse

| Caso | Gemini | Resultado esperado |
|---|---:|---|
| Saludo únicamente | No | Respuesta local amable |
| Confirma que recibió el pedido | No | Agradecimiento local |
| SKU exacto y pregunta de precio | No | Precio exacto de Supabase |
| Producto exacto y pregunta explicativa | Sí | Una ficha compacta y respuesta breve |
| Nombre con error menor | Solo si se identifica con seguridad | Producto correcto |
| Varios productos posibles | No | Pedir cuál de las opciones |
| Producto inexistente | No | `humano`, respuesta vacía, notificación |
| Ficha incompleta/no verificada/demo | No | `humano`, respuesta vacía, notificación |
| Pregunta que excede la ficha | Sí | Gemini devuelve `humano`, respuesta vacía |
| Seguimiento “¿y cómo se usa?” | Sí | Recuperar producto de Redis |
| Audio, imagen, video o archivo | No | Notificación y Handoff sin mensaje |
| Falla de Supabase o Gemini | No/puede fallar | Transferencia silenciosa segura |
| Mensaje repetido por reintento | No duplicar | Pendiente: idempotencia por `messageId` |
| Dos mensajes simultáneos | Una secuencia | Pendiente: bloqueo por conversación |

## Contrato de salida

Respuesta normal:

```json
{
  "ok": true,
  "accion": "responder",
  "respuesta": "Texto para el cliente",
  "motivo": "respuesta_producto",
  "usoGemini": true,
  "notificarAsesor": false
}
```

Transferencia silenciosa:

```json
{
  "ok": true,
  "accion": "humano",
  "respuesta": "",
  "motivo": "producto_no_encontrado",
  "usoGemini": false,
  "notificarAsesor": true
}
```

La rama `humano` nunca pasa por `Send message`: llama al webhook `/notify`,
ejecuta `Handoff` y termina.
