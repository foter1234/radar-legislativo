// Simula as APIs oficiais (Câmara e Senado) com os mesmos formatos de resposta observados nas APIs reais.
import http from 'node:http';
import { addDays, today } from '../util.js';

const PARTIES = ['PL', 'PT', 'PP', 'UNIÃO', 'PSD', 'MDB'];
const UFS = ['SP', 'RJ', 'MG', 'BA', 'CE', 'PB'];
export const DEPUTADOS = Array.from({ length: 230 }, (_, i) => {
  const id = 1001 + i;
  return { id, nome: `Deputado ${String(id).padStart(4, '0')}`, siglaPartido: PARTIES[i % 6], siglaUf: UFS[i % 6], idLegislatura: 57, urlFoto: `https://www.camara.leg.br/internet/deputado/bandep/${id}.jpg`, email: null };
});
export const DEP_SEM_VOTOS = { id: 2000, nome: 'Deputado Sem Votos', siglaPartido: 'PSD', siglaUf: 'SP', idLegislatura: 57, urlFoto: null, email: null };
const depRef = (d) => ({ id: d.id, uri: `x/deputados/${d.id}`, nome: d.nome, siglaPartido: d.siglaPartido, uriPartido: null, siglaUf: d.siglaUf, idLegislatura: 57, urlFoto: d.urlFoto, email: d.email });

export const d = (n) => addDays(today(), n);
// votações do Plenário (datas relativas a hoje para o teste não depender do calendário)
export const VOT = {
  v1: { id: '9001-1', data: d(-60), tipo: 'nominal' },
  v2: { id: '9002-1', data: d(-59), tipo: 'simbolica' },
  v3: { id: '9003-1', data: d(-58), tipo: 'orientada' },
  vr: { id: '9004-1', data: d(-1), tipo: 'recente' },
  cn: { id: '9005-1', data: d(-58), tipo: 'comissao' },
};
export const voteV1 = (dep) => (dep.id % 10 === 0 ? null : ['Sim', 'Sim', 'Sim', 'Não', 'Não', 'Abstenção', 'Obstrução'][dep.id % 7]);
export const voteV3 = (dep) => (dep.id % 5 === 0 ? 'Não' : 'Sim');
export const voteVR = () => 'Sim';
export const ORIENT_V3 = [
  { orientacaoVoto: '', codTipoLideranca: 'B', siglaPartidoBloco: 'Maioria' },
  { orientacaoVoto: 'Não', codTipoLideranca: 'B', siglaPartidoBloco: 'Governo' },
  { orientacaoVoto: 'Sim', codTipoLideranca: 'P', siglaPartidoBloco: 'PL' },
  { orientacaoVoto: 'Não', codTipoLideranca: 'P', siglaPartidoBloco: 'PT' },
  { orientacaoVoto: 'Liberado', codTipoLideranca: 'P', siglaPartidoBloco: 'PP' },
];
export const SESSOES = [
  { id: 8001, data: d(-60), present: (dep) => dep.id % 10 !== 5 },
  { id: 8002, data: d(-59), present: (dep) => dep.id % 5 !== 0 },
  { id: 8003, data: d(-58), present: () => true },
];

const SEN = [
  { codigoParlamentar: 5672, nomeParlamentar: 'Alan Rick', siglaPartidoParlamentar: 'REPUBLICANOS', siglaUFParlamentar: 'AC' },
  { codigoParlamentar: 739, nomeParlamentar: 'Ciro Nogueira', siglaPartidoParlamentar: 'PP', siglaUFParlamentar: 'PI' },
  { codigoParlamentar: 6336, nomeParlamentar: 'Camilo Santana', siglaPartidoParlamentar: 'PT', siglaUFParlamentar: 'CE' },
  { codigoParlamentar: 700, nomeParlamentar: 'Senadora Quatro', siglaPartidoParlamentar: 'PT', siglaUFParlamentar: 'BA' },
  { codigoParlamentar: 701, nomeParlamentar: 'Senador Cinco', siglaPartidoParlamentar: 'PT', siglaUFParlamentar: 'RJ' },
];
export const SEN_VOTACOES = [
  { sessao: 591267, cod: 7106, seq: 4420, data: d(-60), id: 'PEC 221/2019', materia: 174386, secreta: 'N', resultado: 'A',
    votos: ['Sim', 'P-NRV', 'Não', 'Sim', 'NCom'] },
  { sessao: 591300, cod: 7110, seq: 4430, data: d(-40), id: 'PL 10/2026', materia: 180001, secreta: 'S', resultado: 'R', votos: [] },
];

