// Importador: baixa o histórico das APIs oficiais e guarda no banco local (SQLite).
// Pode ser interrompido e retomado: só refaz o que está incompleto e os últimos dias.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDb } from './db.js';
import { getJSON, camaraAll } from './upstream.js';
import {
  addDays, applyReferences, catCamara, catOrient, catSenado, lastSeg, monthWindows, norm, parseLocal, pool, tally, toArr, today,
} from './util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const defaultDbPath = () => process.env.DB_PATH || path.join(ROOT, 'data', 'radar.sqlite');

export const syncState = { running: false, fase: '', detalhe: '', feito: 0, total: 0, erros: 0, inicio: null, fim: null, ultimoErro: '' };
const note = (e) => { syncState.ultimoErro = String((e && e.message) || e); };
const recent = (d) => d >= addDays(today(), -3);
const monthClosed = (w) => w.fim < addDays(today(), -3);
const enc = encodeURIComponent;

export function legislaturaEm(date) {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  return 56 + Math.floor(((m >= 2 ? y : y - 1) - 2019) / 4);
}

/* ---------------- Câmara: votações ---------------- */
const UPSERT_VOTACAO = `
INSERT INTO votacao (casa, id, data, ts, orgao, descricao, aprovada, titulo, ementa, prop_id, props_json, evento_id, link, secreta,
  n_sim, n_nao, n_abst, n_obst, n_aus, n_outro, n_total, busca, complete, synced_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
ON CONFLICT(casa, id) DO UPDATE SET data = excluded.data, ts = excluded.ts, orgao = excluded.orgao, descricao = excluded.descricao,
  aprovada = excluded.aprovada, titulo = excluded.titulo, ementa = excluded.ementa, prop_id = excluded.prop_id, props_json = excluded.props_json,
  evento_id = excluded.evento_id, link = excluded.link, secreta = excluded.secreta, n_sim = excluded.n_sim, n_nao = excluded.n_nao,
  n_abst = excluded.n_abst, n_obst = excluded.n_obst, n_aus = excluded.n_aus, n_outro = excluded.n_outro, n_total = excluded.n_total,
  busca = excluded.busca, complete = 1, synced_at = excluded.synced_at`;
const INSERT_VOTO = 'INSERT INTO voto (casa, votacao_id, parlamentar_id, cat, raw, partido, uf, ref_tipo, alinhado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
const INSERT_ORIENT = 'INSERT OR REPLACE INTO orientacao (casa, votacao_id, nome, cat, raw) VALUES (?, ?, ?, ?, ?)';
const TOUCH_PARLAMENTAR = `
INSERT INTO parlamentar (casa, id, nome, nome_norm, partido, uf, foto, email, primeira_data, ultima_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(casa, id) DO UPDATE SET
  primeira_data = MIN(COALESCE(parlamentar.primeira_data, excluded.primeira_data), excluded.primeira_data),
  ultima_data = MAX(COALESCE(parlamentar.ultima_data, excluded.ultima_data), excluded.ultima_data),
  foto = COALESCE(parlamentar.foto, excluded.foto), email = COALESCE(parlamentar.email, excluded.email)`;

function storeVotacao(db, casa, v, votes, orient) {
  const t = tally(votes);
  db.tx(() => {
    db.run(UPSERT_VOTACAO, casa, v.id, v.data, v.ts, v.orgao, v.descricao, v.aprovada, v.titulo, v.ementa, v.prop_id, v.props_json, v.evento_id, v.link,
      v.secreta ? 1 : 0, t.sim, t.nao, t.abst, t.obst, t.aus, t.outro, t.total, v.busca, new Date().toISOString());
    db.run('DELETE FROM voto WHERE casa = ? AND votacao_id = ?', casa, v.id);
    db.run('DELETE FROM orientacao WHERE casa = ? AND votacao_id = ?', casa, v.id);
    for (const x of votes) {
      db.run(INSERT_VOTO, casa, v.id, x.id, x.cat, x.raw, x.partido, x.uf, x.ref_tipo, x.alinhado);
      db.run(TOUCH_PARLAMENTAR, casa, x.id, x.nome, norm(x.nome), x.partido, x.uf, x.foto || null, x.email || null, v.data, v.data);
    }
    for (const o of orient) db.run(INSERT_ORIENT, casa, v.id, o.nome, o.cat, o.raw);
  });
}

