# Servidor de desenvolvimento do Expo (Metro) em modo túnel.
# O app roda no celular (Expo Go); o container só serve o bundle JS.
# ATENÇÃO: --tunnel expõe o Metro na internet via ngrok. Uso exclusivo em desenvolvimento.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund && npm install -g @expo/ngrok@4.1.3 \
    && chown -R node:node /app
COPY --chown=node:node . .
USER node
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:8081/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "expo", "start", "--tunnel", "ngrok"]
