import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { openDb, defaultDbTarget } from './db.js';
import { createApi } from './api.js';
import { runSync } from './sync.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.map': 'application/json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.txt', '.map']);
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'",
};

/**
 * Monta o servidor. `db`: alvo do banco (URL do Postgres, pasta do PGlite ou 'memory://').
 * autoSync: importar o histórico dentro do servidor. Padrão: sim no modo local; não quando há DATABASE_URL
 * (no modo hospedado grátis quem importa é o GitHub Actions). SYNC_ON_START=1/0 força.
 */
export async function createApp({
  db: target = defaultDbTarget(), staticDir = path.join(ROOT, 'web', 'dist'),
  autoSync = process.env.SYNC_ON_START ? process.env.SYNC_ON_START !== '0' : !process.env.DATABASE_URL,
  rateLimit = Number(process.env.RATE_LIMIT) || 300,
} = {}) {
  const db = await openDb(target);
  const api = createApi(db);
  const gzCache = new Map();
  const hits = new Map();
  const trustProxy = process.env.TRUST_PROXY === '1';

  function limited(req) {
    const ip = (trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
    const now = Date.now();
    const h = hits.get(ip);
    if (!h || now - h.t > 60000) { hits.set(ip, { t: now, n: 1 }); return false; }
    h.n++;
    return h.n > rateLimit;
  }
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.t > 60000) hits.delete(k); }, 60000).unref();

  function send(req, res, status, type, body, headers = {}, compressible = false) {
    const h = { 'Content-Type': type, ...SECURITY, ...headers };
    let out = body;
    if (compressible && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && Buffer.byteLength(body) > 1024) {
      out = zlib.gzipSync(body);
      h['Content-Encoding'] = 'gzip';
      h.Vary = 'Accept-Encoding';
    }
    h['Content-Length'] = Buffer.byteLength(out);
    res.writeHead(status, h);
    res.end(req.method === 'HEAD' ? undefined : out);
  }

  function serveStatic(req, res, pathname) {
    const root = path.resolve(staticDir);
    let rel = decodeURIComponent(pathname);
    if (rel.includes('\0')) return send(req, res, 400, 'text/plain; charset=utf-8', 'Requisição inválida');
    let file = path.resolve(root, '.' + path.posix.normalize('/' + rel));
    if (!file.startsWith(root)) return send(req, res, 403, 'text/plain; charset=utf-8', 'Acesso negado');
    let stat = fs.existsSync(file) ? fs.statSync(file) : null;
    if (!stat || stat.isDirectory()) {
      if (path.extname(rel)) return send(req, res, 404, 'text/plain; charset=utf-8', 'Não encontrado');
      file = path.join(root, 'index.html'); // rotas do app (SPA)
      stat = fs.existsSync(file) ? fs.statSync(file) : null;
      if (!stat) return send(req, res, 503, 'text/plain; charset=utf-8', 'A interface ainda não foi compilada. Rode: npm run web:install && npm run web:build');
    }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const immutable = /\/assets\//.test(file.replace(/\\/g, '/'));
    const cacheKey = `${file}:${stat.mtimeMs}`;
    let body = fs.readFileSync(file);
    const headers = { 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', 'X-App': 'radar-legislativo' };
    if (file.endsWith('sw.js')) headers['Service-Worker-Allowed'] = '/';
    if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      let gz = gzCache.get(cacheKey);
      if (!gz) { gz = zlib.gzipSync(body); gzCache.set(cacheKey, gz); }
      body = gz;
      headers['Content-Encoding'] = 'gzip';
      headers.Vary = 'Accept-Encoding';
    }
    headers['Content-Length'] = body.length;
    res.writeHead(200, { 'Content-Type': type, ...SECURITY, ...headers });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, 'text/plain; charset=utf-8', 'Método não permitido');
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/healthz') return send(req, res, 200, 'text/plain; charset=utf-8', 'ok', { 'Cache-Control': 'no-store' });
      if (url.pathname.startsWith('/api/')) {
        if (limited(req)) return send(req, res, 429, 'application/json; charset=utf-8', JSON.stringify({ erro: 'Muitas consultas em pouco tempo. Aguarde um instante.' }), { 'Retry-After': '30' });
        const r = await api(url.pathname, url.searchParams);
        if (!r) return send(req, res, 404, 'application/json; charset=utf-8', JSON.stringify({ erro: 'Rota não encontrada' }));
        // respostas que ainda vão mudar em instantes (situação de projetos sendo conferida) não podem ficar no cache do navegador
        const live = url.pathname.startsWith('/api/pauta') || url.pathname === '/api/status' || !!(r.body && r.body.resumo && r.body.resumo.pendentes > 0);
        return send(req, res, r.status, 'application/json; charset=utf-8', JSON.stringify(r.body), { 'Cache-Control': live || r.status !== 200 ? 'no-store' : 'private, max-age=60' }, true);
      }
      return serveStatic(req, res, url.pathname);
    } catch (e) {
      console.error('[http]', e);
      if (!res.headersSent) send(req, res, 500, 'text/plain; charset=utf-8', 'Erro interno');
      else res.end();
    }
  });

  let timer = null;
  const tick = () => runSync(db, { onde: 'servidor' }).catch((e) => console.error('[sync] falhou:', e));
  if (autoSync) {
    const hours = Number(process.env.SYNC_INTERVAL_HOURS) || 6;
    setTimeout(tick, 1500).unref();
    timer = setInterval(tick, hours * 3600 * 1000);
    timer.unref();
  }

  return {
    server, db,
    close: () => new Promise((r) => { if (timer) clearInterval(timer); server.close(() => { Promise.resolve(db.close()).catch(() => {}).finally(r); }); }),
  };
}