async function processCamaraVotacao(db, item) {
  const id = enc(item.id);
  const [det, votosRaw, oriRaw] = await Promise.all([
    getJSON('camara', `/votacoes/${id}`),
    camaraAll(`/votacoes/${id}/votos`),
    camaraAll(`/votacoes/${id}/orientacoes`).catch(() => []),
  ]);
  const d = det.dados || {};
  const votes = votosRaw.filter((x) => x.deputado_ && x.deputado_.id != null).map((x) => ({
    id: x.deputado_.id, nome: x.deputado_.nome || '—', partido: x.deputado_.siglaPartido || '—', uf: x.deputado_.siglaUf || '',
    foto: x.deputado_.urlFoto, email: x.deputado_.email, cat: catCamara(x.tipoVoto), raw: x.tipoVoto || '',
  }));
  const orient = oriRaw.map((o) => ({ nome: o.siglaPartidoBloco || '', cat: catOrient(o.orientacaoVoto), raw: o.orientacaoVoto || '' })).filter((o) => o.nome);
  applyReferences(votes, orient);
  const props = toArr(d.proposicoesAfetadas);
  const p0 = props[0];
  const titulo = p0 ? `${p0.siglaTipo} ${p0.numero}/${p0.ano}` : '';
  const ementa = p0 ? p0.ementa || '' : '';
  const descricao = String(d.descricao || item.descricao || '').trim();
  const data = d.data || item.data;
  const aprov = d.aprovacao != null ? d.aprovacao : item.aprovacao;
  storeVotacao(db, 'camara', {
    id: item.id, data, ts: d.dataHoraRegistro || item.dataHoraRegistro || data, orgao: d.siglaOrgao || item.siglaOrgao || 'PLEN', descricao,
    aprovada: aprov === 1 ? 1 : aprov === 0 ? 0 : null, titulo, ementa, prop_id: p0 ? p0.id : null,
    props_json: JSON.stringify(props.map((p) => ({ id: p.id, titulo: `${p.siglaTipo} ${p.numero}/${p.ano}`, ementa: p.ementa || '' }))),
    evento_id: d.idEvento || Number(lastSeg(d.uriEvento || item.uriEvento)) || null,
    link: d.idEvento ? `https://www.camara.leg.br/evento-legislativo/${d.idEvento}` : null, secreta: false,
    busca: norm([titulo, descricao, ementa, d.ultimaApresentacaoProposicao && d.ultimaApresentacaoProposicao.descricao].filter(Boolean).join(' ')),
  }, votes, orient);
}

async function syncCamaraVotacoes(db, { from, to, conc }) {
  syncState.fase = 'Câmara: votações do Plenário';
  for (const w of monthWindows(from, to)) {
    const doneKey = `done:camara:votacoes:${w.key}`;
    if (db.getMeta(doneKey) === '1' && monthClosed(w)) continue;
    syncState.detalhe = w.key;
    let list;
    try { list = await camaraAll(`/votacoes?dataInicio=${w.ini}&dataFim=${w.fim}&idOrgao=180&ordem=ASC&ordenarPor=dataHoraRegistro`); }
    catch (e) { syncState.erros++; note(e); continue; }
    list = list.filter((v) => v.siglaOrgao === 'PLEN');
    const todo = list.filter((v) => {
      const r = db.get('SELECT complete FROM votacao WHERE casa = ? AND id = ?', 'camara', v.id);
      return !r || !r.complete || recent(v.data);
    });
    syncState.total += todo.length;
    const falhas = await pool(todo, conc, async (v) => {
      try { await processCamaraVotacao(db, v); } catch (e) { note(e); throw e; } finally { syncState.feito++; }
    });
    syncState.erros += falhas;
    if (!falhas && monthClosed(w)) db.setMeta(doneKey, '1');
  }
}

