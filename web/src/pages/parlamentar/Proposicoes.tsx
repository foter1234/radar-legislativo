import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Casa, ProposicaoItem, ProposicoesResp } from '../../api';
import { qs } from '../../api';
import { Chips, Empty, ErrorBox, ExtLink, Field, MoreButton, Skeleton } from '../../components/ui';
import { fmtDate, propLabel } from '../../format';
import { useDebounced, usePager } from '../../hooks';

export function PropRow({ p, casa }: { p: ProposicaoItem; casa: Casa }) {
  const body = (
    <>
      <div className="item-meta">
        <b style={{ color: 'var(--fg)' }}>{propLabel(p)}</b>
        {p.lei && <span className="tag lei">Virou lei</span>}
        {p.principal === false && <span className="tag">coautor</span>}
        <span>{fmtDate(p.data)}</span>
      </div>
      <span className="item-title clamp3" style={{ fontWeight: 600 }}>{p.ementa || 'Sem ementa'}</span>
      {(p.situacao || p.orgao) && (
        <div className="item-meta">
          {p.situacao && <span className="tag">{p.situacao}</span>}
          {p.orgao && <span>em {p.orgao}</span>}
        </div>
      )}
      {p.despacho && p.lei && <span className="tiny muted clamp2">{p.despacho}</span>}
    </>
  );
  return casa === 'camara'
    ? <Link to={`/proposicoes/${p.id}`} className="item"><div className="item-main">{body}</div></Link>
    : <div className="item"><div className="item-main">{body}{p.link && <ExtLink href={p.link}>Ver no site do Senado</ExtLink>}</div></div>;
}

export default function Proposicoes({ casa, id, soLeis }: { casa: Casa; id: number; soLeis: boolean }) {
  const [tipos, setTipos] = useState<'principais' | 'todos'>('principais');
  const [ano, setAno] = useState('');
  const [q, setQ] = useState('');
  const qd = useDebounced(q);

  const base = `/api/parlamentares/${casa}/${id}/proposicoes${qs({ tipos: soLeis ? 'todos' : tipos, ano, q: qd.trim(), leis: soLeis })}`;
  const pager = usePager<ProposicaoItem, ProposicoesResp>(base, 20);
  const extra = pager.extra as ProposicoesResp | null;
  const pend = extra?.resumo.pendentes ?? 0;

  // enquanto a situação dos projetos está sendo conferida na fonte oficial, atualiza sozinho
  const { reload } = pager;
  useEffect(() => {
    if (!pend) return;
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [pend, reload]);

  const year = new Date().getFullYear();
  if (casa === 'senado' && soLeis) {
    return <Empty title="Leis de autoria de senadores">A fonte oficial do Senado não informa, de forma automática, quais matérias viraram lei. Consulte a página do senador no site do Senado.</Empty>;
  }
  return (
    <div className="stack">
      {extra?.indisponivel && <ErrorBox message="A fonte oficial está indisponível agora. Tente de novo em alguns minutos." onRetry={pager.reload} />}
      {!soLeis && (
        <div className="stack">
          <div className="row wrap between">
            <Chips label="Tipos" value={tipos} onChange={setTipos} options={[{ id: 'principais', label: 'Projetos (PL, PEC, PLP…)' }, { id: 'todos', label: `Tudo (${extra?.resumo.total ?? '…'})`, n: undefined }]} />
          </div>
          <div className="fields">
            <Field label="Buscar na ementa"><input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex.: saúde, educação" /></Field>
            <Field label="Ano de apresentação">
              <select className="input" value={ano} onChange={(e) => setAno(e.target.value)}>
                <option value="">Todos</option>
                {Array.from({ length: year - 2018 }, (_, i) => year - i).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Field>
          </div>
          {extra && Object.keys(extra.resumo.porTipo).length > 0 && (
            <p className="small muted">Total de autorias: {Object.entries(extra.resumo.porTipo).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${t}`).join(' · ')}</p>
          )}
        </div>
      )}
      {soLeis && (
        <p className="small muted">Projetos de autoria (ou coautoria) deste parlamentar cuja situação oficial é “Transformado em Norma Jurídica”.</p>
      )}
      {pend > 0 && (
        <div className="notice info" role="status">Conferindo na fonte oficial a situação de {pend} {pend === 1 ? 'projeto' : 'projetos'}… {soLeis ? 'As leis vão aparecendo aqui conforme a checagem avança.' : 'As situações aparecem conforme são conferidas.'}</div>
      )}
      {extra?.aviso && !soLeis && <p className="tiny faint">{extra.aviso}</p>}
      {pager.error && <ErrorBox message={pager.error} onRetry={pager.reload} />}
      {pager.loading && pager.itens.length === 0 ? <Skeleton rows={4} /> : (
        <section className="card flush" aria-live="polite">
          {pager.itens.length === 0 && !pager.error
            ? <Empty title={soLeis ? (pend ? 'Ainda conferindo…' : 'Nenhuma lei encontrada') : 'Nenhuma proposição encontrada'}>{soLeis && !pend ? 'Entre os projetos apresentados por este parlamentar, nenhum consta como transformado em lei.' : undefined}</Empty>
            : <div className="list">{pager.itens.map((p) => <PropRow key={p.id} p={p} casa={casa} />)}</div>}
          <MoreButton hasMore={pager.hasMore} loading={pager.loadingMore} onClick={pager.loadMore} shown={pager.itens.length} total={pager.total} />
        </section>
      )}
    </div>
  );
}
