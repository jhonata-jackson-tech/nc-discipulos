# O contexto de build e a raiz do repositorio: o servidor importa o algoritmo
# de distribuicao de `src/domain`, o mesmo modulo que os testes unitarios
# exercitam. Uma regra, um arquivo.
FROM node:22-alpine AS build
WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
WORKDIR /app/server
# `npm ci` em vez de `install`: instala exatamente o lockfile, sem resolver
# versoes de novo - mais rapido e reproduzivel na VPS.
RUN npm ci --no-audit --no-fund

WORKDIR /app
COPY server/ ./server/
COPY src/domain/ ./src/domain/

WORKDIR /app/server
RUN npx tsc --noEmit && npm run build

# ------------------------------------------------------------------ runtime
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/server/dist ./dist

USER node
EXPOSE 3001
CMD ["node", "dist/server.js"]