/* ---------------- Câmara: presença em sessões ---------------- */
async function syncCamaraPresenca(db, { from, to, conc }) {
  syncState.fase = 'Câmara: presença nas sessões';
  for (const w of monthWindows(from, to)) {
    const doneKey = `done:camara:presenca:${w.key}`;
    if (db.getMeta(doneKey) === '1' && monthClosed(w)) continue;
    syncState.detalhe = w.key;
    let eventos;
    try { eventos = await camaraAll(`/eventos?dataInicio=${w.ini}&dataFim=${w.fim}&idOrgao=180&ordem=ASC&ordenarPor=dataHoraInicio`); }
    catch (e) { syncState.erros++; note(e); continue; }
    const sessoes = eventos.filter((e) => /sess[ãa]o deliberativa/i.test(e.descricaoTipo || '') && /encerrad/i.test(e.situacao || '') && toArr(e.orgaos).some((o) => o.sigla === 'PLEN'));
    const todo = sessoes.filter((e) => {
      const { date } = parseLocal(e.dataHoraInicio);
      const r = db.get('SELECT complete FROM sessao WHERE casa = ? AND id = ?', 'camara', e.id);
      return !r || !r.complete || recent(date);
    });
    syncState.total += todo.length;
    const falhas = await pool(todo, conc, async (e) => {
      try {
        const deps = await camaraAll(`/eventos/${e.id}/deputados`);
        const { date, time } = parseLocal(e.dataHoraInicio);
        db.tx(() => {
          db.run(`INSERT INTO sessao (casa, id, data, hora, tipo, descricao, n_presentes, complete) VALUES ('camara', ?, ?, ?, ?, ?, ?, 1)
                  ON CONFLICT(casa, id) DO UPDATE SET data = excluded.data, hora = excluded.hora, tipo = excluded.tipo, descricao = excluded.descricao, n_presentes = excluded.n_presentes, complete = 1`,
          e.id, date, time, e.descricaoTipo, String(e.descricao || '').trim(), deps.length);
          db.run('DELETE FROM presenca WHERE casa = ? AND sessao_id = ?', 'camara', e.id);
          for (const d of deps) {
            if (d.id == null) continue;
            db.run('INSERT OR IGNORE INTO presenca (casa, sessao_id, parlamentar_id) VALUES (?, ?, ?)', 'camara', e.id, d.id);
            db.run(TOUCH_PARLAMENTAR, 'camara', d.id, d.nome || '—', norm(d.nome), d.siglaPartido || null, d.siglaUf || null, d.urlFoto || null, d.email || null, date, date);
          }
        });
      } catch (err) { note(err); throw err; } finally { syncState.feito++; }
    });
    syncState.erros += falhas;
    if (!falhas && monthClosed(w)) db.setMeta(doneKey, '1');
  }
}

/* ---------------- Câmara: cadastro de deputados ---------------- */
async function syncCamaraParlamentares(db, { from, to }) {
  syncState.fase = 'Câmara: cadastro de deputados';
  const legs = new Set();
  for (let l = legislaturaEm(from); l <= legislaturaEm(to); l++) legs.add(l);
  for (const leg of legs) {
    syncState.detalhe = `legislatura ${leg}`;
    let deps;
    try { deps = await camaraAll(`/deputados?idLegislatura=${leg}&ordem=ASC&ordenarPor=nome`); }
    catch (e) { syncState.erros++; note(e); continue; }
    db.tx(() => {
      for (const d of deps) {
        db.run(`INSERT INTO parlamentar (casa, id, nome, nome_norm, partido, uf, foto, email, legislatura) VALUES ('camara', ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(casa, id) DO UPDATE SET nome = excluded.nome, nome_norm = excluded.nome_norm, partido = excluded.partido, uf = excluded.uf,
                  foto = COALESCE(excluded.foto, parlamentar.foto), email = COALESCE(excluded.email, parlamentar.email), legislatura = MAX(COALESCE(parlamentar.legislatura, 0), excluded.legislatura)`,
        d.id, d.nome, norm(d.nome), d.siglaPartido || null, d.siglaUf || null, d.urlFoto || null, d.email || null, leg);
      }
    });
  }
}

