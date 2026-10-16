#!/usr/bin/env node
// Ponto de entrada: confere a versão do Node e inicia o servidor.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`Este app precisa do Node.js 22.13 ou mais novo (você está com ${process.versions.node}). Baixe a versão LTS em https://nodejs.org`);
  process.exit(1);
}

if (process.env.RENDER && !process.env.DATABASE_URL) {
  console.error('Falta a variável DATABASE_URL. No Render o disco é apagado a cada reinício: configure a conexão do Supabase (Session pooler).');
  process.exit(1);
}
const { createApp } = await import('./app.js');
const { dbDescription } = await import('./db.js');
const PORT = Number(process.env.PORT) || 3000;
// Render e outras plataformas definem PORT e exigem escutar em 0.0.0.0
const HOST = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
let app;
try {
  app = await createApp();
} catch (e) {
  console.error(`Não foi possível abrir o banco (${dbDescription()}): ${e.message}`);
  if (process.env.DATABASE_URL) console.error('Confira a DATABASE_URL (no Supabase, use a conexão do "Session pooler").');
  process.exit(1);
}
const { server } = app;
const autoSync = process.env.SYNC_ON_START ? process.env.SYNC_ON_START !== '0' : !process.env.DATABASE_URL;

server.listen(PORT, HOST, () => {
  console.log(`Radar Legislativo em http://localhost:${PORT} — banco: ${dbDescription()}`);
  if (autoSync) console.log('Importando o histórico em segundo plano. A primeira carga pode levar bastante tempo; acompanhe em "Sobre os dados".');
  else console.log('Importação automática desligada neste servidor (feita pelo GitHub Actions ou por "npm run sync").');
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') console.log(`Acessível na rede em http://${HOST}:${PORT}`);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { app.close().finally(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
