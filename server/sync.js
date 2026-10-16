// Importador: baixa o histórico das APIs oficiais e guarda no banco (Postgres/Supabase ou PGlite local).
// Pode ser interrompido e retomado: só refaz o que está incompleto e os últimos dias.
// Roda no próprio servidor (modo local) ou no GitHub Actions (modo hospedado grátis).
import { pathToFileURL } from 'node:url';
import { openDb, defaultDbTarget, dbDescription } from './db.js';
import { getJSON, camaraAll } from './upstream.js';
import {
  addDays, applyReferences, catCamara, catOrient, catSenado, lastSeg, monthWindows, norm, parseLocal, pool, tally, toArr, today,
} from './util.js';

export const syncState = { running: false, fase: '', detalhe: '', feito: 0, total: 0, erros: 0, inicio: null, fim: null, ultimoErro: '', onde: '' };
const note = (e) => { syncState.ultimoErro = String((e && e.message) || e).slice(0, 300); };
const recent = (d) => d >= addDays(today(), -3);
const monthClosed = (w) => w.fim < addDays(today(), -3);
const enc = encodeURIComponent;

export function legislaturaEm(date) {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  return 56 + Math.floor(((m >= 2 ? y : y - 1) - 2019) / 4);
}

/* ---------------- controle: tempo-limite, trava e progresso no banco ---------------- */
let deadline = Infinity;
const timeUp = () => Date.now() > deadline;
class TimeUp extends Error {}
let lastPersist = 0;
async function persist(db, force = false) {
  if (!force && Date.now() - lastPersist < 8000) return;
  lastPersist = Date.now();
  try { await db.setMeta('sync_state', JSON.stringify({ ...syncState, salvoEm: Date.now() })); } catch { /* progresso é só informativo */ }
}
const LOCK_MS = 15 * 60 * 1000;
async function acquireLock(db, owner) {
  const now = Date.now();
  const r = await db.get(
    `INSERT INTO meta (key, value) VALUES ('sync_lock', ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value
     WHERE (meta.value::json->>'until')::bigint < ? OR meta.value::json->>'owner' = ?
     RETURNING key`, JSON.stringify({ owner, until: now + LOCK_MS }), now, owner);
  return !!r;
}
const refreshLock = (db, owner) => db.run(`UPDATE meta SET value = ? WHERE key = 'sync_lock' AND value::json->>'owner' = ?`, JSON.stringify({ owner, until: Date.now() + LOCK_MS }), owner).catch(() => {});
const releaseLock = (db, owner) => db.run(`DELETE FROM meta WHERE key = 'sync_lock' AND value::json->>'owner' = ?`, owner).catch(() => {});

/** Transação com nova tentativa em caso de deadlock/serialização (gravações paralelas). */
async function txRetry(db, fn) {
  for (let i = 0; ; i++) {
    try { return await db.tx(fn); } catch (e) {
      if (i < 3 && ['40P01', '40001'].includes(e && e.code)) { await new Promise((r) => setTimeout(r, 200 * (i + 1))); continue; }
      throw e;
    }
  }
}

/* ---------------- gravação em lote ---------------- */
/** Cadastra/atualiza vários parlamentares de uma vez, ampliando a janela em que aparecem nos dados. */
async function touchParlamentares(t, casa, list, data) {
  const byId = new Map();
  for (const x of list) if (x.id != null && !byId.has(Number(x.id))) byId.set(Number(x.id), x);
  if (!byId.size) return;
  const rows = [...byId.entries()].sort((a, b) => a[0] - b[0]);
  await t.run(
    `INSERT INTO parlamentar (casa, id, nome, nome_norm, partido, uf, foto, email, primeira_data, ultima_data)
     SELECT ?::text, u.id, u.nome, u.nome_norm, u.partido, u.uf, u.foto, u.email, ?::text, ?::text
     FROM unnest(?::int[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[]) AS u(id, nome, nome_norm, partido, uf, foto, email)
     ON CONFLICT (casa, id) DO UPDATE SET
       primeira_data = LEAST(parlamentar.primeira_data, excluded.primeira_data),
       ultima_data = GREATEST(parlamentar.ultima_data, excluded.ultima_data),
       foto = COALESCE(parlamentar.foto, excluded.foto), email = COALESCE(parlamentar.email, excluded.email)`,
    casa, data, data, rows.map((r) => r[0]), rows.map((r) => r[1].nome || '—'), rows.map((r) => norm(r[1].nome)),
    rows.map((r) => r[1].partido || null), rows.map((r) => r[1].uf || null), rows.map((r) => r[1].foto || null), rows.map((r) => r[1].email || null));
}