/* ---------------- Senado ---------------- */
const SEN_ID = (v) => `${v.codigoSessaoVotacao}:${v.sequencialVotacao}`;

function processSenadoVotacao(db, v) {
  const votes = toArr(v.votos).filter((x) => x.codigoParlamentar != null).map((x) => ({
    id: x.codigoParlamentar, nome: x.nomeParlamentar || '—', partido: x.siglaPartidoParlamentar || '—', uf: x.siglaUFParlamentar || '',
    cat: catSenado(x.siglaVotoParlamentar), raw: x.siglaVotoParlamentar || '',
  }));
  applyReferences(votes, []);
  const r = String(v.resultadoVotacao || '').toUpperCase();
  const titulo = v.identificacao || '';
  const descricao = String(v.descricaoVotacao || '').trim();
  const ementa = v.ementa || '';
  const data = v.dataSessao;
  storeVotacao(db, 'senado', {
    id: SEN_ID(v), data, ts: `${data}#${String(v.sequencialVotacao || 0).padStart(9, '0')}`, orgao: 'Plenário', descricao, aprovada: r === 'A' ? 1 : r === 'R' ? 0 : null,
    titulo, ementa, prop_id: v.codigoMateria || null, props_json: JSON.stringify(v.codigoMateria ? [{ id: v.codigoMateria, titulo, ementa }] : []), evento_id: null,
    link: v.codigoMateria ? `https://www25.senado.leg.br/web/atividade/materias/-/materia/${v.codigoMateria}` : null, secreta: v.votacaoSecreta === 'S',
    busca: norm([titulo, descricao, ementa].join(' ')),
  }, votes, []);
}

async function syncSenadoVotacoes(db, { from, to }) {
  syncState.fase = 'Senado: votações do Plenário';
  for (const w of monthWindows(from, to)) {
    const doneKey = `done:senado:votacoes:${w.key}`;
    if (db.getMeta(doneKey) === '1' && monthClosed(w)) continue;
    syncState.detalhe = w.key;
    let arr;
    try {
      const j = await getJSON('senado', `/votacao?dataInicio=${w.ini}&dataFim=${w.fim}`, { timeout: 90000 });
      arr = Array.isArray(j) ? j : toArr(j && (j.votacoes || j.dados));
    } catch (e) { syncState.erros++; note(e); continue; }
    syncState.total += arr.length;
    let falhas = 0;
    for (const v of arr) {
      try { if (v.dataSessao && v.codigoSessaoVotacao != null) processSenadoVotacao(db, v); }
      catch (e) { falhas++; note(e); }
      syncState.feito++;
    }
    syncState.erros += falhas;
    if (!falhas && monthClosed(w)) db.setMeta(doneKey, '1');
  }
}

