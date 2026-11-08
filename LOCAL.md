# MetaCloser CRM en tu PC (modo local) — APM Inox

El CRM, el bot y las publicaciones corren en tu computadora. Funciona **mientras la PC esté
encendida y la app abierta**.

| Canal | ¿Necesita túnel? |
|---|---|
| Messenger (respuestas automáticas) | No: el CRM revisa cada 30 s |
| Instagram Direct (respuestas automáticas) | No: el CRM revisa cada 30 s (con túnel, responde en segundos) |
| WhatsApp Business (API oficial) | **Sí**: Meta solo entrega mensajes a una URL pública HTTPS |
| Publicaciones automáticas en Facebook | No |

---

## 1. Iniciar el CRM

Doble clic en **`iniciar-crm.bat`**. Abre el CRM, el túnel (si lo configuraste) y el navegador.

**Que arranque solo al prender la PC:** `Win + R` → escribe `shell:startup` → Enter → pega ahí
un acceso directo a `iniciar-crm.bat`.

**Que la PC no se duerma:** Configuración → Sistema → Energía → *Suspender: Nunca* (al menos
cuando está enchufada). Si se suspende, el bot deja de responder.

## 2. Conectar WhatsApp con un túnel (ngrok, gratis)

La app abre un **puerto aparte (3100) que solo expone los webhooks de Meta**. El túnel apunta a
ese puerto, así que desde internet **no se puede ver tu CRM, tus clientes ni tus datos**:
cualquier otra ruta responde 404, y los mensajes sin la firma de Meta se rechazan.

1. Crea una cuenta gratis en https://ngrok.com y en el panel reclama tu **dominio estático gratuito**
   (algo como `apm-inox.ngrok-free.app`). Es fijo: no cambia al reiniciar.
2. Instala ngrok y conecta tu cuenta (en una terminal):
   ```bash
   winget install ngrok.ngrok
   ```
   ```bash
   ngrok config add-authtoken TU_TOKEN_DE_NGROK
   ```
3. En tu **`.env`** agrega:
   ```
   WEBHOOK_PORT="3100"
   ```
   (`META_APP_SECRET` y `META_WEBHOOK_VERIFY_TOKEN` ya los tienes; son obligatorios para este puerto.)
4. En **`iniciar-crm.bat`** escribe tu dominio en la línea `set NGROK_DOMAIN=` .
5. Reinicia con `iniciar-crm.bat` y abre `https://TU-DOMINIO/health` → debe decir `ok`.
6. En https://developers.facebook.com → tu app → **WhatsApp → Configuración → Webhook**:
   - URL de devolución de llamada: `https://TU-DOMINIO/api/webhooks/meta`
   - Token de verificación: el valor de `META_WEBHOOK_VERIFY_TOKEN` de tu `.env`
   - Suscribe el campo **messages**.
7. Agrega a tu `.env` las credenciales de WhatsApp (`WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`; ver `.env.example`) y reinicia.

**Opcional — Messenger instantáneo:** en *Messenger → Webhooks* usa la misma URL y token, y
suscribe la página a `messages`. Las respuestas pasan de ~30 s a segundos.

> ⚠️ Nunca apuntes el túnel al puerto **3000**: eso publicaría todo el CRM sin contraseña.

## 3. Activar Instagram Direct

El CRM lee y responde los DMs de Instagram a través de tu página de Facebook (mismo token).

1. Tu Instagram debe ser **cuenta profesional** (empresa o creador) y estar **vinculada a la página**
   de Facebook de APM Inox.
2. En la app de Instagram: Configuración → Mensajes y respuestas a historias → Herramientas
   conectadas → activa **Permitir acceso a los mensajes**.
3. El token de la página (`META_PAGE_ACCESS_TOKEN`) debe tener los permisos
   `instagram_basic` e `instagram_manage_messages` (además de `pages_messaging`).
   Si lo generas de nuevo en el Explorador de la API Graph, marca esos permisos.
4. Reinicia el CRM. En la consola, si falta algo, verás líneas `[InstagramSync]` explicando qué.
5. **Opcional (respuesta en segundos):** en developers.facebook.com → tu app → Webhooks → objeto
   **Instagram**, usa la misma URL del túnel (`https://TU-DOMINIO/api/webhooks/meta`) y suscribe `messages`.

Las reglas del bot, la IA, la pausa cuando responde un asesor y los seguimientos funcionan igual
que en Messenger (también con la regla de 24 h de Meta).

## 4. Si algo no responde

- ¿Está abierta la ventana **"MetaCloser CRM"**? ¿Y la de **"Tunel webhooks Meta"**?
- `https://TU-DOMINIO/health` no dice `ok` → el túnel o el CRM están cerrados.
- En la consola del CRM busca líneas `[Webhook gateway]`, `[AutoResponder]` o `[WhatsApp Cloud API]`.
- Si aparece `[Webhook gateway] NOT started`, falta `META_APP_SECRET` o `META_WEBHOOK_VERIFY_TOKEN` en `.env`.

## Si algún día quieres un servidor 24/7

Todo está listo en `DEPLOY.md`. En ese caso pon `AUTOMATIONS_ENABLED="false"` en tu PC para
que no responda dos veces a cada cliente.
