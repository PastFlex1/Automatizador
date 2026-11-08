# MetaCloser CRM - production image (web app + API + Messenger/WhatsApp automations)
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime data lives on a persistent volume mounted at /data (see DEPLOY.md).
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data/crm \
    UPLOADS_DIR=/data/equipos

EXPOSE 3000
CMD ["node", "dist/server.cjs"]
