// Rotas da API do app. Histórico vem do banco local; pauta e detalhes de proposições vêm ao vivo (com cache).
import { camaraAll, getJSON } from './upstream.js';
import { syncState } from './sync.js';
import { createStatusService, listarAutoriaDeputado } from './proposicoes.js';
import { addDays, isIsoDate, LAW_TYPES, lastSeg, norm, parseLocal, toArr, today } from './util.js';

const HOUR = 3600 * 1000;
const enc = encodeURIComponent;

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const num = (x) => Number(x || 0);
const pct = (a, b) => (b > 0 ? Math.round((1000 * a) / b) / 10 : null);
const clamp = (v, def, min, max) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const dateParam = (v) => (isIsoDate(v) ? v : null);
const casaParam = (v) => (v === 'camara' || v === 'senado' ? v : '');
const escLike = (s) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
const decode = (s) => { try { return decodeURIComponent(s); } catch { throw new ApiError(400, 'Parâmetro inválido'); } };
const words = (q) => norm(q).split(/\s+/).filter(Boolean).slice(0, 6);

export function createApi(db) {
  const statusSvc = createStatusService(db);
  const loading = new Map();

  /** Cache em disco com tolerância a falhas: se a fonte oficial cair, entrega a última cópia. */
  async function cached(key, ttl, loader) {
    const row = db.get('SELECT ts, body FROM http_cache WHERE key = ?', key);
    if (row && Date.now() - row.ts < ttl) return JSON.parse(row.body);
    if (loading.has(key)) return loading.get(key);
    const p = (async () => {
      try {
        const v = await loader();
        db.run('INSERT INTO http_cache (key, ts, body) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET ts = excluded.ts, body = excluded.body', key, Date.now(), JSON.stringify(v));
        return v;
      } catch (e) {
        if (row) return JSON.parse(row.body);
        throw e;
      } finally { loading.delete(key); }
    })();
    loading.set(key, p);
    return p;
  }

  const coverage = (casa) => db.get('SELECT MIN(data) ini, MAX(data) fim FROM votacao WHERE casa = ?', casa) || {};

  /* ---------- status ---------- */
  function status() {
    const per = (casa) => {
      const v = db.get('SELECT COUNT(*) n, SUM(n_total > 0) nominais, MIN(data) ini, MAX(data) fim FROM votacao WHERE casa = ?', casa);
      return {
        votacoes: num(v.n), nominais: num(v.nominais), primeira: v.ini, ultima: v.fim,
        parlamentares: num(db.get('SELECT COUNT(*) n FROM parlamentar WHERE casa = ?', casa).n),
        sessoes: num(db.get('SELECT COUNT(*) n FROM sessao WHERE casa = ?', casa).n),
      };
    };
    return {
      camara: per('camara'), senado: per('senado'), ultimaSync: db.getMeta('last_sync'), desde: db.getMeta('sync_from'),
      sync: { ...syncState },
    };
  }

  /* ---------- votações ---------- */
  function votacaoFilters(q, alias = '') {
    const where = [];
    const params = [];
    const c = (col) => (alias ? `${alias}.${col}` : col);
    const casa = casaParam(q.get('casa'));
    if (casa) { where.push(`${c('casa')} = ?`); params.push(casa); }
    const de = dateParam(q.get('de')), ate = dateParam(q.get('ate'));
    if (de) { where.push(`${c('data')} >= ?`); params.push(de); }
    if (ate) { where.push(`${c('data')} <= ?`); params.push(ate); }
    const res = q.get('resultado');
    if (res === 'ok') where.push(`${c('aprovada')} = 1`);
    if (res === 'no') where.push(`${c('aprovada')} = 0`);
    if (q.get('nominal') === '1') where.push(`${c('n_total')} > 0`);
    for (const w of words(q.get('q') || '')) { where.push(`${c('busca')} LIKE ? ESCAPE '\\'`); params.push(`%${escLike(w)}%`); }
    return { where, params };
  }
  const votacaoRow = (r) => ({
    casa: r.casa, id: r.id, data: r.data, orgao: r.orgao, titulo: r.titulo || '', descricao: r.descricao || '', ementa: String(r.ementa || '').slice(0, 500),
    aprovada: r.aprovada == null ? null : !!r.aprovada, secreta: !!r.secreta,
    placar: { sim: num(r.n_sim), nao: num(r.n_nao), abst: num(r.n_abst), obst: num(r.n_obst), aus: num(r.n_aus), outro: num(r.n_outro), total: num(r.n_total) },
  });

  function listVotacoes(ctx) {
    const { where, params } = votacaoFilters(ctx.q);
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = clamp(ctx.q.get('limit'), 30, 1, 100), offset = clamp(ctx.q.get('offset'), 0, 0, 1e7);
    const total = num(db.get(`SELECT COUNT(*) n FROM votacao ${w}`, ...params).n);
    const itens = db.all(
      `SELECT casa, id, data, orgao, titulo, descricao, ementa, aprovada, secreta, n_sim, n_nao, n_abst, n_obst, n_aus, n_outro, n_total
       FROM votacao ${w} ORDER BY data DESC, ts DESC LIMIT ? OFFSET ?`, ...params, limit, offset).map(votacaoRow);
    return { total, itens, cobertura: { camara: coverage('camara'), senado: coverage('senado') } };
  }

  function getVotacao(ctx, casa, rawId) {
    const id = decode(rawId);
    const v = db.get('SELECT * FROM votacao WHERE casa = ? AND id = ?', casa, id);
    if (!v) throw new ApiError(404, 'Votação não encontrada');
    const votos = db.all(
      `SELECT x.parlamentar_id id, COALESCE(p.nome, '—') nome, x.partido, x.uf, x.cat, x.raw, x.alinhado, x.ref_tipo, p.foto
       FROM voto x LEFT JOIN parlamentar p ON p.casa = x.casa AND p.id = x.parlamentar_id
       WHERE x.casa = ? AND x.votacao_id = ? ORDER BY COALESCE(p.nome_norm, '')`, casa, id)
      .map((x) => ({ ...x, alinhado: x.alinhado == null ? null : !!x.alinhado }));
    const orientacoes = db.all('SELECT nome, cat, raw FROM orientacao WHERE casa = ? AND votacao_id = ? ORDER BY nome', casa, id);
    const omap = new Map(orientacoes.map((o) => [o.nome.toUpperCase(), o.cat]));
    const partidos = db.all(
      `SELECT partido, COUNT(*) total, SUM(cat = 'sim') sim, SUM(cat = 'nao') nao, SUM(cat = 'abst') abst, SUM(cat = 'obst') obst, SUM(cat = 'aus') aus,
              SUM(cat = 'outro') outro, SUM(alinhado = 1) seguiu, SUM(alinhado = 0) desvio, MAX(ref_tipo) ref_tipo
       FROM voto WHERE casa = ? AND votacao_id = ? GROUP BY partido ORDER BY total DESC, partido`, casa, id)
      .map((p) => ({
        partido: p.partido, total: num(p.total), sim: num(p.sim), nao: num(p.nao), abst: num(p.abst), obst: num(p.obst), aus: num(p.aus), outro: num(p.outro),
        seguiu: pct(num(p.seguiu), num(p.seguiu) + num(p.desvio)), refTipo: p.ref_tipo, orientacao: omap.get(String(p.partido).toUpperCase()) || null,
      }));
    let props = [];
    try { props = JSON.parse(v.props_json || '[]'); } catch { /* sem proposições */ }
    return { votacao: { ...votacaoRow(v), ementa: v.ementa || '', link: v.link, eventoId: v.evento_id, propId: v.prop_id, props }, orientacoes, partidos, votos };
  }

  /* ---------- parlamentares ---------- */
  const parlamentarRow = (p) => ({
    casa: p.casa, id: p.id, nome: p.nome, partido: p.partido, uf: p.uf, foto: p.foto, email: p.email, pagina: p.pagina,
    primeira: p.primeira_data, ultima: p.ultima_data, legislatura: p.legislatura,
  });

  function listParlamentares(ctx) {
    const q = ctx.q;
    const where = [], params = [];
    const casa = casaParam(q.get('casa'));
    if (casa) { where.push('casa = ?'); params.push(casa); }
    if (q.get('uf')) { where.push('uf = ?'); params.push(q.get('uf').toUpperCase().slice(0, 2)); }
    if (q.get('partido')) { where.push('UPPER(partido) = ?'); params.push(q.get('partido').toUpperCase()); }
    for (const w of words(q.get('q') || '')) { where.push("nome_norm LIKE ? ESCAPE '\\'"); params.push(`%${escLike(w)}%`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = clamp(q.get('limit'), 48, 1, 100), offset = clamp(q.get('offset'), 0, 0, 1e7);
    const total = num(db.get(`SELECT COUNT(*) n FROM parlamentar ${w}`, ...params).n);
    const itens = db.all(`SELECT * FROM parlamentar ${w} ORDER BY nome_norm LIMIT ? OFFSET ?`, ...params, limit, offset).map(parlamentarRow);
    return { total, itens };
  }

  function filtrosParlamentares(ctx) {
    const casa = casaParam(ctx.q.get('casa')) || 'camara';
    return {
      partidos: db.all('SELECT DISTINCT partido FROM parlamentar WHERE casa = ? AND partido IS NOT NULL ORDER BY partido', casa).map((r) => r.partido),
      ufs: db.all('SELECT DISTINCT uf FROM parlamentar WHERE casa = ? AND uf IS NOT NULL AND uf <> \'\' ORDER BY uf', casa).map((r) => r.uf),
    };
  }

  function requireParlamentar(casa, id) {
    const p = db.get('SELECT * FROM parlamentar WHERE casa = ? AND id = ?', casa, Number(id));
    if (!p) throw new ApiError(404, 'Parlamentar não encontrado');
    return p;
  }

  /** Janela em que o parlamentar aparece nos dados (primeira e última votação ou sessão), recortada pelo período pedido. */
  function janela(casa, id, de, ate) {
    const w = db.get(
      `SELECT MIN(d) ini, MAX(d) fim FROM (
         SELECT v.data d FROM voto x JOIN votacao v ON v.casa = x.casa AND v.id = x.votacao_id WHERE x.casa = ? AND x.parlamentar_id = ?
         UNION ALL
         SELECT s.data FROM presenca p JOIN sessao s ON s.casa = p.casa AND s.id = p.sessao_id WHERE p.casa = ? AND p.parlamentar_id = ?)`,
      casa, id, casa, id);
    if (!w || !w.ini) return null;
    return { ini: de && de > w.ini ? de : w.ini, fim: ate && ate < w.fim ? ate : w.fim, primeira: w.ini, ultima: w.fim };
  }

  function stats(casa, id, de, ate) {
    const j = janela(casa, id, de, ate);
    if (!j || j.ini > j.fim) return { janela: j, votos: null, nominais: 0, participacao: null, alinhamento: null, orientacao: null, presenca: null };
    const v = db.get(
      `SELECT COUNT(*) total, SUM(x.cat = 'sim') sim, SUM(x.cat = 'nao') nao, SUM(x.cat = 'abst') abst, SUM(x.cat = 'obst') obst, SUM(x.cat = 'aus') aus,
              SUM(x.cat = 'outro') outro, SUM(x.alinhado = 1) alinhados, SUM(x.alinhado IS NOT NULL) com_ref,
              SUM(x.ref_tipo = 'orientacao' AND x.alinhado = 1) seg_ori, SUM(x.ref_tipo = 'orientacao') com_ori, SUM(x.raw = 'NCom') ncom
       FROM voto x JOIN votacao v ON v.casa = x.casa AND v.id = x.votacao_id
       WHERE x.casa = ? AND x.parlamentar_id = ? AND v.data BETWEEN ? AND ?`, casa, id, j.ini, j.fim);
    const nominais = num(db.get('SELECT COUNT(*) n FROM votacao WHERE casa = ? AND n_total > 0 AND data BETWEEN ? AND ?', casa, j.ini, j.fim).n);
    const votou = num(v.sim) + num(v.nao) + num(v.abst) + num(v.obst);
    let presenca;
    if (casa === 'camara') {
      const s = db.get(
        `SELECT COUNT(*) total, (SELECT COUNT(*) FROM presenca p JOIN sessao s2 ON s2.casa = p.casa AND s2.id = p.sessao_id
                                 WHERE p.casa = ? AND p.parlamentar_id = ? AND s2.data BETWEEN ? AND ?) presentes
         FROM sessao WHERE casa = ? AND complete = 1 AND data BETWEEN ? AND ?`, casa, id, j.ini, j.fim, casa, j.ini, j.fim);
      presenca = { base: 'sessoes', total: num(s.total), presentes: num(s.presentes), pct: pct(num(s.presentes), num(s.total)) };
    } else {
      // no Senado cada votação lista todos os senadores; "NCom" significa que não compareceu
      presenca = { base: 'votacoes', total: nominais, presentes: Math.max(0, num(v.total) - num(v.ncom)), pct: null };
      presenca.pct = pct(presenca.presentes, presenca.total);
    }
    return {
      janela: j,
      votos: { total: num(v.total), sim: num(v.sim), nao: num(v.nao), abst: num(v.abst), obst: num(v.obst), aus: num(v.aus), outro: num(v.outro) },
      nominais, participacao: pct(votou, nominais),
      alinhamento: { comReferencia: num(v.com_ref), alinhados: num(v.alinhados), pct: pct(num(v.alinhados), num(v.com_ref)) },
      orientacao: { comOrientacao: num(v.com_ori), seguiu: num(v.seg_ori), pct: pct(num(v.seg_ori), num(v.com_ori)) },
      presenca,
    };
  }

  async function detalheDeputado(id) {
    return cached(`dep:${id}`, 24 * HOUR, async () => {
      const j = await getJSON('camara', `/deputados/${enc(id)}`);
      const d = j.dados || {};
      const u = d.ultimoStatus || {};
      const g = u.gabinete || null;
      // o CPF vem na resposta oficial, mas não é repassado nem guardado
      return {
        nomeCivil: d.nomeCivil || null, sexo: d.sexo || null, dataNascimento: d.dataNascimento || null, ufNascimento: d.ufNascimento || null,
        municipioNascimento: d.municipioNascimento || null, escolaridade: d.escolaridade || null, urlWebsite: d.urlWebsite || null,
        redeSocial: toArr(d.redeSocial), situacao: u.situacao || null, condicaoEleitoral: u.condicaoEleitoral || null, nomeEleitoral: u.nomeEleitoral || null,
        gabinete: g ? { nome: g.nome, predio: g.predio, sala: g.sala, andar: g.andar, telefone: g.telefone, email: g.email } : null,
      };
    }).catch(() => null);
  }

  async function getParlamentar(ctx, casa, id) {
    const p = requireParlamentar(casa, id);
    const de = dateParam(ctx.q.get('de')), ate = dateParam(ctx.q.get('ate'));
    return {
      parlamentar: parlamentarRow(p),
      detalhe: casa === 'camara' ? await detalheDeputado(p.id) : null,
      stats: stats(casa, p.id, de, ate),
    };
  }

  function votosParlamentar(ctx, casa, id) {
    const p = requireParlamentar(casa, id);
    const q = ctx.q;
    const de = dateParam(q.get('de')), ate = dateParam(q.get('ate'));
    const limit = clamp(q.get('limit'), 30, 1, 100), offset = clamp(q.get('offset'), 0, 0, 1e7);
    const cat = ['sim', 'nao', 'abst', 'obst', 'aus', 'outro', 'sem'].includes(q.get('voto')) ? q.get('voto') : '';
    const ausencias = q.get('ausencias') === '1' || cat === 'sem';
    const textos = words(q.get('q') || '');
    const resultado = q.get('resultado');
    const extra = [], extraParams = [];
    for (const w of textos) { extra.push("v.busca LIKE ? ESCAPE '\\'"); extraParams.push(`%${escLike(w)}%`); }
    if (resultado === 'ok') extra.push('v.aprovada = 1');
    if (resultado === 'no') extra.push('v.aprovada = 0');
    let from, where, params;
    if (ausencias) {
      const j = janela(casa, p.id, de, ate);
      if (!j || j.ini > j.fim) return { total: 0, itens: [] };
      from = 'votacao v LEFT JOIN voto x ON x.casa = v.casa AND x.votacao_id = v.id AND x.parlamentar_id = ?';
      where = ['v.casa = ?', 'v.n_total > 0', 'v.data BETWEEN ? AND ?'];
      params = [p.id, casa, j.ini, j.fim];
      if (cat === 'sem') where.push('x.cat IS NULL'); else if (cat) { where.push('x.cat = ?'); params.push(cat); }
    } else {
      from = 'voto x JOIN votacao v ON v.casa = x.casa AND v.id = x.votacao_id';
      where = ['x.casa = ?', 'x.parlamentar_id = ?'];
      params = [casa, p.id];
      if (de) { where.push('v.data >= ?'); params.push(de); }
      if (ate) { where.push('v.data <= ?'); params.push(ate); }
      if (cat) { where.push('x.cat = ?'); params.push(cat); }
    }
    where.push(...extra); params.push(...extraParams);
    const w = where.join(' AND ');
    const total = num(db.get(`SELECT COUNT(*) n FROM ${from} WHERE ${w}`, ...params).n);
    const itens = db.all(
      `SELECT v.casa, v.id, v.data, v.orgao, v.titulo, v.descricao, v.ementa, v.aprovada, v.secreta, v.n_sim, v.n_nao, v.n_abst, v.n_obst, v.n_aus, v.n_outro, v.n_total,
              x.cat voto, x.raw votoRaw, x.partido partidoNaData, x.alinhado, x.ref_tipo refTipo
       FROM ${from} WHERE ${w} ORDER BY v.data DESC, v.ts DESC LIMIT ? OFFSET ?`, ...params, limit, offset)
      .map((r) => ({ ...votacaoRow(r), voto: r.voto || null, votoRaw: r.votoRaw || null, partidoNaData: r.partidoNaData || null, alinhado: r.alinhado == null ? null : !!r.alinhado, refTipo: r.refTipo || null }));
    return { total, itens };
  }

  function presencaParlamentar(ctx, casa, id) {
    const p = requireParlamentar(casa, id);
    const de = dateParam(ctx.q.get('de')), ate = dateParam(ctx.q.get('ate'));
    const j = janela(casa, p.id, de, ate);
    if (!j || j.ini > j.fim) return { base: casa === 'camara' ? 'sessoes' : 'votacoes', meses: [], sessoes: [], total: 0, presentes: 0, pct: null, janela: j };
    if (casa === 'camara') {
      const meses = db.all(
        `SELECT substr(s.data, 1, 7) mes, COUNT(*) total, SUM(p.parlamentar_id IS NOT NULL) presentes
         FROM sessao s LEFT JOIN presenca p ON p.casa = s.casa AND p.sessao_id = s.id AND p.parlamentar_id = ?
         WHERE s.casa = ? AND s.complete = 1 AND s.data BETWEEN ? AND ? GROUP BY mes ORDER BY mes`, p.id, casa, j.ini, j.fim)
        .map((m) => ({ mes: m.mes, total: num(m.total), presentes: num(m.presentes) }));
      const so = ctx.q.get('so') === 'ausencias' ? 'AND p.parlamentar_id IS NULL' : '';
      const limit = clamp(ctx.q.get('limit'), 40, 1, 100), offset = clamp(ctx.q.get('offset'), 0, 0, 1e7);
      const base = `FROM sessao s LEFT JOIN presenca p ON p.casa = s.casa AND p.sessao_id = s.id AND p.parlamentar_id = ?
                    WHERE s.casa = ? AND s.complete = 1 AND s.data BETWEEN ? AND ? ${so}`;
      const totalSessoes = num(db.get(`SELECT COUNT(*) n ${base}`, p.id, casa, j.ini, j.fim).n);
      const sessoes = db.all(`SELECT s.id, s.data, s.hora, s.tipo, s.descricao, p.parlamentar_id IS NOT NULL presente ${base} ORDER BY s.data DESC, s.hora DESC LIMIT ? OFFSET ?`, p.id, casa, j.ini, j.fim, limit, offset)
        .map((s) => ({ ...s, presente: !!s.presente }));
      const total = meses.reduce((a, m) => a + m.total, 0), presentes = meses.reduce((a, m) => a + m.presentes, 0);
      return { base: 'sessoes', meses, sessoes, totalSessoes, total, presentes, pct: pct(presentes, total), janela: j };
    }
    const meses = db.all(
      `SELECT substr(v.data, 1, 7) mes, COUNT(*) total, SUM(x.raw IS NOT NULL AND x.raw <> 'NCom') presentes
       FROM votacao v LEFT JOIN voto x ON x.casa = v.casa AND x.votacao_id = v.id AND x.parlamentar_id = ?
       WHERE v.casa = ? AND v.n_total > 0 AND v.data BETWEEN ? AND ? GROUP BY mes ORDER BY mes`, p.id, casa, j.ini, j.fim)
      .map((m) => ({ mes: m.mes, total: num(m.total), presentes: num(m.presentes) }));
    const total = meses.reduce((a, m) => a + m.total, 0), presentes = meses.reduce((a, m) => a + m.presentes, 0);
    return { base: 'votacoes', meses, sessoes: [], total, presentes, pct: pct(presentes, total), janela: j };
  }

  /* ---------- proposições do parlamentar ---------- */
  const MAIN_TYPES = [...LAW_TYPES, 'MPV'];
  async function proposicoesParlamentar(ctx, casa, id) {
    const p = requireParlamentar(casa, id);
    const q = ctx.q;
    const limit = clamp(q.get('limit'), 30, 1, 100), offset = clamp(q.get('offset'), 0, 0, 1e7);
    if (casa === 'senado') {
      try {
        const j = await cached(`senautoria:${p.id}`, 6 * HOUR, () => getJSON('senado', `/senador/${p.id}/autorias.json`));
        const lista = toArr(j && j.MateriasAutoriaParlamentar && j.MateriasAutoriaParlamentar.Parlamentar && j.MateriasAutoriaParlamentar.Parlamentar.Autorias && j.MateriasAutoriaParlamentar.Parlamentar.Autorias.Autoria)
          .map((a) => ({
            id: a.Materia && a.Materia.Codigo, tipo: a.Materia && a.Materia.Sigla, numero: a.Materia && a.Materia.Numero, ano: a.Materia && a.Materia.Ano,
            ementa: (a.Materia && a.Materia.Ementa) || '', data: (a.Materia && a.Materia.Data) || '', principal: a.IndicadorAutorPrincipal === 'Sim',
            link: a.Materia && a.Materia.Codigo ? `https://www25.senado.leg.br/web/atividade/materias/-/materia/${a.Materia.Codigo}` : null,
          }))
          .sort((a, b) => String(b.data).localeCompare(String(a.data)));
        const tipo = (q.get('tipo') || '').toUpperCase();
        const filt = lista.filter((x) => (!tipo || x.tipo === tipo) && (!q.get('q') || words(q.get('q')).every((w) => norm(x.ementa).includes(w))));
        const porTipo = {};
        for (const x of lista) porTipo[x.tipo] = (porTipo[x.tipo] || 0) + 1;
        return { total: filt.length, itens: filt.slice(offset, offset + limit), resumo: { total: lista.length, porTipo, leis: null, pendentes: 0 }, semSituacao: true };
      } catch { return { indisponivel: true, total: 0, itens: [], resumo: { total: 0, porTipo: {}, leis: null, pendentes: 0 } }; }
    }
    const todos = await cached(`autoria:${p.id}`, 6 * HOUR, () => listarAutoriaDeputado(p.id));
    const capazes = todos.filter((x) => LAW_TYPES.includes(x.tipo)).map((x) => x.id);
    const pendentes = capazes.length ? statusSvc.ensure(capazes) : 0;
    const st = new Map(db.all('SELECT * FROM proposicao_status WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(capazes)).map((r) => [r.id, r]));
    const porTipo = {};
    for (const x of todos) porTipo[x.tipo] = (porTipo[x.tipo] || 0) + 1;
    const tiposParam = (q.get('tipos') || 'principais');
    const tipos = tiposParam === 'todos' ? null : tiposParam === 'principais' ? MAIN_TYPES : tiposParam.toUpperCase().split(',').filter(Boolean);
    const ano = q.get('ano') ? Number(q.get('ano')) : null;
    const ws = words(q.get('q') || '');
    const soLeis = q.get('leis') === '1';
    const enriched = todos.map((x) => {
      const s = st.get(x.id);
      return { ...x, situacao: s ? s.situacao || s.tramitacao || null : null, orgao: s ? s.orgao : null, despacho: s ? s.despacho : null, dataStatus: s ? s.data_status : null, lei: !!(s && s.is_lei), verificada: !!s && (s.situacao != null || s.tramitacao != null || s.is_lei === 1) };
    });
    const leis = enriched.filter((x) => x.lei);
    const base = soLeis ? leis : enriched;
    const filt = base.filter((x) => (!tipos || tipos.includes(x.tipo)) && (!ano || x.ano === ano || x.data.startsWith(String(ano))) && ws.every((w) => norm(x.ementa).includes(w)));
    return {
      total: filt.length, itens: filt.slice(offset, offset + limit),
      resumo: { total: todos.length, porTipo, leis: leis.length, pendentes },
      aviso: 'Inclui projetos assinados em conjunto com outros deputados. A situação de cada projeto é conferida aos poucos na fonte oficial.',
    };
  }

  /* ---------- partidos ---------- */
  function partidos(ctx) {
    const q = ctx.q;
    const casa = casaParam(q.get('casa')) || 'camara';
    const cov = coverage(casa);
    const ate = dateParam(q.get('ate')) || cov.fim || today();
    const de = dateParam(q.get('de')) || addDays(ate, -365);
    const rows = db.all(
      `SELECT x.partido, COUNT(*) votos, COUNT(DISTINCT x.parlamentar_id) membros, COUNT(DISTINCT x.votacao_id) votacoes,
              SUM(x.cat = 'sim') sim, SUM(x.cat = 'nao') nao, SUM(x.cat = 'abst') abst, SUM(x.cat = 'obst') obst, SUM(x.cat = 'aus') aus, SUM(x.cat = 'outro') outro,
              SUM(x.alinhado = 1) alinhados, SUM(x.alinhado IS NOT NULL) com_ref,
              SUM(x.ref_tipo = 'orientacao' AND x.alinhado = 1) seg_ori, SUM(x.ref_tipo = 'orientacao') com_ori
       FROM voto x JOIN votacao v ON v.casa = x.casa AND v.id = x.votacao_id
       WHERE x.casa = ? AND v.data BETWEEN ? AND ? GROUP BY x.partido ORDER BY membros DESC, x.partido`, casa, de, ate);
    const nominais = num(db.get('SELECT COUNT(*) n FROM votacao WHERE casa = ? AND n_total > 0 AND data BETWEEN ? AND ?', casa, de, ate).n);
    return {
      casa, de, ate, nominais,
      itens: rows.map((r) => {
        const votou = num(r.sim) + num(r.nao) + num(r.abst) + num(r.obst);
        return {
          partido: r.partido, membros: num(r.membros), votos: num(r.votos), votacoes: num(r.votacoes),
          sim: pct(num(r.sim), votou), nao: pct(num(r.nao), votou), abstObst: pct(num(r.abst) + num(r.obst), votou),
          contagem: { sim: num(r.sim), nao: num(r.nao), abst: num(r.abst), obst: num(r.obst), aus: num(r.aus), outro: num(r.outro), total: num(r.votos) },
          alinhamento: pct(num(r.alinhados), num(r.com_ref)), seguiuOrientacao: pct(num(r.seg_ori), num(r.com_ori)),
        };
      }),
    };
  }

  /* ---------- pauta (ao vivo) ---------- */
  const senItens = (parte) => { const it = parte && parte.itens; if (Array.isArray(it)) return it; if (it && Array.isArray(it.item)) return it.item; return toArr(it); };
  async function reunioesCamara(ini, fim) {
    const dados = await camaraAll(`/eventos?dataInicio=${ini}&dataFim=${fim}&ordem=ASC&ordenarPor=dataHoraInicio`);
    return dados.map((e) => {
      const { date, time } = parseLocal(e.dataHoraInicio);
      const orgs = toArr(e.orgaos);
      const tipo = e.descricaoTipo || '';
      const cat = orgs.some((o) => o.sigla === 'PLEN') ? 'plenario' : /deliberativa/i.test(tipo) ? 'deliberativa' : /audi[eê]ncia/i.test(tipo) ? 'audiencia' : 'outros';
      return {
        casa: 'camara', id: String(e.id), data: date, hora: time, cat, tipo, titulo: '',
        orgao: orgs.map((o) => o.sigla).filter(Boolean).join(', ') || '—', orgaoNome: orgs.map((o) => o.nomeResumido || o.nome).filter(Boolean).join('; '),
        situacao: e.situacao || '', descricao: String(e.descricao || '').trim(), local: (e.localCamara && e.localCamara.nome) || e.localExterno || '',
        links: { video: e.urlRegistro || null, oficial: `https://www.camara.leg.br/evento-legislativo/${e.id}` }, itens: null,
      };
    });
  }
  async function reunioesSenado(ini, fim) {
    const c = (s) => s.replace(/-/g, '');
    const j = await getJSON('senado', `/comissao/agenda/${c(ini)}/${c(fim)}.json`, { timeout: 60000 });
    const raw = j && j.AgendaReuniao && j.AgendaReuniao.reunioes;
    const lista = Array.isArray(raw) ? raw : toArr(raw && raw.reuniao);
    return lista.map((r) => {
      const { date, time } = parseLocal(r.dataInicio);
      const col = toArr(r.colegiados)[0] || r.colegiadoCriador || {};
      const partes = toArr(r.partes);
      const textoPartes = partes.map((p) => `${p.nome || ''} ${p.finalidade || ''}`).join(' ');
      const plen = /^PLEN$/i.test(col.sigla || '') || /plen[aá]rio/i.test(col.nome || '');
      const cat = plen ? 'plenario' : partes.some((p) => p.isDeliberativa) ? 'deliberativa' : /audi[eê]ncia|interativa/i.test(`${r.titulo} ${r.descricao} ${textoPartes}`) ? 'audiencia' : 'outros';
      return {
        casa: 'senado', id: String(r.codigo), data: date, hora: time, cat, tipo: (r.tipo && r.tipo.descricao) || 'Reunião', titulo: r.titulo || r.descricao || '',
        orgao: col.sigla || '—', orgaoNome: col.nome || '', situacao: r.situacao || r.status || '', descricao: partes.map((p) => p.finalidade).filter(Boolean).join(' · '),
        local: r.local || '', links: { pauta: r.urlUltimaPautaSimplesPublicada || null, resultado: r.urlUltimoResultadoPublicado || null, ata: r.urlUltimaAtaPublicada || null },
        itens: partes.flatMap(senItens).map((i) => ({
          ordem: i.ordem, titulo: i.nome || i.descricao || 'Item', apelido: i.apelido || (i.doma && i.doma.apelido) || '', ementa: (i.doma && i.doma.ementa) || '',
          autor: (i.autorItemPauta && i.autorItemPauta.nomeAutoria) || '', relatorio: i.relatorio || '', situacao: (i.situacao && i.situacao.descricaoTipoResultado) || '',
        })),
      };
    });
  }
  async function pauta(ctx) {
    const ini = dateParam(ctx.q.get('ini')) || today();
    const fim = dateParam(ctx.q.get('fim')) || addDays(ini, 6);
    if (fim < ini || (new Date(fim) - new Date(ini)) / 86400000 > 45) throw new ApiError(400, 'Período inválido (máximo de 45 dias)');
    const casa = casaParam(ctx.q.get('casa'));
    const fontes = [];
    if (!casa || casa === 'camara') fontes.push(['camara', () => cached(`pauta:camara:${ini}:${fim}`, 2 * 60000, () => reunioesCamara(ini, fim))]);
    if (!casa || casa === 'senado') fontes.push(['senado', () => cached(`pauta:senado:${ini}:${fim}`, 2 * 60000, () => reunioesSenado(ini, fim))]);
    const res = await Promise.allSettled(fontes.map(([, f]) => f()));
    const itens = [], erros = {};
    res.forEach((r, i) => { if (r.status === 'fulfilled') itens.push(...r.value); else erros[fontes[i][0]] = 'Fonte oficial indisponível no momento'; });
    itens.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
    return { ini, fim, itens, erros };
  }
  async function pautaItens(ctx, id) {
    return cached(`pautaitens:${id}`, 5 * 60000, async () => {
      const dados = await camaraAll(`/eventos/${id}/pauta`);
      return dados.map((i) => ({
        ordem: i.ordem, titulo: i.titulo || (i.proposicao_ ? `${i.proposicao_.siglaTipo} ${i.proposicao_.numero}/${i.proposicao_.ano}` : i.topico || 'Item'),
        topico: i.topico || '', regime: i.regime || '', ementa: i.proposicao_ ? i.proposicao_.ementa || '' : '', propId: i.proposicao_ ? i.proposicao_.id : null,
        relator: i.relator ? { id: i.relator.id, nome: i.relator.nome, partido: i.relator.siglaPartido, uf: i.relator.siglaUf } : null,
        situacao: i.situacaoItem || '', votacaoId: i.uriVotacao ? lastSeg(i.uriVotacao) : '',
      }));
    });
  }

  /* ---------- proposições ---------- */
  async function buscarProposicoes(ctx) {
    const q = ctx.q;
    const tipo = (q.get('tipo') || '').toUpperCase().replace(/[^A-Z]/g, '');
    const numero = q.get('numero') ? String(Number.parseInt(q.get('numero'), 10) || '') : '';
    const ano = q.get('ano') ? String(Number.parseInt(q.get('ano'), 10) || '') : '';
    const kw = (q.get('q') || '').trim().slice(0, 120);
    if (!numero && !kw) throw new ApiError(400, 'Informe o número ou uma palavra-chave');
    const pagina = clamp(q.get('pagina'), 1, 1, 500);
    const p = ['ordem=DESC', 'ordenarPor=id', 'itens=30', `pagina=${pagina}`];
    if (tipo) p.push(`siglaTipo=${tipo}`);
    if (numero) p.push(`numero=${numero}`);
    if (ano) p.push(`ano=${ano}`);
    if (kw) p.push(`keywords=${enc(kw)}`);
    const j = await cached(`propbusca:${p.join('&')}`, 5 * 60000, () => getJSON('camara', `/proposicoes?${p.join('&')}`));
    return {
      pagina, temMais: (j.links || []).some((l) => l.rel === 'next'),
      itens: (j.dados || []).map((d) => ({ id: d.id, tipo: d.siglaTipo, numero: d.numero, ano: d.ano, ementa: d.ementa || '', data: String(d.dataApresentacao || '').slice(0, 10) })),
    };
  }

  async function getProposicao(ctx, id) {
    return cached(`prop:${id}`, 30 * 60000, async () => {
      const [det, aut, tram, vot] = await Promise.allSettled([
        getJSON('camara', `/proposicoes/${id}`), camaraAll(`/proposicoes/${id}/autores`), camaraAll(`/proposicoes/${id}/tramitacoes`), camaraAll(`/proposicoes/${id}/votacoes`),
      ]);
      if (det.status === 'rejected') throw new ApiError(det.reason && det.reason.status === 404 ? 404 : 502, 'Proposição não encontrada na fonte oficial');
      const d = det.value.dados || {};
      const st = d.statusProposicao || {};
      const votacoes = (vot.status === 'fulfilled' ? vot.value : []).sort((a, b) => String(b.dataHoraRegistro).localeCompare(String(a.dataHoraRegistro)));
      const naBase = new Set(votacoes.length ? db.all("SELECT id FROM votacao WHERE casa = 'camara' AND id IN (SELECT value FROM json_each(?))", JSON.stringify(votacoes.map((v) => v.id))).map((r) => r.id) : []);
      const lei = /transformad[oa] em norma jur/i.test(st.descricaoSituacao || '') || String(st.codSituacao) === '1140';
      return {
        proposicao: {
          id: d.id, tipo: d.siglaTipo, numero: d.numero, ano: d.ano, descricaoTipo: d.descricaoTipo || '', ementa: d.ementa || '', ementaDetalhada: d.ementaDetalhada || '',
          keywords: d.keywords || '', apresentacao: String(d.dataApresentacao || '').slice(0, 10), inteiroTeor: d.urlInteiroTeor || null,
          oficial: `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${d.id}`, lei,
        },
        situacao: { descricao: st.descricaoSituacao || null, tramitacao: st.descricaoTramitacao || null, orgao: st.siglaOrgao || null, regime: st.regime || null, despacho: st.despacho || null, data: st.dataHora || null, apreciacao: st.apreciacao || null },
        autores: (aut.status === 'fulfilled' ? aut.value : []).map((a) => ({ nome: a.nome, tipo: a.tipo, deputadoId: /\/deputados\/(\d+)$/.test(a.uri || '') ? Number(lastSeg(a.uri)) : null })),
        tramitacoes: (tram.status === 'fulfilled' ? tram.value : []).map((t) => ({ data: t.dataHora, orgao: t.siglaOrgao, tramitacao: t.descricaoTramitacao, situacao: t.descricaoSituacao, despacho: t.despacho })).sort((a, b) => String(b.data).localeCompare(String(a.data))),
        votacoes: votacoes.map((v) => ({ id: v.id, data: v.data, orgao: v.siglaOrgao, descricao: v.descricao || '', aprovada: v.aprovacao === 1 ? true : v.aprovacao === 0 ? false : null, naBase: naBase.has(v.id) })),
      };
    });
  }

  const routes = [
    [/^\/api\/status$/, status],
    [/^\/api\/votacoes$/, listVotacoes],
    [/^\/api\/votacoes\/(camara|senado)\/([^/]+)$/, getVotacao],
    [/^\/api\/parlamentares$/, listParlamentares],
    [/^\/api\/parlamentares\/filtros$/, filtrosParlamentares],
    [/^\/api\/parlamentares\/(camara|senado)\/(\d+)$/, getParlamentar],
    [/^\/api\/parlamentares\/(camara|senado)\/(\d+)\/votos$/, votosParlamentar],
    [/^\/api\/parlamentares\/(camara|senado)\/(\d+)\/presenca$/, presencaParlamentar],
    [/^\/api\/parlamentares\/(camara|senado)\/(\d+)\/proposicoes$/, proposicoesParlamentar],
    [/^\/api\/partidos$/, partidos],
    [/^\/api\/pauta$/, pauta],
    [/^\/api\/pauta\/camara\/(\d+)\/itens$/, pautaItens],
    [/^\/api\/proposicoes$/, buscarProposicoes],
    [/^\/api\/proposicoes\/(\d+)$/, getProposicao],
  ];

  /** Retorna { status, body } ou null se a rota não existir. */
  return async function handle(pathname, query) {
    for (const [re, fn] of routes) {
      const m = re.exec(pathname);
      if (!m) continue;
      try {
        const body = await fn({ q: query }, ...m.slice(1));
        return { status: 200, body };
      } catch (e) {
        if (e instanceof ApiError) return { status: e.status, body: { erro: e.message } };
        console.error('[api]', pathname, e);
        return { status: 500, body: { erro: 'Erro interno ao consultar os dados' } };
      }
    }
    return null;
  };
}
