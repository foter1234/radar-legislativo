# Imagem única: servidor Node 22 + interface já compilada (web/dist).
FROM node:22-slim
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY web/dist ./web/dist
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DB_PATH=/data/radar.sqlite TRUST_PROXY=1
VOLUME /data
EXPOSE 3000
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