async function syncSenadoParlamentares(db) {
  syncState.fase = 'Senado: cadastro de senadores';
  try {
    const j = await getJSON('senado', '/senador/lista/atual.json');
    const lista = toArr(j && j.ListaParlamentarEmExercicio && j.ListaParlamentarEmExercicio.Parlamentares && j.ListaParlamentarEmExercicio.Parlamentares.Parlamentar);
    db.tx(() => {
      for (const p of lista) {
        const i = p.IdentificacaoParlamentar || {};
        if (i.CodigoParlamentar == null) continue;
        db.run(`INSERT INTO parlamentar (casa, id, nome, nome_norm, partido, uf, foto, email, pagina) VALUES ('senado', ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(casa, id) DO UPDATE SET nome = excluded.nome, nome_norm = excluded.nome_norm, partido = excluded.partido, uf = excluded.uf,
                  foto = COALESCE(excluded.foto, parlamentar.foto), email = COALESCE(excluded.email, parlamentar.email), pagina = COALESCE(excluded.pagina, parlamentar.pagina)`,
        i.CodigoParlamentar, i.NomeParlamentar || '—', norm(i.NomeParlamentar), i.SiglaPartidoParlamentar || null, i.UfParlamentar || null,
        i.UrlFotoParlamentar ? String(i.UrlFotoParlamentar).replace(/^http:/, 'https:') : null, i.EmailParlamentar || null,
        i.UrlPaginaParlamentar ? String(i.UrlPaginaParlamentar).replace(/^http:/, 'https:') : null);
      }
    });
  } catch (e) { syncState.erros++; note(e); }
}

/* ---------------- orquestração ---------------- */
export async function runSync(db, opts = {}) {
  if (syncState.running) return { skipped: true };
  const from = opts.from || process.env.SYNC_FROM || '2023-02-01';
  const to = opts.to || today();
  const casas = opts.casas || ['camara', 'senado'];
  const only = opts.only || ['votos', 'presenca', 'parlamentares'];
  const conc = Number(process.env.SYNC_CONCURRENCY) || 4;
  Object.assign(syncState, { running: true, fase: 'iniciando', detalhe: '', feito: 0, total: 0, erros: 0, ultimoErro: '', inicio: new Date().toISOString(), fim: null });
  try {
    if (casas.includes('camara')) {
      if (only.includes('votos')) await syncCamaraVotacoes(db, { from, to, conc });
      if (only.includes('presenca')) await syncCamaraPresenca(db, { from, to, conc });
      if (only.includes('parlamentares')) await syncCamaraParlamentares(db, { from, to });
    }
    if (casas.includes('senado')) {
      if (only.includes('votos')) await syncSenadoVotacoes(db, { from, to });
      if (only.includes('parlamentares')) await syncSenadoParlamentares(db);
    }
    db.setMeta('last_sync', new Date().toISOString());
    db.setMeta('last_sync_erros', String(syncState.erros));
    db.setMeta('sync_from', from);
    syncState.fase = 'concluído';
  } finally {
    syncState.running = false;
    syncState.fim = new Date().toISOString();
  }
  return { erros: syncState.erros };
}

/* ---------------- linha de comando ---------------- */
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { o[k] = next; i++; } else o[k] = true;
  }
  return o;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs(process.argv.slice(2));
  if (a.help) {
    console.log('Uso: node server/sync.js [--from AAAA-MM-DD] [--to AAAA-MM-DD] [--casa camara|senado] [--only votos,presenca,parlamentares] [--db caminho]');
    process.exit(0);
  }
  const db = openDb(a.db || defaultDbPath());
  const timer = setInterval(() => {
    if (syncState.running) console.log(`[sync] ${syncState.fase} ${syncState.detalhe} — ${syncState.feito}/${syncState.total} (erros: ${syncState.erros})`);
  }, 10000);
  runSync(db, {
    from: typeof a.from === 'string' ? a.from : undefined,
    to: typeof a.to === 'string' ? a.to : undefined,
    casas: typeof a.casa === 'string' ? [a.casa] : undefined,
    only: typeof a.only === 'string' ? a.only.split(',') : undefined,
  }).then((r) => {
    clearInterval(timer);
    console.log(`[sync] concluído. Votações: ${db.get('SELECT COUNT(*) n FROM votacao').n}, votos: ${db.get('SELECT COUNT(*) n FROM voto').n}, erros: ${r.erros}`);
    if (r.erros) console.log(`[sync] último erro: ${syncState.ultimoErro}. Rode de novo para tentar apenas o que faltou.`);
    db.close();
  }).catch((e) => { clearInterval(timer); console.error('[sync] falhou:', e); process.exit(1); });
}
