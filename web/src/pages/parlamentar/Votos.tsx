import { useEffect, useState } from 'react';
import type { Casa, Stats, VotosResp } from '../../api';
import { qs } from '../../api';
import { VotacaoRow } from '../../components/rows';
import { Chips, Empty, ErrorBox, Field, MoreButton, Skeleton } from '../../components/ui';
import { CAT_LABEL, fmtInt } from '../../format';
import { useDebounced, usePager } from '../../hooks';
import type { VotoHistorico } from '../../api';

type Filtro = 'todos' | 'sim' | 'nao' | 'abst' | 'obst' | 'aus' | 'sem';

export default function Votos({ casa, id, de, stats }: { casa: Casa; id: number; de?: string; stats: Stats }) {
  const [voto, setVoto] = useState<Filtro>('todos');
  const [resultado, setResultado] = useState('');
  const [q, setQ] = useState('');
  const qd = useDebounced(q);
  useEffect(() => { setVoto('todos'); }, [id]);

  const base = `/api/parlamentares/${casa}/${id}/votos${qs({ de, voto: voto === 'todos' ? '' : voto, resultado, q: qd.trim() })}`;
  const pager = usePager<VotoHistorico, VotosResp>(base, 25);
  const v = stats.votos;
  const sem = Math.max(0, stats.nominais - (v ? v.total : 0));
  const opts: { id: Filtro; label: string; n?: number }[] = [
    { id: 'todos', label: 'Com voto registrado', n: v?.total },
    { id: 'sim', label: CAT_LABEL.sim, n: v?.sim },
    { id: 'nao', label: CAT_LABEL.nao, n: v?.nao },
    { id: 'abst', label: CAT_LABEL.abst, n: v?.abst },
    { id: 'obst', label: CAT_LABEL.obst, n: v?.obst },
    ...(casa === 'senado' ? [{ id: 'aus' as const, label: 'Ausente / sem voto', n: v?.aus }] : []),
    { id: 'sem', label: 'Sem registro', n: sem },
  ];
  return (
    <div className="stack">
      <Chips label="Filtrar por voto" value={voto} onChange={setVoto} options={opts.filter((o) => o.id === 'todos' || o.id === voto || (o.n ?? 0) > 0).map((o) => ({ ...o, n: o.n === undefined ? undefined : fmtInt(o.n) }))} />
      <div className="fields">
        <Field label="Buscar no assunto"><input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex.: aborto, imposto, PEC 45" /></Field>
        <Field label="Resultado da votação">
          <select className="input" value={resultado} onChange={(e) => setResultado(e.target.value)}>
            <option value="">Todos</option><option value="ok">Aprovadas</option><option value="no">Rejeitadas</option>
          </select>
        </Field>
      </div>
      {voto === 'sem' && <p className="small muted">“Sem registro” são votações nominais ocorridas durante o mandato em que não consta voto deste parlamentar (ausência ou não participação no painel).</p>}
      {pager.error && <ErrorBox message={pager.error} onRetry={pager.reload} />}
      {pager.loading && pager.itens.length === 0 ? <Skeleton rows={5} /> : (
        <section className="card flush" aria-live="polite">
          {pager.itens.length === 0 && !pager.error
            ? <Empty title="Nada por aqui">Nenhuma votação com esses filtros neste período.</Empty>
            : <div className="list">{pager.itens.map((x) => (
              <VotacaoRow key={`${x.casa}:${x.id}`} v={x} voto={{ cat: x.voto, raw: x.votoRaw, partidoNaData: x.partidoNaData, refTipo: x.refTipo, alinhado: x.alinhado }} />
            ))}</div>}
          <MoreButton hasMore={pager.hasMore} loading={pager.loadingMore} onClick={pager.loadMore} shown={pager.itens.length} total={pager.total} />
        </section>
      )}
    </div>
  );
}
