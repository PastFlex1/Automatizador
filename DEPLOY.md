# Poner MetaCloser CRM en línea 24/7

Objetivo: que las publicaciones, las respuestas de Messenger/WhatsApp y los seguimientos
funcionen aunque tu PC esté apagada, y tener una URL pública con HTTPS para los webhooks de Meta.

La app ya viene preparada: `Dockerfile`, login con contraseña, datos en un volumen persistente
e interruptor `AUTOMATIONS_ENABLED`. No necesitas PostgreSQL (los datos están en archivos JSON).

---

## Opción recomendada: Railway (≈ USD 5/mes)

1. **Crea la cuenta** en https://railway.com (plan Hobby).
2. **Instala la CLI y sube el proyecto** (desde la carpeta del proyecto, en una terminal):
   ```bash
   npm install -g @railway/cli
   railway login
   railway init
   railway up
   ```
   Railway detecta el `Dockerfile` y construye la app. El archivo `.dockerignore` evita subir
   tu `.env`, la llave `.pem` y la foto personal de `public/equipos`.
3. **Agrega un volumen** al servicio, montado en **`/data`**. Ahí se guardan leads, configuración
   y fotos. Sin volumen, todo se borra en cada actualización.
   En el primer arranque, la app copia ahí tus datos actuales (`src/data`) y tus fotos.
4. **Variables de entorno** (pestaña *Variables* del servicio). Copia las de tu `.env` y agrega:
   | Variable | Valor |
   |---|---|
   | `APP_PASSWORD` | una contraseña larga para entrar al CRM (obligatoria) |
   | `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`, `META_APP_SECRET`, `META_APP_ID` | las de tu `.env` |
   | `META_WEBHOOK_VERIFY_TOKEN` | una palabra secreta que inventes (la usarás en Meta) |
   | `GROQ_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | las que uses para la IA |
   | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN` | cuando conectes WhatsApp |

   `NODE_ENV`, `PORT`, `DATA_DIR` y `UPLOADS_DIR` ya vienen en el Dockerfile.
5. **Genera el dominio público** (Settings → Networking → *Generate Domain*). Obtendrás algo como
   `https://metacloser-crm-production.up.railway.app`.
6. **Prueba**: abre esa URL, entra con tu `APP_PASSWORD` y revisa que aparezcan tus leads y productos.
   `https://TU-DOMINIO/api/health` debe responder.

## Conectar los webhooks de Meta

En https://developers.facebook.com → tu app:

- **Messenger** → Webhooks: URL `https://TU-DOMINIO/api/webhooks/meta`,
  token = tu `META_WEBHOOK_VERIFY_TOKEN`. Suscribe la página al campo `messages`.
- **WhatsApp** → Configuración → Webhook: la misma URL y token. Suscribe el campo `messages`.

Con el webhook, las respuestas salen en segundos; el ciclo de 30 s queda como respaldo.

## ⚠️ Muy importante: tu PC

Cuando el servidor esté en línea, en el `.env` de tu PC pon:

```
AUTOMATIONS_ENABLED="false"
```

Si no lo haces, tu PC y el servidor responderán **ambos** a cada cliente y publicarán doble.

La extensión de Chrome sigue apuntando a `http://localhost:3000`: para usarla, deja la app abierta
en tu PC (con `AUTOMATIONS_ENABLED="false"`). Ojo: lo que guardes en tu PC no se sincroniza con el
servidor; los datos “oficiales” pasan a ser los del servidor.

## Actualizar después de cambios

```bash
railway up
```

Tus datos viven en el volumen `/data`, así que no se pierden al actualizar.

---

## Alternativa: un VPS propio (DigitalOcean, Hetzner, Contabo…)

Con Docker instalado en el servidor:

```bash
docker build -t metacloser .
docker run -d --restart unless-stopped -p 3000:3000 -v /srv/metacloser:/data --env-file .env metacloser
```

Y delante un proxy con HTTPS automático (por ejemplo Caddy: `tu-dominio.com { reverse_proxy localhost:3000 }`).
Requiere un dominio propio apuntando a la IP del VPS.
