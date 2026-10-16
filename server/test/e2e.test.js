import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  startMock, DEPUTADOS, DEP_SEM_VOTOS, VOT, SESSOES, CPF, voteV1, voteV3, d,
} from './mock-upstream.js';
import { today } from '../util.js';

let mock, app, base, tmp;
const get = async (p, opts) => {
  const r = await fetch(base + p, opts);
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body, headers: r.headers };
};
const cat = (t) => ({ Sim: 'sim', 'Não': 'nao', 'Abstenção': 'abst', 'Obstrução': 'obst' }[t]);

before(async () => {
  mock = await startMock();
  process.env.CAMARA_BASE = mock.camaraBase;
  process.env.SENADO_BASE = mock.senadoBase;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-test-'));
  fs.mkdirSync(path.join(tmp, 'dist', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'dist', 'index.html'), '<!doctype html><title>spa</title>');
  fs.writeFileSync(path.join(tmp, 'dist', 'assets', 'a.js'), 'console.log(1)');
  fs.writeFileSync(path.join(tmp, 'segredo.txt'), 'nao deve vazar');
  const { createApp } = await import('../app.js');
  const { runSync, syncState } = await import('../sync.js');
  app = await createApp({ db: process.env.TEST_DATABASE_URL || 'memory://', staticDir: path.join(tmp, 'dist'), autoSync: false });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  const r = await runSync(app.db, { from: d(-70) });
  assert.equal(r.erros, 0, `sync com erros: ${syncState.ultimoErro}`);
});

