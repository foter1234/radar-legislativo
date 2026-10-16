import { useSearchParams } from 'react-router-dom';
import type { VotacoesResp } from '../api';
import { qs } from '../api';
import { VotacaoRow } from '../components/rows';
import { Chips, Empty, ErrorBox, Field, MoreButton, PageHead, Seg, Skeleton } from '../components/ui';
import { addDays, fmtDate, todayIso } from '../format';
import { useDebounced, usePager, useTitle } from '../hooks';
import { useEffect, useState } from 'react';

type Per = '7d' | '30d' | '3m' | '12m' | 'tudo';
const PER: { id: Per; label: string }[] = [
  { id: '7d', label: '7 dias' }, { id: '30d', label: '30 dias' }, { id: '3m', label: '3 meses' }, { id: '12m', label: '12 meses' }, { id: 'tudo', label: 'Tudo' },
];
function perStart(p: Per): string | undefined {
  const t = todayIso();
  return p === '7d' ? addDays(t, -7) : p === '30d' ? addDays(t, -30) : p === '3m' ? addDays(t, -91) : p === '12m' ? addDays(t, -365) : undefined;
}

export default function Votacoes() {
  useTitle('Votações');
  const [sp, setSp] = useSearchParams();
  const casa = sp.get('casa') || '';
  const resultado = sp.get('resultado') || '';
  const nominal = sp.get('nominal') === '1';
  const customDe = sp.get('de') || '';
  const customAte = sp.get('ate') || '';
  const custom = !!(customDe || customAte);
  const per = (PER.some((x) => x.id === sp.get('p')) ? sp.get('p') : '30d') as Per;
  const qUrl = sp.get('q') || '';
  const [q, setQ] = useState(qUrl);
  const qDeb = useDebounced(q);

  const set = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    setSp(n, { replace: true });
  };
  useEffect(() => { if (qDeb !== qUrl) set({ q: qDeb.trim() || null }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [qDeb]);

  const de = custom ? customDe : perStart(per);
  const ate = custom ? customAte : undefined;
  const base = `/api/votacoes${qs({ casa, de, ate, resultado, nominal, q: qUrl })}`;
  const pager = usePager<VotacoesResp['itens'][number], VotacoesResp>(base, 30);
  const cob = (pager.extra as VotacoesResp | null)?.cobertura;

  return (
    <>
      <PageHead title="Votações" sub="Histórico de votações do Plenário da Câmara e do Senado. Abra uma votação para ver como cada parlamentar votou." />
      <section className="card filters" aria-label="Filtros">
        <div className="row wrap between">
          <Seg label="Casa" value={(casa || 'todas') as 'todas' | 'camara' | 'senado'} onChange={(v) => set({ casa: v === 'todas' ? null : v })} options={[{ id: 'todas', label: 'Câmara e Senado' }, { id: 'camara', label: 'Câmara' }, { id: 'senado', label: 'Senado' }]} />
          <Seg label="Período" value={(custom ? ('' as Per) : per)} onChange={(v) => set({ p: v === '30d' ? null : v, de: null, ate: null })} options={PER} />
        </div>
        <div className="fields">
          <Field label="Buscar no assunto"><input className="input" type="search" value={q} placeholder="ex.: reforma tributária, PL 2338…" onChange={(e) => setQ(e.target.value)} /></Field>
          <Field label="De"><input className="input" type="date" value={customDe} max={customAte || todayIso()} onChange={(e) => set({ de: e.target.value || null })} /></Field>
          <Field label="Até"><input className="input" type="date" value={customAte} min={customDe || undefined} max={todayIso()} onChange={(e) => set({ ate: e.target.value || null })} /></Field>
        </div>
        <div className="row wrap">
          <Chips label="Resultado" value={(resultado || 'todos') as 'todos' | 'ok' | 'no'} onChange={(v) => set({ resultado: v === 'todos' ? null : v })} options={[{ id: 'todos', label: 'Todos os resultados' }, { id: 'ok', label: 'Aprovadas' }, { id: 'no', label: 'Rejeitadas' }]} />
          <button className="chip" aria-pressed={nominal} onClick={() => set({ nominal: nominal ? null : '1' })}>Só com voto de cada parlamentar</button>
        </div>
      </section>

      {cob && (cob.camara.ini || cob.senado.ini) && (
        <p className="small faint">
          Histórico importado: {cob.camara.ini ? `Câmara de ${fmtDate(cob.camara.ini)} a ${fmtDate(cob.camara.fim)}` : 'Câmara ainda sem dados'}
          {' · '}{cob.senado.ini ? `Senado de ${fmtDate(cob.senado.ini)} a ${fmtDate(cob.senado.fim)}` : 'Senado ainda sem dados'}.
        </p>
      )}

      {pager.error && <ErrorBox message={pager.error} onRetry={pager.reload} />}
      {pager.loading && pager.itens.length === 0 ? <Skeleton rows={6} /> : (
        <section className="card flush" aria-live="polite">
          <div className="card-title" style={{ padding: '12px 16px 0' }}>
            <h2>{pager.total === null ? '' : `${pager.total.toLocaleString('pt-BR')} votações`}</h2>
          </div>
          {pager.itens.length === 0 && !pager.error ? (
            <Empty title="Nenhuma votação encontrada">Tente ampliar o período ou limpar os filtros. Se o app acabou de ser instalado, a importação do histórico pode estar em andamento (veja “Sobre os dados”).</Empty>
          ) : (
            <div className="list">{pager.itens.map((v) => <VotacaoRow key={`${v.casa}:${v.id}`} v={v} />)}</div>
          )}
          <MoreButton hasMore={pager.hasMore} loading={pager.loadingMore} onClick={pager.loadMore} shown={pager.itens.length} total={pager.total} />
        </section>
      )}
    </>
  );
}
