# Webhook → Telegram

Tres webhooks en un mismo servidor:

1. **`/notify`** — webhook **generico**: lo pegas en tu plataforma (Zenvia, Make, n8n, un formulario, tu chatbot…) y cada llamada publica un aviso en el chat de Telegram del asesor.
2. **`/webhook`** — webhook de **WhatsApp Cloud API** (Meta): reenvia los mensajes entrantes de WhatsApp al mismo chat.
3. **`/gemini`** — recibe un turno desde un Workflow de Zernio, consulta Gemini y devuelve la respuesta junto con el id necesario para conservar el contexto.
4. **`/gastos`** — panel del uso de Gemini, con actualización automática y manual.

Si solo necesitas avisar al asesor, te basta con `/notify` y las variables de Telegram.

## Instalacion

```bash
npm install
cp .env.example .env   # y rellena los valores
npm start
```

## Conectar tu bot de Telegram (necesario para los dos webhooks)

1. Habla con [@BotFather](https://t.me/BotFather) → tu bot ya creado → copia el token en `TELEGRAM_BOT_TOKEN`.
2. Consigue el `TELEGRAM_CHAT_ID`:
   - Escribe un mensaje al bot (o agregalo al grupo/canal del asesor y escribe algo).
   - Abre `https://api.telegram.org/bot<TU_TOKEN>/getUpdates` y copia `message.chat.id`.
   - En grupos el id es negativo (`-100...`). En canales, el bot debe ser administrador.
3. Si el grupo usa temas, pon el id del tema en `TELEGRAM_THREAD_ID`.

**Importante**: el bot no puede escribirle primero a nadie. La persona (o el grupo) tiene que haberle hablado al bot al menos una vez.

---

## 1. Aviso al asesor — `/notify`

Es el que pegas en tu plataforma. Acepta **POST** (JSON o formulario) y tambien **GET** con parametros en la URL, por si la plataforma no deja elegir.

```bash
curl -X POST https://tu-dominio/notify \
  -H 'Content-Type: application/json' \
  -H 'x-webhook-secret: TU_SECRETO' \
  -d '{"nombre":"Ana Perez","telefono":"+52 811 222 3333","motivo":"Cotizacion","mensaje":"Quiere hablar con un asesor"}'
```

Llega a Telegram asi:

```
🔔 Aviso para asesor

Nombre: Ana Perez
Telefono: +52 811 222 3333
Motivo: Cotizacion
Mensaje: Quiere hablar con un asesor

🕒 7/9/2026, 3:44 p.m.
```

**Campos reconocidos** (se muestran ordenados y con etiqueta). Cada fila acepta varios nombres, usa el que te de tu plataforma:

| Etiqueta | Nombres aceptados |
|---|---|
| Nombre | `nombre`, `name`, `cliente`, `contacto`, `nombre_completo` |
| Telefono | `telefono`, `phone`, `celular`, `whatsapp`, `numero`, `movil`, `tel` |
| Email | `email`, `correo`, `mail` |
| Motivo | `motivo`, `asunto`, `reason`, `subject`, `tema`, `servicio` |
| Mensaje | `mensaje`, `message`, `texto`, `text`, `comentario`, `consulta`, `nota` |
| Origen | `origen`, `source`, `canal`, `channel`, `campana` |

Los nombres se comparan sin distinguir estilo, asi que `conversationId`, `conversation_id` y `Conversation ID` cuentan igual.

Cualquier otro campo que mandes se publica igualmente debajo, asi que **no se pierde nada** aunque tu plataforma use otros nombres. Se omiten los duplicados (un valor que ya salio con su etiqueta arriba) y el plumbing de la plataforma (`event`, `workflowId`, `executionId`, `requestId`, `traceId`...). Con `NOTIFY_EXTRAS=false` se apaga ese volcado y solo quedan los campos con etiqueta. Manda `titulo` (o `title`) para cambiar el encabezado de ese aviso concreto.

**Boton para contestar**: si el aviso trae el enlace de la conversacion, en Telegram aparece un boton que lo abre directo. Hay dos formas de darselo:

1. **URL ya armada** — manda el enlace en cualquiera de estos campos: `link`, `url`, `enlace`, `chat_url`, `url_chat`, `conversation_url`, `permalink`, `deeplink`. No necesitas configurar nada.
2. **Solo el id** — pon la plantilla en `CHAT_URL_TEMPLATE` con `{id}` donde va el identificador:

   ```
   CHAT_URL_TEMPLATE=https://app.tuplataforma.com/conversations/{id}
   ```

   El id se toma de `conversation_id`, `conversacion_id`, `id_conversacion`, `chat_id`, `ticket`, `ticket_id`, `session_id`, o de un `id` anidado bajo `conversation`/`conversacion`/`chat`/`ticket`/`session` (p.ej. `{"conversacion":{"id":999}}`).

El texto del boton se cambia con `CHAT_BUTTON_TEXT` (por defecto `💬 Contestar`). Si no hay enlace ni id, el aviso se envia igual, solo sin boton. Un `id` suelto en la raiz **no** se usa, para no armar URLs con el id del cliente o del mensaje por error.

```bash
curl -X POST https://tu-dominio/notify \
  -H 'Content-Type: application/json' \
  -H 'x-webhook-secret: TU_SECRETO' \
  -d '{"nombre":"Ana Perez","mensaje":"Quiere asesor","conversation_id":"a1b2c3"}'
```

La respuesta incluye `conBoton` para que sepas si el enlace se pudo armar: `{"ok":true,"enviado":true,"conBoton":true}`.

### Dispararlo a mano

Para probar sin la plataforma, con el servidor corriendo (`npm start`) en otra terminal:

```bash
npm run avisar -- --nombre "Ana Perez" --telefono "+52 811 222 3333" \
  --mensaje "Quiere asesor" --id a1b2c3
```

`--id` es atajo de `conversation_id`. Cualquier otro `--clave valor` se manda tal cual en el JSON, asi que sirve para ensayar los nombres de campo que use tu plataforma:

```bash
npm run avisar -- --nombre Ana --conversation_url "https://app.tuplataforma.com/chat/9"
```

Toma `NOTIFY_SECRET` del `.env` y avisa si el aviso salio sin boton. Con `NOTIFY_URL` apuntas a un servidor remoto en vez de `localhost`.

**Seguridad**: si defines `NOTIFY_SECRET`, la llamada debe traerlo en la cabecera `x-webhook-secret`, en `Authorization: Bearer ...`, o como `?token=`. Sin esa variable el endpoint queda abierto — ponla si la URL es publica.

**Respuestas**: `200 {"ok":true,"enviado":true,"conBoton":true|false}` si llego a Telegram, `401` si el secreto no coincide, `502` si Telegram rechazo el envio (el motivo viene en el cuerpo y en los logs).

---

## 2. Respuesta con Gemini para Zernio — `/gemini`

Configura estas variables en Vercel:

```text
GEMINI_API_KEY=tu_api_key_de_Google_AI_Studio
GEMINI_WEBHOOK_SECRET=un_secreto_largo
AI_MODEL_DEFAULT=gemini-3.1-flash-lite
GEMINI_SYSTEM_PROMPT=
```

En el nodo **Webhook** de Zernio usa:

```text
POST https://tu-dominio/gemini?token=TU_SECRETO
```

Para el primer turno, manda este JSON y guarda la respuesta como `leadResponse`:

```json
{
  "mensaje": "{{Response}}"
}
```

Para los turnos siguientes usa el id devuelto por Gemini, de modo que recuerde la conversacion:

```json
{
  "mensaje": "{{Response}}",
  "previousInteractionId": "{{leadResponse.body.interactionId}}"
}
```

La respuesta del endpoint tiene esta forma:

```json
{
  "ok": true,
  "accion": "responder",
  "respuesta": "Claro, ¿que producto estas buscando?",
  "interactionId": "v1_...",
  "usoGemini": true,
  "notificarAsesor": false
}
```

En el siguiente nodo **Send message** usa `{{leadResponse.body.respuesta}}` y regresalo a **Wait for reply**. La salida `timeout` de ese nodo puede ir a **End**.

La identidad base vive en `prompts/asesor-comercial.md`. Se llama Maryan y es
una asesora comercial que puede atender consultas de Super Store/TikTok y mensajes
originados por las tarjetas incluidas con los productos. `GEMINI_SYSTEM_PROMPT`
es opcional y, si se define, agrega instrucciones sin reemplazar esa identidad.

### Agrupar mensajes consecutivos de Zernio

Como el `Wait for reply` de Zernio no permite una espera menor a un minuto, el
webhook espera hasta que transcurran 15 segundos desde el ultimo mensaje y lee
los mensajes recientes directamente del inbox. Si durante la espera llega otro,
reinicia la ventana, con un tope total predeterminado de 45 segundos. Configura
`ZERNIO_API_KEY` con permiso de mensajes y envia:

```json
{
  "mensaje": "{{Response}}",
  "conversationId": "{{conversationId}}",
  "accountId": "{{accountId}}",
  "messageId": "{{messageId}}"
}
```

`messageId` es opcional, pero mejora la precision del punto desde el que se
agrupa. La respuesta incluye `agrupado`, `mensajesAgrupados` y
`agrupacionEstado`. Si falta la API key o los identificadores, el webhook
conserva el comportamiento anterior, responde solamente al primer mensaje y
explica el dato faltante en `agrupacionEstado`.

### Buscar productos en Supabase antes de Gemini

El endpoint `/gemini` no entrega el catálogo completo al modelo. Primero carga
un índice liviano con `id`, nombre, SKU, marca, categoría, presentación y
palabras clave. Después identifica el producto y consulta solamente su ficha
completa. El índice se conserva temporalmente en memoria para reducir lecturas.

Configura en Vercel:

```text
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_PRODUCTS_TABLE=products
PRODUCT_CATALOG_CACHE_MS=300000
PRODUCT_MEMORY_TTL_SECONDS=86400
```

La clave de Supabase es exclusiva del servidor. No debe enviarse en el body del
workflow ni exponerse al navegador. Un producto solo se usa si tiene
`verified_at`, `advisor_summary` y `full_answer`, y si la ficha no declara que
es un registro de demostración. Para preguntas de precio se responde desde
Supabase sin Gemini. Para preguntas explicativas se envían solo los campos del
tema consultado y Gemini devuelve JSON estructurado.

Si no hay coincidencia segura, la ficha no es apta o la información no alcanza:

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

En Zernio, esta rama no debe tener `Send message`: llama `/notify`, ejecuta
`Handoff` y termina. El producto identificado se recuerda por
`accountId + conversationId` en Upstash, lo que permite resolver seguimientos
como “¿y cómo se usa?” sin volver a buscarlo en el texto. El avance y la matriz
de casos están en `PLAN_MARYAN.md`.

Las consultas por necesidad también se resuelven antes de Gemini. Por ejemplo,
“¿qué tiene para bajar de peso?” se relaciona de forma controlada con las frases
`control de peso`, `quemador de grasa` y `weight loss` presentes en el catálogo.
El webhook muestra únicamente productos con coincidencia fuerte y guarda esa
lista durante dos horas, por lo que “el primero” o “el segundo” recuperan la
ficha elegida. Una coincidencia débil como la palabra `metabolismo` por sí sola
no basta para recomendar un producto.

### Ver consumo estimado

Cada respuesta exitosa acumula solicitudes y tokens. Abre el panel con el mismo
secreto del webhook (o define uno distinto en `GASTOS_DASHBOARD_SECRET`):

```text
https://tu-dominio/gastos?token=TU_SECRETO
```

El panel se actualiza cada 10 segundos, tambien tiene un boton de actualizacion
y agrupa el consumo por semanas (dias 1-7, 8-14, etc.) y por mes.
El costo mostrado es una estimacion calculada con las tarifas configuradas en
`GEMINI_INPUT_USD_PER_MILLION` y `GEMINI_OUTPUT_USD_PER_MILLION`. No recupera el
consumo anterior a la instalacion del contador y el cobro real puede ser cero si
el proyecto esta dentro del nivel gratuito de Gemini.

En Vercel, conecta una base Upstash Redis y expone
`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` para que el acumulado no se
reinicie ni se divida entre instancias. Sin Redis, el panel funciona como prueba,
pero el contador vive solamente en la memoria temporal de cada instancia.

---

## 3. WhatsApp Cloud API — `/webhook`

Opcional. Recibe los mensajes entrantes de WhatsApp y los reenvia al mismo chat de Telegram. Si solo quieres el aviso al asesor, ignora esta seccion.

### Configurar el webhook en Meta
1. Publica este servidor con HTTPS (ver abajo).
2. En Meta for Developers → tu app → WhatsApp → Configuration → Webhooks:
   - **Callback URL**: `https://tu-dominio/webhook`
   - **Verify token**: el mismo valor que pusiste en `WHATSAPP_VERIFY_TOKEN`.
   - Suscribete al campo `messages`.
3. Copia el *App Secret* en `WHATSAPP_APP_SECRET` para validar la firma de cada evento.
4. Copia el access token en `WHATSAPP_TOKEN` si quieres reenviar imagenes, audios, videos y documentos (esos archivos hay que descargarlos autenticado antes de subirlos a Telegram).

### Probar en local

```bash
npx localtunnel --port 3000     # o: ngrok http 3000
```

Usa la URL publica + `/webhook` en el panel de Meta.

## Que reenvia

| Tipo de WhatsApp | En Telegram |
|---|---|
| `text` | mensaje con nombre y numero del remitente |
| `image`, `sticker` | foto con el caption |
| `audio` | nota de voz |
| `video` | video |
| `document` | documento con su nombre original |
| `location` | coordenadas + enlace a Google Maps |
| `contacts` | nombre del contacto compartido |
| `button`, `interactive` | opcion elegida y su id |
| `reaction` | emoji y id del mensaje reaccionado |
| `statuses` | solo si `FORWARD_STATUSES=true` |

Si falta `WHATSAPP_TOKEN` o falla la descarga de un archivo, se envia igualmente un aviso a Telegram con el motivo, para que ningun mensaje pase desapercibido.

---

## Endpoints

| Metodo | Ruta | Para que |
|---|---|---|
| `POST` / `GET` | `/notify` | aviso al asesor desde tu plataforma |
| `POST` | `/gemini` | respuesta de Gemini para el Workflow de Zernio |
| `GET` | `/gastos` | panel HTML de consumo estimado de Gemini |
| `GET` | `/gastos.json` | datos del contador para el panel |
| `GET` | `/webhook` | verificacion del webhook de Meta (`hub.challenge`) |
| `POST` | `/webhook` | eventos de WhatsApp; valida `X-Hub-Signature-256` si hay `WHATSAPP_APP_SECRET` |
| `GET` | `/health` | comprobacion de vida |

## Estructura

```
src/server.js      Servidor Express y enrutado del evento
src/telegram.js    Cliente de la Bot API (texto y subida de archivos)
src/whatsapp.js    Descarga de media desde la Graph API
src/formatter.js   Traduccion de cada tipo de mensaje de WhatsApp a HTML de Telegram
src/notify.js      Webhook generico /notify y armado del aviso al asesor
src/gemini.js      Puente conversacional entre Zernio y Gemini
```

## Notas

- El webhook responde `200` de inmediato y reenvia en segundo plano: Meta reintenta si tardas mas de unos segundos.
- Telegram acepta hasta 50 MB por archivo subido por bot; los archivos mas grandes fallaran y se avisara en el chat.
- `TELEGRAM_API_BASE` permite apuntar a un servidor alternativo (util para pruebas locales).
