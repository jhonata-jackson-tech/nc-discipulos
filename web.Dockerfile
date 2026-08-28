# Build da PWA e entrega pelo Caddy. A aplicacao nao carrega nenhuma URL de
# ambiente: front, API e PostgREST vivem na mesma origem, e quem separa os
# caminhos e o proprio Caddy.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ------------------------------------------------------------------ runtime
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