const CPF_SECRETO = '81099266300';
export const CPF = CPF_SECRETO;
export const AUTORIA_1001 = [
  { id: 7005, siglaTipo: 'REQ', numero: 50, ano: 2026, ementa: 'Requer informações ao Ministério.', dataApresentacao: `${d(-5)}T10:00` },
  { id: 7004, siglaTipo: 'PEC', numero: 9, ano: 2026, ementa: 'Altera a Constituição sobre transparência.', dataApresentacao: `${d(-20)}T10:00` },
  { id: 7003, siglaTipo: 'PL', numero: 300, ano: 2025, ementa: 'Cria o programa Saúde Perto de Você.', dataApresentacao: '2025-06-01T10:00' },
  { id: 7002, siglaTipo: 'REQ', numero: 2, ano: 2025, ementa: 'Requer audiência pública.', dataApresentacao: '2025-03-01T10:00' },
  { id: 7001, siglaTipo: 'PL', numero: 12, ano: 2024, ementa: 'Institui o Dia Nacional da Doação de Órgãos.', dataApresentacao: '2024-05-01T10:00' },
];

function paginate(arr, url, key = 'dados') {
  const itens = Math.min(100, Number(url.searchParams.get('itens')) || 15);
  const pagina = Number(url.searchParams.get('pagina')) || 1;
  const slice = arr.slice((pagina - 1) * itens, pagina * itens);
  const links = [{ rel: 'self', href: `http://${url.host}${url.pathname}${url.search}` }];
  if (pagina * itens < arr.length) {
    const u = new URL(url); u.searchParams.set('pagina', String(pagina + 1)); u.searchParams.set('itens', String(itens));
    links.push({ rel: 'next', href: `http://${url.host}${u.pathname}${u.search}` });
  }
  return { [key]: slice, links };
}

