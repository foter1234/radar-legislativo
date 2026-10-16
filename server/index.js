#!/usr/bin/env node
// Ponto de entrada: confere a versão do Node e inicia o servidor.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`Este app precisa do Node.js 22.13 ou mais novo (você está com ${process.versions.node}). Baixe a versão LTS em https://nodejs.org`);
  process.exit(1);
}

const { createApp } = await import('./app.js');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const { server } = createApp({ autoSync: process.env.SYNC_ON_START !== '0' });

server.listen(PORT, HOST, () => {
  console.log(`Radar Legislativo em http://localhost:${PORT}`);
  if (process.env.SYNC_ON_START !== '0') console.log('Importando o histórico em segundo plano. A primeira carga pode levar alguns minutos; acompanhe em "Sobre os dados".');
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') console.log(`Acessível na rede em http://${HOST}:${PORT}`);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); });
