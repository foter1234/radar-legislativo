// Funções compartilhadas pelo importador e pela API.

export const VOTOU = ['sim', 'nao', 'abst', 'obst'];

export const pad2 = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const today = () => isoDate(new Date());
export const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return isoDate(dt);
};
export const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const lastSeg = (u) => String(u || '').split('/').filter(Boolean).pop() || '';
export const toArr = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);

export function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function parseLocal(s) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(s || '');
  return m ? { date: m[1], time: m[2] || '' } : { date: '', time: '' };
}

/** Janelas mensais [ini, fim] cobrindo o intervalo, para consultar as APIs aos poucos. */
export function monthWindows(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    const first = `${y}-${pad2(m)}-01`;
    const last = isoDate(new Date(y, m, 0));
    out.push({ key: `${y}-${pad2(m)}`, ini: first < from ? from : first, fim: last > to ? to : last });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** Executa fn para cada item, com no máximo n tarefas ao mesmo tempo. Retorna a contagem de falhas. */
export async function pool(items, n, fn) {
  let i = 0;
  let failures = 0;
  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      try { await fn(item); } catch (e) { failures++; }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, n) }, worker));
  return failures;
}

/* ---------- classificação de votos ---------- */
export function catCamara(t) {
  t = norm(t);
  if (t.startsWith('sim')) return 'sim';
  if (t.startsWith('nao')) return 'nao';
  if (t.startsWith('abst')) return 'abst';
  if (t.startsWith('obstr')) return 'obst';
  return 'outro';
}
export function catSenado(t) {
  const s = norm(t);
  if (s === 'sim') return 'sim';
  if (s === 'nao') return 'nao';
  if (s.startsWith('abst')) return 'abst';
  if (s.startsWith('obstr')) return 'obst';
  if (s === 'ncom' || s === 'p-nrv' || s === 'ausente') return 'aus';
  return 'outro';
}
export function catOrient(s) {
  s = norm(s);
  if (!s) return null;
  if (s === 'sim') return 'sim';
  if (s === 'nao') return 'nao';
  if (s.startsWith('abst')) return 'abst';
  if (s.startsWith('obstr')) return 'obst';
  if (s.startsWith('liber')) return 'lib';
  return null;
}

export function tally(votes) {
  const t = { sim: 0, nao: 0, abst: 0, obst: 0, aus: 0, outro: 0, total: 0 };
  for (const v of votes) { t[v.cat]++; t.total++; }
  return t;
}

/**
 * Define, para cada voto, a referência do partido (orientação oficial ou maioria da bancada)
 * e se o parlamentar a seguiu. Preenche ref_tipo ('orientacao' | 'maioria' | null) e alinhado (1 | 0 | null).
 */
export function applyReferences(votes, orient) {
  const omap = new Map(orient.map((o) => [String(o.nome).toUpperCase(), o.cat]));
  const parts = new Map();
  for (const v of votes) {
    const k = v.partido || '—';
    let p = parts.get(k);
    if (!p) { p = { sim: 0, nao: 0, ref: null, tipo: null }; parts.set(k, p); }
    if (v.cat === 'sim') p.sim++; else if (v.cat === 'nao') p.nao++;
  }
  for (const [k, p] of parts) {
    const o = omap.get(k.toUpperCase());
    if (o && VOTOU.includes(o)) { p.ref = o; p.tipo = 'orientacao'; }
    else if (o === 'lib') { /* bancada liberada: sem referência */ }
    else if (p.sim + p.nao >= 3 && p.sim !== p.nao) { p.ref = p.sim > p.nao ? 'sim' : 'nao'; p.tipo = 'maioria'; }
  }
  for (const v of votes) {
    const p = parts.get(v.partido || '—');
    if (p && p.ref && VOTOU.includes(v.cat)) { v.ref_tipo = p.tipo; v.alinhado = v.cat === p.ref ? 1 : 0; }
    else { v.ref_tipo = null; v.alinhado = null; }
  }
  return votes;
}

export const LAW_TYPES = ['PL', 'PLP', 'PEC', 'PDL', 'PLN', 'PRC'];
export const isLeiSituacao = (cod, desc) => String(cod) === '1140' || /transformad[oa] em norma jur/i.test(desc || '');