export async function startMock() {
  const hits = { total: 0, votos: 0, byPath: new Map(), flakyServed: false };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    hits.total++;
    hits.byPath.set(url.pathname, (hits.byPath.get(url.pathname) || 0) + 1);
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    const p = url.pathname;
    const inRange = (date) => (!url.searchParams.get('dataInicio') || date >= url.searchParams.get('dataInicio')) && (!url.searchParams.get('dataFim') || date <= url.searchParams.get('dataFim'));

    /* ------------ Câmara ------------ */
    if (p.startsWith('/camara/api/v2')) {
      const c = p.slice('/camara/api/v2'.length);
      if (c === '/deputados') return json(200, paginate([...DEPUTADOS, DEP_SEM_VOTOS].map(depRef), url));
      let m;
      if ((m = /^\/deputados\/(\d+)$/.exec(c))) {
        const dep = DEPUTADOS.find((x) => x.id === Number(m[1]));
        if (!dep) return json(404, {});
        return json(200, { dados: { id: dep.id, nomeCivil: `NOME CIVIL ${dep.id}`, cpf: CPF_SECRETO, sexo: 'F', dataNascimento: '1979-01-25', ufNascimento: 'CE', municipioNascimento: 'Cariús', escolaridade: 'Superior', urlWebsite: null, redeSocial: ['https://instagram.com/x'],
          ultimoStatus: { ...depRef(dep), nomeEleitoral: dep.nome, situacao: 'Exercício', condicaoEleitoral: 'Titular', gabinete: { nome: '714', predio: '4', sala: '714', andar: '7', telefone: '3215-5714', email: 'x@camara.leg.br' } } } });
      }
      if (c === '/votacoes') {
        if (url.searchParams.get('idOrgao') !== '180') return json(400, {});
        const all = Object.values(VOT).filter((v) => inRange(v.data)).map((v) => ({
          id: v.id, uri: `x/votacoes/${v.id}`, data: v.data, dataHoraRegistro: `${v.data}T20:00:00`, siglaOrgao: v.tipo === 'comissao' ? 'CN' : 'PLEN', uriEvento: 'x/eventos/8001',
          proposicaoObjeto: null, descricao: `Votação ${v.tipo}`, aprovacao: v.tipo === 'orientada' ? 0 : 1,
        })).sort((a, b) => a.dataHoraRegistro.localeCompare(b.dataHoraRegistro));
        return json(200, paginate(all, url));
      }
      if ((m = /^\/votacoes\/([^/]+)$/.exec(c))) {
        const v = Object.values(VOT).find((x) => x.id === m[1]);
        if (!v) return json(404, {});
        if (v.tipo === 'orientada' && !hits.flakyServed) { hits.flakyServed = true; return json(503, { erro: 'instável' }); }
        const props = v.tipo === 'nominal' ? [{ id: 5001, siglaTipo: 'PL', numero: 100, ano: 2026, ementa: 'Institui o Dia Nacional da Doação de Órgãos.' }]
          : v.tipo === 'orientada' ? [{ id: 5003, siglaTipo: 'PLP', numero: 281, ano: 2019, ementa: 'Dispõe sobre regimes de resolução.' }] : [];
        return json(200, { dados: { id: v.id, data: v.data, dataHoraRegistro: `${v.data}T20:00:00`, siglaOrgao: 'PLEN', idEvento: 8001, descricao: `Votação ${v.tipo}`, aprovacao: v.tipo === 'orientada' ? 0 : 1,
          ultimaApresentacaoProposicao: { descricao: 'Parecer do Relator' }, proposicoesAfetadas: props, objetosPossiveis: [] } });
      }
      if ((m = /^\/votacoes\/([^/]+)\/votos$/.exec(c))) {
        hits.votos++;
        const v = Object.values(VOT).find((x) => x.id === m[1]);
        if (!v) return json(404, {});
        const fn = { nominal: voteV1, orientada: voteV3, recente: voteVR }[v.tipo];
        const rows = fn ? DEPUTADOS.map((dep) => ({ dep, t: fn(dep) })).filter((x) => x.t).map((x) => ({ tipoVoto: x.t, dataRegistroVoto: `${v.data}T20:00:00`, deputado_: depRef(x.dep) })) : [];
        return json(200, paginate(rows, url));
      }
      if ((m = /^\/votacoes\/([^/]+)\/orientacoes$/.exec(c))) {
        const v = Object.values(VOT).find((x) => x.id === m[1]);
        return json(200, paginate(v && v.tipo === 'orientada' ? ORIENT_V3 : [], url));
      }
      if (c === '/eventos') {
        if (url.searchParams.get('idOrgao') !== '180') {
          // consulta da pauta (todos os órgãos): um evento hoje
          const ev = [{ id: 8100, dataHoraInicio: `${today()}T09:30`, situacao: 'Convocada', descricaoTipo: 'Reunião Deliberativa', descricao: 'Reunião da CCJC', orgaos: [{ sigla: 'CCJC', nome: 'Comissão de Constituição e Justiça' }], localCamara: { nome: 'Plenário 1' } }]
            .filter((e) => inRange(e.dataHoraInicio.slice(0, 10)));
          return json(200, paginate(ev, url));
        }
        const evs = SESSOES.filter((s) => inRange(s.data)).map((s) => ({ id: s.id, dataHoraInicio: `${s.data}T14:00`, situacao: 'Encerrada', descricaoTipo: 'Sessão Deliberativa', descricao: 'Sessão Deliberativa Extraordinária', orgaos: [{ sigla: 'PLEN', nome: 'Plenário' }], localCamara: { nome: 'Plenário' } }));
        if (inRange(SESSOES[0].data)) evs.push({ id: 8099, dataHoraInicio: `${SESSOES[0].data}T10:00`, situacao: 'Encerrada', descricaoTipo: 'Sessão Não Deliberativa de Debates', descricao: 'Debates', orgaos: [{ sigla: 'PLEN', nome: 'Plenário' }] });
        return json(200, paginate(evs, url));
      }
      if (c === '/eventos' || /^\/eventos\?/.test(c)) return json(200, paginate([], url));
      if ((m = /^\/eventos\/(\d+)\/deputados$/.exec(c))) {
        const s = SESSOES.find((x) => x.id === Number(m[1]));
        if (!s) return json(404, {});
        return json(200, paginate(DEPUTADOS.filter(s.present).map(depRef), url));
      }
      if ((m = /^\/eventos\/(\d+)\/pauta$/.exec(c))) {
        return json(200, paginate([{ ordem: 1, topico: 'Discussão', regime: 'Urgência', titulo: 'PL 1435/2023', proposicao_: { id: 2353617, siglaTipo: 'PL', numero: 1435, ano: 2023, ementa: 'Dispõe sobre cartazes.' }, relator: { id: 1002, nome: 'Detinha', siglaPartido: 'PL', siglaUf: 'MA' }, uriVotacao: 'x/votacoes/9001-1', situacaoItem: null }], url));
      }
      if (c === '/proposicoes') {
        if (url.searchParams.get('idDeputadoAutor') === '1001') return json(200, paginate(AUTORIA_1001, url));
        return json(200, paginate([{ id: 7001, siglaTipo: 'PL', numero: 12, ano: 2024, ementa: 'Institui o Dia Nacional da Doação de Órgãos.', dataApresentacao: '2024-05-01T10:00' }], url));
      }
      if ((m = /^\/proposicoes\/(\d+)$/.exec(c))) {
        const a = AUTORIA_1001.find((x) => x.id === Number(m[1]));
        if (!a) return json(404, {});
        const lei = a.id === 7001;
        return json(200, { dados: { id: a.id, siglaTipo: a.siglaTipo, numero: a.numero, ano: a.ano, ementa: a.ementa, dataApresentacao: a.dataApresentacao, descricaoTipo: 'Projeto', urlInteiroTeor: 'https://x/y.pdf',
          statusProposicao: lei ? { dataHora: '2025-01-10T10:00', siglaOrgao: 'MESA', descricaoTramitacao: 'Sanção', descricaoSituacao: 'Transformado em Norma Jurídica', codSituacao: 1140, despacho: 'Transformado na Lei Ordinária 15.000/2025' }
            : { dataHora: '2026-07-08T19:03', siglaOrgao: 'CCJC', descricaoTramitacao: 'Recebimento - Relator(a)', descricaoSituacao: null, codSituacao: null, despacho: 'Aguardando parecer' } } });
      }
      if ((m = /^\/proposicoes\/(\d+)\/autores$/.exec(c))) return json(200, paginate([{ uri: 'x/deputados/1001', nome: 'Deputado 1001', codTipo: 10000, tipo: 'Deputado(a)', ordemAssinatura: 1, proponente: 1 }], url));
      if ((m = /^\/proposicoes\/(\d+)\/tramitacoes$/.exec(c))) return json(200, paginate([{ dataHora: '2024-05-01T10:00', siglaOrgao: 'PLEN', descricaoTramitacao: 'Apresentação', descricaoSituacao: 'Aguardando', despacho: 'apresentação' }, { dataHora: '2025-01-10T10:00', siglaOrgao: 'MESA', descricaoTramitacao: 'Sanção', descricaoSituacao: 'Transformado em Norma Jurídica', despacho: 'Lei' }], url));
      if ((m = /^\/proposicoes\/(\d+)\/votacoes$/.exec(c))) return json(200, paginate([{ id: '9001-1', data: VOT.v1.data, dataHoraRegistro: `${VOT.v1.data}T20:00:00`, siglaOrgao: 'PLEN', descricao: 'Aprovado', aprovacao: 1 }], url));
      return json(404, { erro: 'rota do mock não existe: ' + c });
    }

    /* ------------ Senado ------------ */
    if (p.startsWith('/senado/dadosabertos')) {
      const s = p.slice('/senado/dadosabertos'.length);
      if (s === '/votacao') {
        const arr = SEN_VOTACOES.filter((v) => inRange(v.data)).map((v) => ({
          ano: 2026, casaSessao: 'SF', codigoMateria: v.materia, codigoSessao: v.sessao, codigoSessaoVotacao: v.cod, dataSessao: v.data, descricaoVotacao: `Votação nominal da ${v.id}`, ementa: `Ementa da ${v.id}`,
          identificacao: v.id, resultadoVotacao: v.resultado, sequencialVotacao: v.seq, votacaoSecreta: v.secreta, totalVotosSim: null,
          votos: v.votos.map((t, i) => ({ ...SEN[i], siglaVotoParlamentar: t, descricaoVotoParlamentar: null, sexoParlamentar: 'M' })),
        }));
        return json(200, arr);
      }
      if (s === '/senador/lista/atual.json') return json(200, { ListaParlamentarEmExercicio: { Parlamentares: { Parlamentar: SEN.map((x) => ({ IdentificacaoParlamentar: { CodigoParlamentar: x.codigoParlamentar, NomeParlamentar: x.nomeParlamentar, SiglaPartidoParlamentar: x.siglaPartidoParlamentar, UfParlamentar: x.siglaUFParlamentar, UrlFotoParlamentar: `http://www.senado.leg.br/${x.codigoParlamentar}.jpg`, UrlPaginaParlamentar: `http://www25.senado.leg.br/p/${x.codigoParlamentar}`, EmailParlamentar: 'x@senado.leg.br' } })) } } });
      if (/^\/senador\/5672\/autorias\.json$/.test(s)) return json(200, { MateriasAutoriaParlamentar: { Parlamentar: { Codigo: 5672, Nome: 'Alan Rick', Autorias: { Autoria: [
        { Materia: { Codigo: 155808, DescricaoIdentificacao: 'RQS 41/2023', Sigla: 'RQS', Numero: 41, Ano: 2023, Ementa: 'Desarquivamento', Data: '2023-02-02' }, IndicadorAutorPrincipal: 'Não' },
        { Materia: { Codigo: 160000, DescricaoIdentificacao: 'PL 9/2024', Sigla: 'PL', Numero: 9, Ano: 2024, Ementa: 'Cria o programa', Data: '2024-03-02' }, IndicadorAutorPrincipal: 'Sim' }] } } } });
      if (/^\/comissao\/agenda\//.test(s)) return json(200, { AgendaReuniao: { reunioes: [{ codigo: 14990, titulo: '2ª Reunião', dataInicio: `${today()}T10:00:00.000`, situacao: 'Agendada', colegiados: { sigla: 'CAS', nome: 'Comissão de Assuntos Sociais' }, partes: [{ isDeliberativa: true, finalidade: 'Apreciação', itens: [{ ordem: 1, nome: 'PL 1/2026', doma: { ementa: 'Ementa X' } }] }] }] } });
      return json(404, { erro: 'rota do mock não existe: ' + s });
    }
    return json(404, {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  return {
    hits, camaraBase: `http://127.0.0.1:${port}/camara/api/v2`, senadoBase: `http://127.0.0.1:${port}/senado/dadosabertos`,
    close: () => new Promise((r) => server.close(r)),
  };
}
