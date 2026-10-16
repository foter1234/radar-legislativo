// Situação das proposições (para saber o que virou lei). A API da Câmara não permite filtrar por situação,
// então a situação de cada projeto é consultada à parte, em segundo plano, e guardada no banco.
import { camaraAll, getJSON } from './upstream.js';
import { isLeiSituacao } from './util.js';

const STALE_MS = 24 * 3600 * 1000;
const STALE_LEI_MS = 30 * 24 * 3600 * 1000;
const queue = [];
const inflight = new Set();
let running = 0;
const CONC = Number(process.env.STATUS_CONCURRENCY) || 4;

export function createStatusService(db) {
  async function fetchStatus(id) {
    try {
      const j = await getJSON('camara', `/proposicoes/${id}`, { retries: 2 });
      const st = (j.dados && j.dados.statusProposicao) || {};
      const lei = isLeiSituacao(st.codSituacao, st.descricaoSituacao) ? 1 : 0;
      await db.run(`INSERT INTO proposicao_status (id, situacao, cod_situacao, tramitacao, orgao, despacho, data_status, is_lei, atualizado)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET situacao = excluded.situacao, cod_situacao = excluded.cod_situacao, tramitacao = excluded.tramitacao,
                orgao = excluded.orgao, despacho = excluded.despacho, data_status = excluded.data_status, is_lei = excluded.is_lei, atualizado = excluded.atualizado`,
      id, st.descricaoSituacao || null, st.codSituacao != null ? String(st.codSituacao) : null, st.descricaoTramitacao || null, st.siglaOrgao || null,
      st.despacho || null, st.dataHora || null, lei, Date.now());
    } catch (e) {
      // marca a tentativa para não insistir a cada consulta; tenta de novo depois de algumas horas
      await db.run(`INSERT INTO proposicao_status (id, is_lei, atualizado) VALUES (?, 0, ?)
              ON CONFLICT(id) DO UPDATE SET atualizado = excluded.atualizado`, id, Date.now() - STALE_MS + 3 * 3600 * 1000);
    }
  }
  function pump() {
    while (running < CONC && queue.length) {
      const id = queue.shift();
      running++;
      fetchStatus(id).catch(() => {}).finally(() => { running--; inflight.delete(id); pump(); });
    }
  }
  return {
    /** Enfileira as proposições sem situação recente. Retorna quantas ainda estão pendentes. */
    async ensure(ids) {
      let pend = 0;
      const rows = ids.length ? await db.all('SELECT id, is_lei, atualizado FROM proposicao_status WHERE id = ANY(?)', ids) : [];
      const known = new Map(rows.map((r) => [Number(r.id), r]));
      for (const id of ids) {
        const r = known.get(Number(id));
        const ttl = r && r.is_lei ? STALE_LEI_MS : STALE_MS;
        const fresh = r && Date.now() - r.atualizado < ttl;
        if (fresh) continue;
        pend++;
        if (!inflight.has(id)) { inflight.add(id); queue.push(id); }
      }
      pump();
      return pend;
    },
    pending: () => inflight.size,
  };
}

/** Lista as proposições de autoria de um deputado (todas as páginas). */
export async function listarAutoriaDeputado(id) {
  const dados = await camaraAll(`/proposicoes?idDeputadoAutor=${encodeURIComponent(id)}&ordem=DESC&ordenarPor=id`);
  return dados.map((d) => ({
    id: d.id, tipo: d.siglaTipo, numero: d.numero, ano: d.ano, ementa: d.ementa || '', data: String(d.dataApresentacao || '').slice(0, 10),
  }));
}
