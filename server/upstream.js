// Acesso às APIs oficiais de dados abertos, com nova tentativa em caso de falha temporária.
import { sleep } from './util.js';

export const bases = {
  camara: () => (process.env.CAMARA_BASE || 'https://dadosabertos.camara.leg.br/api/v2').replace(/\/$/, ''),
  senado: () => (process.env.SENADO_BASE || 'https://legis.senado.leg.br/dadosabertos').replace(/\/$/, ''),
};

export class HttpError extends Error {
  constructor(status, url) { super(`HTTP ${status} em ${url}`); this.status = status; this.url = url; }
}

export async function getJSON(casa, path, { retries = 4, timeout = 30000 } = {}) {
  const url = bases[casa]() + path;
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'radar-legislativo/1.0' },
        signal: AbortSignal.timeout(timeout),
      });
      if (res.ok) return await res.json();
      if (res.status !== 429 && res.status < 500) throw new HttpError(res.status, url);
      last = new HttpError(res.status, url);
    } catch (e) {
      if (e instanceof HttpError && e.status !== 429 && e.status < 500) throw e;
      last = e;
    }
    if (i < retries) await sleep(Math.min(8000, 400 * 2 ** i) + Math.floor(Math.random() * 200));
  }
  throw last;
}

/** Lê todas as páginas de uma consulta da Câmara. */
export async function camaraAll(path, opts = {}) {
  const basePath = new URL(bases.camara()).pathname.replace(/\/$/, '');
  let next = path + (path.includes('?') ? '&' : '?') + 'itens=100';
  let out = [];
  for (let guard = 0; next && guard < 200; guard++) {
    const j = await getJSON('camara', next, opts);
    out = out.concat(j.dados || []);
    const n = (j.links || []).find((l) => l.rel === 'next');
    if (!n) { next = null; break; }
    const u = new URL(n.href, bases.camara() + '/');
    next = u.pathname.slice(basePath.length) + u.search;
  }
  return out;
}
