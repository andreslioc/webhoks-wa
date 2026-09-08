# Webhook → Telegram

Dos webhooks en un mismo servidor:

1. **`/notify`** — webhook **generico**: lo pegas en tu plataforma (Zenvia, Make, n8n, un formulario, tu chatbot…) y cada llamada publica un aviso en el chat de Telegram del asesor.
2. **`/webhook`** — webhook de **WhatsApp Cloud API** (Meta): reenvia los mensajes entrantes de WhatsApp al mismo chat.

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

## 2. WhatsApp Cloud API — `/webhook`

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
```

## Notas

- El webhook responde `200` de inmediato y reenvia en segundo plano: Meta reintenta si tardas mas de unos segundos.
- Telegram acepta hasta 50 MB por archivo subido por bot; los archivos mas grandes fallaran y se avisara en el chat.
- `TELEGRAM_API_BASE` permite apuntar a un servidor alternativo (util para pruebas locales).