/* ---------------- votações (as duas casas) ---------------- */
const UPSERT_VOTACAO = `
INSERT INTO votacao (casa, id, data, ts, orgao, descricao, aprovada, titulo, ementa, prop_id, props_json, evento_id, link, secreta,
  n_sim, n_nao, n_abst, n_obst, n_aus, n_outro, n_total, busca, complete, synced_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
ON CONFLICT (casa, id) DO UPDATE SET data = excluded.data, ts = excluded.ts, orgao = excluded.orgao, descricao = excluded.descricao,
  aprovada = excluded.aprovada, titulo = excluded.titulo, ementa = excluded.ementa, prop_id = excluded.prop_id, props_json = excluded.props_json,
  evento_id = excluded.evento_id, link = excluded.link, secreta = excluded.secreta, n_sim = excluded.n_sim, n_nao = excluded.n_nao,
  n_abst = excluded.n_abst, n_obst = excluded.n_obst, n_aus = excluded.n_aus, n_outro = excluded.n_outro, n_total = excluded.n_total,
  busca = excluded.busca, complete = 1, synced_at = excluded.synced_at`;

async function storeVotacao(db, casa, v, votesIn, orient) {
  // um parlamentar aparece uma vez por votação
  const seen = new Set();
  const votes = votesIn.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))).sort((a, b) => a.id - b.id);
  const t0 = tally(votes);
  // o texto original do voto só é guardado quando acrescenta algo (economiza espaço no banco gratuito)
  const rawOf = (x) => (casa === 'senado' || x.cat === 'outro' ? x.raw || null : null);
  await txRetry(db, async (t) => {
    await t.run(UPSERT_VOTACAO, casa, v.id, v.data, v.ts, v.orgao, v.descricao, v.aprovada, v.titulo, v.ementa, v.prop_id, v.props_json, v.evento_id, v.link,
      v.secreta ? 1 : 0, t0.sim, t0.nao, t0.abst, t0.obst, t0.aus, t0.outro, t0.total, v.busca, new Date().toISOString());
    await t.run('DELETE FROM voto WHERE casa = ? AND votacao_id = ?', casa, v.id);
    await t.run('DELETE FROM orientacao WHERE casa = ? AND votacao_id = ?', casa, v.id);
    if (votes.length) {
      await t.run(
        `INSERT INTO voto (casa, votacao_id, parlamentar_id, cat, raw, partido, uf, ref_tipo, alinhado)
         SELECT ?::text, ?::text, u.* FROM unnest(?::int[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[], ?::smallint[])
           AS u(parlamentar_id, cat, raw, partido, uf, ref_tipo, alinhado)`,
        casa, v.id, votes.map((x) => x.id), votes.map((x) => x.cat), votes.map(rawOf), votes.map((x) => x.partido),
        votes.map((x) => x.uf), votes.map((x) => x.ref_tipo), votes.map((x) => x.alinhado));
      await touchParlamentares(t, casa, votes, v.data);
    }
    const ori = [...new Map(orient.map((o) => [o.nome, o])).values()];
    if (ori.length) {
      await t.run(
        `INSERT INTO orientacao (casa, votacao_id, nome, cat, raw) SELECT ?::text, ?::text, u.* FROM unnest(?::text[], ?::text[], ?::text[]) AS u(nome, cat, raw)`,
        casa, v.id, ori.map((o) => o.nome), ori.map((o) => o.cat), ori.map((o) => o.raw));
    }
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
    id: Number(x.deputado_.id), nome: x.deputado_.nome || '—', partido: x.deputado_.siglaPartido || '—', uf: x.deputado_.siglaUf || '',
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
  await storeVotacao(db, 'camara', {
    id: item.id, data, ts: d.dataHoraRegistro || item.dataHoraRegistro || data, orgao: d.siglaOrgao || item.siglaOrgao || 'PLEN', descricao,
    aprovada: aprov === 1 ? 1 : aprov === 0 ? 0 : null, titulo, ementa, prop_id: p0 ? p0.id : null,
    props_json: JSON.stringify(props.map((p) => ({ id: p.id, titulo: `${p.siglaTipo} ${p.numero}/${p.ano}`, ementa: p.ementa || '' }))),
    evento_id: d.idEvento || Number(lastSeg(d.uriEvento || item.uriEvento)) || null,
    link: d.idEvento ? `https://www.camara.leg.br/evento-legislativo/${d.idEvento}` : null, secreta: false,
    busca: norm([titulo, descricao, ementa, d.ultimaApresentacaoProposicao && d.ultimaApresentacaoProposicao.descricao].filter(Boolean).join(' ')),
  }, votes, orient);
}

/** Itens já completos no banco (uma consulta por mês, não uma por item). */
async function completos(db, table, casa, ids) {
  if (!ids.length) return new Set();
  const rows = await db.all(`SELECT id FROM ${table} WHERE casa = ? AND complete = 1 AND id = ANY(?)`, casa, ids);
  return new Set(rows.map((r) => String(r.id)));
}

async function syncCamaraVotacoes(db, { from, to, conc }) {
  syncState.fase = 'Câmara: votações do Plenário';
  for (const w of monthWindows(from, to)) {
    if (timeUp()) throw new TimeUp();
    const doneKey = `done:camara:votacoes:${w.key}`;
    if (await db.getMeta(doneKey) === '1' && monthClosed(w)) continue;
    syncState.detalhe = w.key;
    await persist(db, true);
    let list;
    try { list = await camaraAll(`/votacoes?dataInicio=${w.ini}&dataFim=${w.fim}&idOrgao=180&ordem=ASC&ordenarPor=dataHoraRegistro`); }
    catch (e) { syncState.erros++; note(e); continue; }
    list = list.filter((v) => v.siglaOrgao === 'PLEN');
    const ok = await completos(db, 'votacao', 'camara', list.map((v) => String(v.id)));
    const todo = list.filter((v) => !ok.has(String(v.id)) || recent(v.data));
    syncState.total += todo.length;
    let cortado = false;
    const falhas = await pool(todo, conc, async (v) => {
      if (timeUp()) { cortado = true; return; }
      try { await processCamaraVotacao(db, v); } catch (e) { note(e); throw e; } finally { syncState.feito++; persist(db); }
    });
    syncState.erros += falhas;
    if (cortado) throw new TimeUp();
    if (!falhas && monthClosed(w)) await db.setMeta(doneKey, '1');
  }
}

/* ---------------- Câmara: presença em sessões ---------------- */
async function syncCamaraPresenca(db, { from, to, conc }) {
  syncState.fase = 'Câmara: presença nas sessões';
  for (const w of monthWindows(from, to)) {
    if (timeUp()) throw new TimeUp();
    const doneKey = `done:camara:presenca:${w.key}`;
    if (await db.getMeta(doneKey) === '1' && monthClosed(w)) continue;
    syncState.detalhe = w.key;
    await persist(db, true);
    let eventos;
    try { eventos = await camaraAll(`/eventos?dataInicio=${w.ini}&dataFim=${w.fim}&idOrgao=180&ordem=ASC&ordenarPor=dataHoraInicio`); }
    catch (e) { syncState.erros++; note(e); continue; }
    const sessoes = eventos.filter((e) => /sess[ãa]o deliberativa/i.test(e.descricaoTipo || '') && /encerrad/i.test(e.situacao || '') && toArr(e.orgaos).some((o) => o.sigla === 'PLEN'));
    const ok = await completos(db, 'sessao', 'camara', sessoes.map((e) => Number(e.id)));
    const todo = sessoes.filter((e) => !ok.has(String(e.id)) || recent(parseLocal(e.dataHoraInicio).date));
    syncState.total += todo.length;
    let cortado = false;
    const falhas = await pool(todo, conc, async (e) => {
      if (timeUp()) { cortado = true; return; }
      try {
        const deps = (await camaraAll(`/eventos/${e.id}/deputados`)).filter((x) => x.id != null);
        const { date, time } = parseLocal(e.dataHoraInicio);
        const ids = [...new Set(deps.map((x) => Number(x.id)))].sort((a, b) => a - b);
        await txRetry(db, async (t) => {
          await t.run(`INSERT INTO sessao (casa, id, data, hora, tipo, descricao, n_presentes, complete) VALUES ('camara', ?, ?, ?, ?, ?, ?, 1)
                  ON CONFLICT (casa, id) DO UPDATE SET data = excluded.data, hora = excluded.hora, tipo = excluded.tipo, descricao = excluded.descricao, n_presentes = excluded.n_presentes, complete = 1`,
          Number(e.id), date, time, e.descricaoTipo, String(e.descricao || '').trim(), ids.length);
          await t.run('DELETE FROM presenca WHERE casa = ? AND sessao_id = ?', 'camara', Number(e.id));
          if (ids.length) {
            await t.run(`INSERT INTO presenca (casa, sessao_id, parlamentar_id) SELECT 'camara', ?::bigint, u FROM unnest(?::int[]) AS u ON CONFLICT DO NOTHING`, Number(e.id), ids);
            await touchParlamentares(t, 'camara', deps.map((d) => ({ id: Number(d.id), nome: d.nome, partido: d.siglaPartido, uf: d.siglaUf, foto: d.urlFoto, email: d.email })), date);
          }
        });
      } catch (err) { note(err); throw err; } finally { syncState.feito++; persist(db); }
    });
    syncState.erros += falhas;
    if (cortado) throw new TimeUp();
    if (!falhas && monthClosed(w)) await db.setMeta(doneKey, '1');
  }
}

/* ---------------- Câmara: cadastro de deputados ---------------- */
async function syncCamaraParlamentares(db, { from, to }) {
  syncState.fase = 'Câmara: cadastro de deputados';
  for (let leg = legislaturaEm(from); leg <= legislaturaEm(to); leg++) {
    syncState.detalhe = `legislatura ${leg}`;
    await persist(db, true);
    let deps;
    try { deps = await camaraAll(`/deputados?idLegislatura=${leg}&ordem=ASC&ordenarPor=nome`); }
    catch (e) { syncState.erros++; note(e); continue; }
    const rows = [...new Map(deps.filter((d) => d.id != null).map((d) => [Number(d.id), d])).entries()].sort((a, b) => a[0] - b[0]);
    if (!rows.length) continue;
    await txRetry(db, (t) => t.run(
      `INSERT INTO parlamentar (casa, id, nome, nome_norm, partido, uf, foto, email, legislatura)
       SELECT 'camara', u.id, u.nome, u.nome_norm, u.partido, u.uf, u.foto, u.email, ?::int
       FROM unnest(?::int[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[]) AS u(id, nome, nome_norm, partido, uf, foto, email)
       ON CONFLICT (casa, id) DO UPDATE SET nome = excluded.nome, nome_norm = excluded.nome_norm, partido = excluded.partido, uf = excluded.uf,
         foto = COALESCE(excluded.foto, parlamentar.foto), email = COALESCE(excluded.email, parlamentar.email),
         legislatura = GREATEST(COALESCE(parlamentar.legislatura, 0), excluded.legislatura)`,
      leg, rows.map((r) => r[0]), rows.map((r) => r[1].nome || '—'), rows.map((r) => norm(r[1].nome)), rows.map((r) => r[1].siglaPartido || null),
      rows.map((r) => r[1].siglaUf || null), rows.map((r) => r[1].urlFoto || null), rows.map((r) => r[1].email || null)));
  }
}

/* ---------------- Senado ---------------- */
const SEN_ID = (v) => `${v.codigoSessaoVotacao}:${v.sequencialVotacao}`;

async function processSenadoVotacao(db, v) {
  const votes = toArr(v.votos).filter((x) => x.codigoParlamentar != null).map((x) => ({
    id: Number(x.codigoParlamentar), nome: x.nomeParlamentar || '—', partido: x.siglaPartidoParlamentar || '—', uf: x.siglaUFParlamentar || '',
    cat: catSenado(x.siglaVotoParlamentar), raw: x.siglaVotoParlamentar || '',
  }));
  applyReferences(votes, []);
  const r = String(v.resultadoVotacao || '').toUpperCase();
  const titulo = v.identificacao || '';
  const descricao = String(v.descricaoVotacao || '').trim();
  const ementa = v.ementa || '';
  const data = v.dataSessao;
  await storeVotacao(db, 'senado', {
    id: SEN_ID(v), data, ts: `${data}#${String(v.sequencialVotacao || 0).padStart(9, '0')}`, orgao: 'Plenário', descricao, aprovada: r === 'A' ? 1 : r === 'R' ? 0 : null,
    titulo, ementa, prop_id: v.codigoMateria || null, props_json: JSON.stringify(v.codigoMateria ? [{ id: v.codigoMateria, titulo, ementa }] : []), evento_id: null,
    link: v.codigoMateria ? `https://www25.senado.leg.br/web/atividade/materias/-/materia/${v.codigoMateria}` : null, secreta: v.votacaoSecreta === 'S',
    busca: norm([titulo, descricao, ementa].join(' ')),
  }, votes, []);
}

async function syncSenadoVotacoes(db, { from, to }) {
  syncState.fase = 'Senado: votações do Plenário';
  for (const w of monthWindows(from, to)) {
    if (timeUp()) throw new TimeUp();
    const doneKey = `done:senado:votacoes:${w.key}`;
    if (await db.getMeta(doneKey) === '1' && monthClosed(w)) continue;
    syncState.detalhe = w.key;
    await persist(db, true);
    let arr;
    try {
      const j = await getJSON('senado', `/votacao?dataInicio=${w.ini}&dataFim=${w.fim}`, { timeout: 90000 });
      arr = Array.isArray(j) ? j : toArr(j && (j.votacoes || j.dados));
    } catch (e) { syncState.erros++; note(e); continue; }
    syncState.total += arr.length;
    const falhas = await pool(arr, 4, async (v) => {
      try { if (v.dataSessao && v.codigoSessaoVotacao != null) await processSenadoVotacao(db, v); }
      catch (e) { note(e); throw e; } finally { syncState.feito++; persist(db); }
    });
    syncState.erros += falhas;
    if (!falhas && monthClosed(w)) await db.setMeta(doneKey, '1');
  }
}

async function syncSenadoParlamentares(db) {
  syncState.fase = 'Senado: cadastro de senadores';
  await persist(db, true);
  try {
    const j = await getJSON('senado', '/senador/lista/atual.json');
    const lista = toArr(j && j.ListaParlamentarEmExercicio && j.ListaParlamentarEmExercicio.Parlamentares && j.ListaParlamentarEmExercicio.Parlamentares.Parlamentar)
      .map((p) => p.IdentificacaoParlamentar || {}).filter((i) => i.CodigoParlamentar != null);
    const rows = [...new Map(lista.map((i) => [Number(i.CodigoParlamentar), i])).entries()].sort((a, b) => a[0] - b[0]);
    if (!rows.length) return;
    const https = (u) => (u ? String(u).replace(/^http:/, 'https:') : null);
    await txRetry(db, (t) => t.run(
      `INSERT INTO parlamentar (casa, id, nome, nome_norm, partido, uf, foto, email, pagina)
       SELECT 'senado', u.* FROM unnest(?::int[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[]) AS u(id, nome, nome_norm, partido, uf, foto, email, pagina)
       ON CONFLICT (casa, id) DO UPDATE SET nome = excluded.nome, nome_norm = excluded.nome_norm, partido = excluded.partido, uf = excluded.uf,
         foto = COALESCE(excluded.foto, parlamentar.foto), email = COALESCE(excluded.email, parlamentar.email), pagina = COALESCE(excluded.pagina, parlamentar.pagina)`,
      rows.map((r) => r[0]), rows.map((r) => r[1].NomeParlamentar || '—'), rows.map((r) => norm(r[1].NomeParlamentar)), rows.map((r) => r[1].SiglaPartidoParlamentar || null),
      rows.map((r) => r[1].UfParlamentar || null), rows.map((r) => https(r[1].UrlFotoParlamentar)), rows.map((r) => r[1].EmailParlamentar || null), rows.map((r) => https(r[1].UrlPaginaParlamentar))));
  } catch (e) { syncState.erros++; note(e); }
}

/* ---------------- orquestração ---------------- */
/**
 * Importa o histórico. opts: { from, to, casas, only, maxMinutes, onde }.
 * Só uma importação roda por vez (trava no banco), mesmo com servidor e GitHub Actions apontando para o mesmo Supabase.
 */
export async function runSync(db, opts = {}) {
  if (syncState.running) return { skipped: true, motivo: 'já em andamento neste processo' };
  const owner = `${opts.onde || 'servidor'}:${process.pid}:${Date.now()}`;
  if (!(await acquireLock(db, owner))) return { skipped: true, motivo: 'outra importação está em andamento' };
  const from = opts.from || process.env.SYNC_FROM || '2023-02-01';
  const to = opts.to || today();
  const casas = opts.casas || ['camara', 'senado'];
  const only = opts.only || ['votos', 'presenca', 'parlamentares'];
  const conc = Number(process.env.SYNC_CONCURRENCY) || 4;
  const maxMin = Number(opts.maxMinutes || process.env.SYNC_MAX_MINUTES) || 0;
  deadline = maxMin ? Date.now() + maxMin * 60000 : Infinity;
  Object.assign(syncState, { running: true, fase: 'iniciando', detalhe: '', feito: 0, total: 0, erros: 0, ultimoErro: '', inicio: new Date().toISOString(), fim: null, onde: opts.onde || 'servidor' });
  const hb = setInterval(() => refreshLock(db, owner), 60000);
  let interrompido = false;
  try {
    await persist(db, true);
    try {
      if (casas.includes('camara')) {
        if (only.includes('parlamentares')) await syncCamaraParlamentares(db, { from, to });
        if (only.includes('votos')) await syncCamaraVotacoes(db, { from, to, conc });
        if (only.includes('presenca')) await syncCamaraPresenca(db, { from, to, conc });
      }
      if (casas.includes('senado')) {
        if (only.includes('parlamentares')) await syncSenadoParlamentares(db);
        if (only.includes('votos')) await syncSenadoVotacoes(db, { from, to });
      }
    } catch (e) {
      if (!(e instanceof TimeUp)) throw e;
      interrompido = true;
    }
    await db.run('DELETE FROM http_cache WHERE ts < ?', Date.now() - 7 * 24 * 3600 * 1000).catch(() => {});
    await db.setMeta('last_sync', new Date().toISOString());
    await db.setMeta('last_sync_erros', String(syncState.erros));
    if (!(await db.getMeta('sync_from')) || from < (await db.getMeta('sync_from'))) await db.setMeta('sync_from', from);
    syncState.fase = interrompido ? 'pausado (limite de tempo); continua na próxima rodada' : 'concluído';
  } finally {
    clearInterval(hb);
    syncState.running = false;
    syncState.fim = new Date().toISOString();
    await persist(db, true);
    await releaseLock(db, owner);
  }
  return { erros: syncState.erros, interrompido };
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
    console.log('Uso: node server/sync.js [--from AAAA-MM-DD] [--to AAAA-MM-DD] [--casa camara|senado] [--only votos,presenca,parlamentares] [--max-minutes N] [--db URL_ou_pasta]');
    process.exit(0);
  }
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const target = str(a.db) || defaultDbTarget();
  console.log(`[sync] banco: ${a.db ? 'informado em --db' : dbDescription()}`);
  const db = await openDb(target);
  const timer = setInterval(() => {
    if (syncState.running) console.log(`[sync] ${syncState.fase} ${syncState.detalhe} — ${syncState.feito}/${syncState.total} (erros: ${syncState.erros})`);
  }, 15000);
  let code = 0;
  try {
    const r = await runSync(db, {
      from: str(a.from), to: str(a.to), casas: str(a.casa) ? [a.casa] : undefined,
      only: str(a.only) ? a.only.split(',') : undefined, maxMinutes: str(a['max-minutes']), onde: process.env.GITHUB_ACTIONS ? 'github-actions' : 'linha de comando',
    });
    if (r.skipped) console.log(`[sync] não iniciado: ${r.motivo}.`);
    else {
      const n = await db.get('SELECT (SELECT COUNT(*) FROM votacao) v, (SELECT COUNT(*) FROM voto) x');
      const size = await db.size();
      console.log(`[sync] ${syncState.fase}. Votações: ${n.v}, votos: ${n.x}, erros: ${r.erros}${size ? `, tamanho do banco: ${(size / 1048576).toFixed(1)} MB` : ''}`);
      if (r.erros) {
        console.log(`[sync] último erro: ${syncState.ultimoErro}. Rode de novo para tentar apenas o que faltou.`);
        if (process.env.GITHUB_ACTIONS) console.log(`::warning::${r.erros} falhas na importação (serão tentadas de novo na próxima rodada). Último erro: ${syncState.ultimoErro}`);
      }
      if (r.interrompido && process.env.GITHUB_ACTIONS) console.log('::notice::Importação pausada pelo limite de tempo; a próxima rodada continua de onde parou.');
      const lim = Number(process.env.DB_LIMIT_MB) || (process.env.DATABASE_URL && /supabase/.test(process.env.DATABASE_URL) ? 500 : 0);
      if (lim && size && size / 1048576 > lim * 0.85) console.log(`${process.env.GITHUB_ACTIONS ? '::warning::' : '[sync] '}O banco está com ${(size / 1048576).toFixed(0)} MB, perto do limite de ${lim} MB.`);
    }
  } catch (e) {
    console.error('[sync] falhou:', e);
    code = 1;
  } finally {
    clearInterval(timer);
    await db.close();
  }
  process.exit(code);
}
