# Imagem única: servidor Node 22 + interface já compilada (web/dist). Não testada neste projeto.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY web/dist ./web/dist
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DB_PATH=/data/pglite TRUST_PROXY=1
VOLUME /data
EXPOSE 3000
CMD ["node", "server/index.js"]