after(async () => {
  await app.close();
  await mock.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('retry: a falha 503 temporária não derrubou a votação', async () => {
  assert.ok(mock.hits.flakyServed, 'o mock deveria ter servido o 503');
  const v = await get('/api/votacoes/camara/9003-1');
  assert.equal(v.status, 200);
});

test('status e cobertura', async () => {
  const { body } = await get('/api/status');
  assert.equal(body.camara.votacoes, 4); // v1, v2, v3, vr (a de comissão não entra)
  assert.equal(body.camara.nominais, 3);
  assert.equal(body.senado.votacoes, 2);
  assert.equal(body.senado.nominais, 1);
  assert.equal(body.camara.sessoes, 3); // a não deliberativa fica de fora
  assert.equal(body.sync.running, false);
});

test('lista de votações: ordem, filtros e paginação', async () => {
  const all = (await get('/api/votacoes?casa=camara&limit=100')).body;
  assert.equal(all.total, 4);
  assert.deepEqual(all.itens.map((x) => x.id), ['9004-1', '9003-1', '9002-1', '9001-1']);
  const p2 = (await get('/api/votacoes?casa=camara&limit=2&offset=2')).body;
  assert.deepEqual(p2.itens.map((x) => x.id), ['9002-1', '9001-1']);
  assert.equal((await get('/api/votacoes?casa=camara&resultado=no')).body.total, 1);
  assert.equal((await get('/api/votacoes?casa=camara&nominal=1')).body.total, 3);
  assert.equal((await get(`/api/votacoes?casa=camara&de=${d(-59)}&ate=${d(-58)}`)).body.total, 2);
  assert.equal((await get('/api/votacoes?q=doacao')).body.total, 1); // sem acento acha "Doação"
  assert.equal((await get('/api/votacoes?q=%25')).body.total, 0); // % não é curinga
  const both = (await get('/api/votacoes?limit=100')).body;
  assert.equal(both.total, 6);
  assert.ok(both.itens.some((x) => x.casa === 'senado'));
});

test('detalhe da votação com mais de 100 votos (paginação da fonte)', async () => {
  const { body } = await get('/api/votacoes/camara/9001-1');
  const votantes = DEPUTADOS.filter((x) => voteV1(x));
  assert.equal(body.votos.length, votantes.length);
  assert.ok(votantes.length > 100);
  const expected = { sim: 0, nao: 0, abst: 0, obst: 0 };
  for (const x of votantes) expected[cat(voteV1(x))]++;
  assert.deepEqual({ sim: body.votacao.placar.sim, nao: body.votacao.placar.nao, abst: body.votacao.placar.abst, obst: body.votacao.placar.obst }, expected);
  assert.equal(body.votacao.placar.total, votantes.length);
  assert.equal(body.votacao.titulo, 'PL 100/2026');
  const v1001 = body.votos.find((x) => x.id === 1001);
  assert.equal(v1001.cat, 'sim');
  assert.equal(v1001.partido, 'PL');
  assert.ok(!body.votos.some((x) => x.id === 1010), 'quem não votou não aparece como voto');
});

test('orientação, alinhamento e quadro por partido', async () => {
  const { body } = await get('/api/votacoes/camara/9003-1');
  assert.equal(body.votacao.aprovada, false);
  assert.ok(body.orientacoes.some((o) => o.nome === 'PL' && o.cat === 'sim'));
  const pl = body.partidos.find((p) => p.partido === 'PL');
  const pt = body.partidos.find((p) => p.partido === 'PT');
  const pp = body.partidos.find((p) => p.partido === 'PP');
  assert.equal(pl.orientacao, 'sim');
  assert.equal(pl.refTipo, 'orientacao');
  const membrosPL = DEPUTADOS.filter((x) => x.siglaPartido === 'PL');
  const seguiuPL = membrosPL.filter((x) => voteV3(x) === 'Sim').length;
  assert.equal(pl.seguiu, Math.round((1000 * seguiuPL) / membrosPL.length) / 10);
  assert.equal(pt.orientacao, 'nao');
  const membrosPT = DEPUTADOS.filter((x) => x.siglaPartido === 'PT');
  const seguiuPT = membrosPT.filter((x) => voteV3(x) === 'Não').length;
  assert.equal(pt.seguiu, Math.round((1000 * seguiuPT) / membrosPT.length) / 10);
  assert.equal(pp.seguiu, null); // bancada liberada
  const dep = body.votos.find((x) => x.id === 1002); // PT, votou Sim contra a orientação Não
  assert.equal(dep.cat, 'sim');
  assert.equal(dep.alinhado, false);
  const dep1 = body.votos.find((x) => x.id === 1001);
  assert.equal(dep1.alinhado, true);
  assert.equal(body.votos.find((x) => x.id === 1003).alinhado, null);
});

test('votação do Senado: voto por senador, ausência e id com ":"', async () => {
  const lista = (await get('/api/votacoes?casa=senado')).body.itens;
  const v = lista.find((x) => x.titulo === 'PEC 221/2019');
  assert.ok(v);
  for (const id of [v.id, encodeURIComponent(v.id)]) {
    const { status, body } = await get(`/api/votacoes/senado/${id}`);
    assert.equal(status, 200);
    assert.equal(body.votos.length, 5);
    assert.equal(body.votacao.placar.sim, 2);
    assert.equal(body.votacao.placar.nao, 1);
    assert.equal(body.votacao.placar.aus, 2);
    assert.equal(body.votos.find((x) => x.id === 701).raw, 'NCom');
  }
  const secreta = lista.find((x) => x.titulo === 'PL 10/2026');
  assert.equal(secreta.secreta, true);
  assert.equal(secreta.aprovada, false);
  assert.equal((await get('/api/votacoes/senado/nao-existe')).status, 404);
});

test('parlamentares: busca, filtros e perfil', async () => {
  const todos = (await get('/api/parlamentares?casa=camara&limit=100')).body;
  assert.equal(todos.total, DEPUTADOS.length + 1);
  assert.equal(todos.itens.length, 100);
  assert.equal((await get('/api/parlamentares?casa=camara&q=1042')).body.itens[0].id, 1042);
  assert.equal((await get('/api/parlamentares?casa=camara&partido=pt&uf=rj&limit=100')).body.itens.every((x) => x.partido === 'PT' && x.uf === 'RJ'), true);
  const f = (await get('/api/parlamentares/filtros?casa=camara')).body;
  assert.ok(f.partidos.includes('PL') && f.ufs.includes('SP'));
  const sen = (await get('/api/parlamentares?casa=senado')).body;
  assert.equal(sen.total, 5);
  const perfil = (await get('/api/parlamentares/camara/1001')).body;
  assert.equal(perfil.parlamentar.nome, 'Deputado 1001');
  assert.equal(perfil.detalhe.gabinete.telefone, '3215-5714');
  assert.equal((await get('/api/parlamentares/camara/999999')).status, 404);
  assert.equal((await get('/api/parlamentares/camara/abc')).status, 404);
});

test('CPF nunca aparece nas respostas nem no banco', async () => {
  const r = await get('/api/parlamentares/camara/1001');
  assert.ok(!JSON.stringify(r.body).includes(CPF));
  const cache = await app.db.all('SELECT body FROM http_cache');
  assert.ok(cache.every((c) => !c.body.includes(CPF)));
});

test('histórico de votos de um deputado, com filtros', async () => {
  const { body } = await get('/api/parlamentares/camara/1001/votos?limit=100');
  assert.equal(body.total, 3); // v1, v3, vr
  assert.deepEqual(body.itens.map((x) => x.id), ['9004-1', '9003-1', '9001-1']);
  assert.equal(body.itens.find((x) => x.id === '9001-1').voto, cat(voteV1(DEPUTADOS[0])));
  assert.equal(body.itens.find((x) => x.id === '9003-1').refTipo, 'orientacao');
  assert.equal(body.itens.find((x) => x.id === '9003-1').partidoNaData, 'PL');
  assert.equal((await get('/api/parlamentares/camara/1001/votos?voto=sim')).body.total, 3);
  assert.equal((await get('/api/parlamentares/camara/1001/votos?voto=nao')).body.total, 0);
  assert.equal((await get('/api/parlamentares/camara/1001/votos?resultado=no')).body.total, 1);
  assert.equal((await get(`/api/parlamentares/camara/1001/votos?de=${d(-5)}`)).body.total, 1);
  assert.equal((await get('/api/parlamentares/camara/1001/votos?q=doacao')).body.total, 1);
  const pag = (await get('/api/parlamentares/camara/1001/votos?limit=1&offset=1')).body;
  assert.equal(pag.itens[0].id, '9003-1');
  assert.equal(pag.total, 3);
});

test('"sem registro": votações nominais em que o deputado não votou', async () => {
  // 1010 estava presente na 1ª sessão (início da janela) mas não votou na votação 9001-1
  const r = (await get('/api/parlamentares/camara/1010/votos?voto=sem&limit=100')).body;
  assert.deepEqual(r.itens.map((x) => x.id), ['9001-1']);
  assert.equal(r.itens[0].voto, null);
  const todas = (await get('/api/parlamentares/camara/1010/votos?ausencias=1&limit=100')).body;
  assert.equal(todas.total, 3);
  const st = (await get('/api/parlamentares/camara/1010')).body.stats;
  assert.equal(st.nominais, 3);
  assert.equal(st.votos.total, 2);
  assert.equal(st.participacao, Math.round((1000 * 2) / 3) / 10);
});

test('estatísticas e presença do deputado (Câmara)', async () => {
  const s1 = (await get('/api/parlamentares/camara/1001')).body.stats;
  assert.equal(s1.participacao, 100);
  assert.equal(s1.presenca.base, 'sessoes');
  assert.equal(s1.presenca.total, 3);
  assert.equal(s1.presenca.presentes, 3);
  assert.equal(s1.alinhamento.comReferencia, 3);
  const p1005 = (await get('/api/parlamentares/camara/1005/presenca')).body;
  assert.equal(p1005.total, 3);
  assert.equal(p1005.presentes, 1);
  assert.equal(p1005.pct, 33.3);
  assert.equal(p1005.sessoes.length, 3);
  assert.equal(p1005.sessoes.filter((x) => x.presente).length, 1);
  assert.ok(p1005.meses.length >= 1);
  const aus = (await get('/api/parlamentares/camara/1005/presenca?so=ausencias')).body;
  assert.equal(aus.sessoes.length, 2);
  assert.equal(aus.sessoes.every((x) => !x.presente), true);
  const pf = SESSOES.filter((x) => x.present(DEPUTADOS.find((y) => y.id === 1010))).length;
  assert.equal((await get('/api/parlamentares/camara/1010/presenca')).body.presentes, pf);
});

test('deputado sem nenhum registro não quebra', async () => {
  const id = DEP_SEM_VOTOS.id;
  const p = await get(`/api/parlamentares/camara/${id}`);
  assert.equal(p.status, 200);
  assert.equal(p.body.stats.votos, null);
  assert.equal((await get(`/api/parlamentares/camara/${id}/votos`)).body.total, 0);
  assert.equal((await get(`/api/parlamentares/camara/${id}/votos?ausencias=1`)).body.total, 0);
  assert.equal((await get(`/api/parlamentares/camara/${id}/presenca`)).body.total, 0);
});

test('Senado: estatísticas e presença derivadas dos votos', async () => {
  const ciro = (await get('/api/parlamentares/senado/739')).body.stats;
  assert.equal(ciro.presenca.base, 'votacoes');
  assert.equal(ciro.presenca.pct, 100); // P-NRV = estava presente
  assert.equal(ciro.participacao, 0);
  const s5 = (await get('/api/parlamentares/senado/701')).body.stats;
  assert.equal(s5.presenca.pct, 0);
  const alan = (await get('/api/parlamentares/senado/5672/votos')).body.itens;
  assert.equal(alan.length, 1);
  assert.equal(alan[0].voto, 'sim');
});

test('proposições do deputado: autoria, tipos, leis (situação conferida em segundo plano)', async () => {
  const first = (await get('/api/parlamentares/camara/1001/proposicoes?limit=100')).body;
  assert.equal(first.resumo.total, 5);
  assert.deepEqual(first.itens.map((x) => x.tipo).sort(), ['PEC', 'PL', 'PL']); // "principais" não inclui requerimentos
  assert.equal((await get('/api/parlamentares/camara/1001/proposicoes?tipos=todos')).body.total, 5);
  assert.equal((await get('/api/parlamentares/camara/1001/proposicoes?tipos=REQ')).body.total, 2);
  let r;
  for (let i = 0; i < 40; i++) {
    r = (await get('/api/parlamentares/camara/1001/proposicoes?limit=100')).body;
    if (r.resumo.pendentes === 0) break;
    await new Promise((x) => setTimeout(x, 100));
  }
  assert.equal(r.resumo.pendentes, 0);
  assert.equal(r.resumo.leis, 1);
  const leis = (await get('/api/parlamentares/camara/1001/proposicoes?leis=1')).body;
  assert.equal(leis.total, 1);
  assert.equal(leis.itens[0].id, 7001);
  assert.equal(leis.itens[0].lei, true);
  const pec = r.itens.find((x) => x.id === 7004);
  assert.equal(pec.lei, false);
  assert.equal(pec.orgao, 'CCJC');
  assert.equal((await get('/api/parlamentares/camara/1001/proposicoes?ano=2025&tipos=todos')).body.total, 2);
  const sen = (await get('/api/parlamentares/senado/5672/proposicoes')).body;
  assert.equal(sen.total, 2);
  assert.equal(sen.semSituacao, true);
  assert.equal(sen.itens[0].tipo, 'PL');
});

test('proposição: busca e detalhe', async () => {
  assert.equal((await get('/api/proposicoes')).status, 400);
  const b = (await get('/api/proposicoes?q=doacao')).body;
  assert.equal(b.itens[0].id, 7001);
  const p = (await get('/api/proposicoes/7001')).body;
  assert.equal(p.proposicao.lei, true);
  assert.equal(p.autores[0].deputadoId, 1001);
  assert.equal(p.tramitacoes[0].situacao, 'Transformado em Norma Jurídica');
  assert.equal(p.votacoes[0].naBase, true);
  assert.equal((await get('/api/proposicoes/99999999')).status, 404);
});

test('partidos', async () => {
  const { body } = await get('/api/partidos?casa=camara');
  const pl = body.itens.find((x) => x.partido === 'PL');
  assert.ok(pl.membros > 30);
  assert.equal(body.nominais, 3);
  const soma = pl.sim + pl.nao + pl.abstObst;
  assert.ok(Math.abs(soma - 100) < 0.5);
  assert.ok(pl.alinhamento != null);
});

test('pauta ao vivo (Câmara e Senado) e cache', async () => {
  const q = `/api/pauta?ini=${today()}&fim=${today()}`;
  const a = (await get(q)).body;
  assert.deepEqual(a.erros, {});
  const cam = a.itens.find((x) => x.casa === 'camara');
  const sen = a.itens.find((x) => x.casa === 'senado');
  assert.equal(cam.orgao, 'CCJC');
  assert.equal(cam.hora, '09:30');
  assert.equal(sen.cat, 'deliberativa');
  assert.equal(sen.itens[0].titulo, 'PL 1/2026');
  const antes = mock.hits.byPath.get('/camara/api/v2/eventos');
  await get(q);
  assert.equal(mock.hits.byPath.get('/camara/api/v2/eventos'), antes, 'segunda consulta deve vir do cache');
  assert.equal((await get('/api/pauta?ini=2026-01-01&fim=2026-06-01')).status, 400);
  const itens = (await get('/api/pauta/camara/8100/itens')).body;
  assert.equal(itens[0].propId, 2353617);
  assert.equal(itens[0].relator.nome, 'Detinha');
  assert.equal(itens[0].votacaoId, '9001-1');
});

test('fonte oficial fora do ar: pauta usa cópia guardada', async () => {
  const ini = d(1), fim = d(2);
  const key = `pauta:camara:${ini}:${fim}`;
  await app.db.run('INSERT INTO http_cache (key, ts, body) VALUES (?, ?, ?)', key, Date.now() - 3600 * 1000, JSON.stringify([{ casa: 'camara', id: 'x', data: ini, hora: '10:00', cat: 'outros' }]));
  const saved = process.env.CAMARA_BASE;
  process.env.CAMARA_BASE = 'http://127.0.0.1:1/camara/api/v2'; // porta fechada
  try {
    const r = (await get(`/api/pauta?ini=${ini}&fim=${fim}&casa=camara`)).body;
    assert.equal(r.itens.length, 1);
    assert.equal(r.itens[0].id, 'x');
  } finally { process.env.CAMARA_BASE = saved; }
});

test('ressincronizar não duplica dados (idempotente) e é retomável', async () => {
  const { runSync } = await import('../sync.js');
  const antes = {
    v: (await app.db.get('SELECT COUNT(*) n FROM voto')).n,
    s: (await app.db.get('SELECT COUNT(*) n FROM presenca')).n,
    vt: (await app.db.get('SELECT COUNT(*) n FROM votacao')).n,
  };
  const det = (id) => mock.hits.byPath.get(`/camara/api/v2/votacoes/${id}`) || 0;
  const antigas = [det('9001-1'), det('9002-1'), det('9003-1')];
  const recente = det('9004-1');
  await runSync(app.db, { from: d(-70) });
  assert.equal((await app.db.get('SELECT COUNT(*) n FROM voto')).n, antes.v);
  assert.equal((await app.db.get('SELECT COUNT(*) n FROM presenca')).n, antes.s);
  assert.equal((await app.db.get('SELECT COUNT(*) n FROM votacao')).n, antes.vt);
  // só a votação recente (últimos 3 dias) é baixada de novo; as antigas não
  assert.deepEqual([det('9001-1'), det('9002-1'), det('9003-1')], antigas);
  assert.equal(det('9004-1'), recente + 1);
});

test('segurança do servidor estático e da API', async () => {
  assert.equal((await get('/healthz')).body, 'ok');
  const idx = await get('/votacoes/camara/9001-1'); // rota do app
  assert.equal(idx.status, 200);
  assert.match(idx.body, /<title>spa<\/title>/);
  assert.equal(idx.headers.get('x-content-type-options'), 'nosniff');
  assert.match(idx.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await get('/assets/a.js')).status, 200);
  assert.match((await get('/assets/a.js')).headers.get('cache-control'), /immutable/);
  assert.equal((await get('/assets/nao-existe.js')).status, 404);
  // path traversal (requisição crua para o cliente não normalizar)
  const net = await import('node:net');
  const raw = (p) => new Promise((resolve) => {
    const s = net.connect(app.server.address().port, '127.0.0.1', () => s.write(`GET ${p} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`));
    let buf = ''; s.on('data', (c) => { buf += c; }); s.on('close', () => resolve(buf));
  });
  for (const p of ['/../segredo.txt', '/%2e%2e/segredo.txt', '/..%2fsegredo.txt', '/assets/../../segredo.txt']) {
    const out = await raw(p);
    assert.ok(!out.includes('nao deve vazar'), `vazou em ${p}`);
  }
  const post = await fetch(base + '/api/status', { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal((await get('/api/inexistente')).status, 404);
  assert.equal((await get('/api/votacoes?limit=abc&offset=-5')).status, 200);
  assert.equal((await get('/api/votacoes/camara/%E0%A4%A')).status, 400);
  // injeção de SQL via busca vira texto comum
  const sqli = (await get("/api/votacoes?q=" + encodeURIComponent("'; DROP TABLE votacao; --"))).body;
  assert.equal(sqli.total, 0);
  assert.equal((await get('/api/status')).body.camara.votacoes, 4);
});

test('compressão gzip em respostas grandes', async () => {
  const r = await fetch(base + '/api/votacoes/camara/9001-1', { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(r.headers.get('content-encoding'), 'gzip');
  const j = await r.json();
  assert.ok(j.votos.length > 100);
});

test('trava: só uma importação por vez, mesmo entre processos', async () => {
  const { runSync } = await import('../sync.js');
  // simula outra máquina (ex.: GitHub Actions) com a trava ativa
  await app.db.setMeta('sync_lock', JSON.stringify({ owner: 'outro-processo', until: Date.now() + 60000 }));
  const r = await runSync(app.db, { from: d(-5) });
  assert.equal(r.skipped, true);
  // trava vencida é ignorada
  await app.db.setMeta('sync_lock', JSON.stringify({ owner: 'outro-processo', until: Date.now() - 1 }));
  const r2 = await runSync(app.db, { from: d(-5) });
  assert.notEqual(r2.skipped, true);
  assert.equal(await app.db.getMeta('sync_lock'), null);
});

test('progresso da importação fica salvo no banco e aparece no status', async () => {
  const st = JSON.parse(await app.db.getMeta('sync_state'));
  assert.equal(st.running, false);
  assert.match(st.fase, /concluído/);
  const { body } = await get('/api/status');
  assert.equal(body.sync.running, false);
  assert.ok(body.banco && typeof body.banco.tipo === 'string');
});

test('limite de tempo pausa a importação sem erro', async () => {
  const { runSync, syncState } = await import('../sync.js');
  await app.db.run("DELETE FROM meta WHERE key LIKE 'done:%'");
  const r = await runSync(app.db, { from: d(-70), maxMinutes: 0.00001 });
  assert.equal(r.interrompido, true);
  assert.match(syncState.fase, /pausado/);
});
