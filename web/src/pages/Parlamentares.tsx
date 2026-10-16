import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Filtros, Parlamentar, ParlamentaresResp } from '../api';
import { qs } from '../api';
import { Avatar, Empty, ErrorBox, Field, MoreButton, PageHead, Party, Seg, Skeleton } from '../components/ui';
import { useApi, useDebounced, usePager, useTitle } from '../hooks';

export function PCard({ p }: { p: Parlamentar }) {
  return (
    <Link to={`/parlamentares/${p.casa}/${p.id}`} className="pcard">
      <Avatar src={p.foto} nome={p.nome} />
      <div style={{ minWidth: 0 }}>
        <b style={{ overflowWrap: 'anywhere' }}>{p.nome}</b>
        <Party p={p.partido} uf={p.uf} />
      </div>
    </Link>
  );
}

export default function Parlamentares() {
  useTitle('Parlamentares');
  const [sp, setSp] = useSearchParams();
  const casa = sp.get('casa') === 'senado' ? 'senado' : 'camara';
  const partido = sp.get('partido') || '';
  const uf = sp.get('uf') || '';
  const qUrl = sp.get('q') || '';
  const [q, setQ] = useState(qUrl);
  const qDeb = useDebounced(q, 300);
  const set = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    setSp(n, { replace: true });
  };
  useEffect(() => { if (qDeb !== qUrl) set({ q: qDeb.trim() || null }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [qDeb]);

  const filtros = useApi<Filtros>(`/api/parlamentares/filtros?casa=${casa}`);
  const pager = usePager<Parlamentar, ParlamentaresResp>(`/api/parlamentares${qs({ casa, partido, uf, q: qUrl })}`, 48);

  return (
    <>
      <PageHead title="Parlamentares" sub="Busque um deputado ou senador para ver como votou, o que apresentou, as leis aprovadas e a presença." />
      <section className="card filters">
        <Seg label="Casa" value={casa} onChange={(v) => set({ casa: v === 'camara' ? null : v, partido: null, uf: null })} options={[{ id: 'camara', label: 'Deputados' }, { id: 'senado', label: 'Senadores' }]} />
        <div className="fields">
          <Field label="Nome"><input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite parte do nome" /></Field>
          <Field label="Partido">
            <select className="input" value={partido} onChange={(e) => set({ partido: e.target.value || null })}>
              <option value="">Todos</option>
              {(filtros.data?.partidos || []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Estado">
            <select className="input" value={uf} onChange={(e) => set({ uf: e.target.value || null })}>
              <option value="">Todos</option>
              {(filtros.data?.ufs || []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        </div>
      </section>
      {pager.error && <ErrorBox message={pager.error} onRetry={pager.reload} />}
      {pager.loading && pager.itens.length === 0 ? <Skeleton rows={6} /> : (
        <>
          <p className="small muted" aria-live="polite">{pager.total === null ? '' : `${pager.total.toLocaleString('pt-BR')} ${casa === 'camara' ? 'deputados' : 'senadores'}`}</p>
          {pager.itens.length === 0 && !pager.error ? (
            <Empty title="Ninguém encontrado">Confira a grafia ou limpe os filtros. A lista é formada a partir dos dados importados; se o app é novo, aguarde a primeira importação.</Empty>
          ) : (
            <div className="pgrid">{pager.itens.map((p) => <PCard key={`${p.casa}:${p.id}`} p={p} />)}</div>
          )}
          <MoreButton hasMore={pager.hasMore} loading={pager.loadingMore} onClick={pager.loadMore} shown={pager.itens.length} total={pager.total} />
        </>
      )}
    </>
  );
}
