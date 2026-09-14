# Serviço de arquivos dos talks. Sem dependências: só o Node e dois arquivos.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY assinatura.mjs servidor.mjs ./
RUN mkdir -p /dados && chown node:node /dados
USER node
EXPOSE 8130
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8130/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "servidor.mjs"]
