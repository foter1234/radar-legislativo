import { Link, useParams } from 'react-router-dom';
import type { PropDetalhe } from '../api';
import { enc } from '../api';
import { BackLink, ErrorBox, ExtLink, ResultTag, Skeleton } from '../components/ui';
import { DateBox } from '../components/rows';
import { fmtDate, fmtDateTime, propLabel } from '../format';
import { useApi, useTitle } from '../hooks';

export default function Proposicao() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi<PropDetalhe>(id && /^\d+$/.test(id) ? `/api/proposicoes/${id}` : null);
  const p = data?.proposicao;
  useTitle(p ? propLabel(p) : 'Projeto');

  if (error && !data) return (<><BackLink to="/proposicoes">Buscar projetos</BackLink><ErrorBox message={error} onRetry={reload} /></>);
  if (loading || !data || !p) return (<><BackLink to="/proposicoes">Buscar projetos</BackLink><Skeleton rows={5} /></>);
  const s = data.situacao;

  return (
    <>
      <BackLink to="/proposicoes">Buscar projetos</BackLink>
      <header className="page-head">
        <div className="row wrap"><span className="tag camara">Câmara</span>{p.lei && <span className="tag lei">Virou lei</span>}<span className="small muted">Apresentado em {fmtDate(p.apresentacao)}</span></div>
        <h1>{propLabel(p)}</h1>
        <p>{p.ementa}</p>
        <div className="row wrap" style={{ gap: 14 }}>
          <ExtLink href={p.oficial}>Ficha de tramitação oficial</ExtLink>
          {p.inteiroTeor && <ExtLink href={p.inteiroTeor}>Texto completo</ExtLink>}
        </div>
      </header>

      <section className="card">
        <h2>Situação atual</h2>
        <div className="row wrap"><span className={`tag ${p.lei ? 'lei' : 'warn'}`}>{s.descricao || s.tramitacao || 'Em tramitação'}</span>{s.orgao && <span className="tag">{s.orgao}</span>}{s.data && <span className="small muted">{fmtDateTime(s.data)}</span>}</div>
        {s.despacho && <p className="small">{s.despacho}</p>}
        {s.regime && <p className="small muted">Regime: {s.regime}{s.apreciacao ? ` · Apreciação: ${s.apreciacao}` : ''}</p>}
      </section>

      {data.autores.length > 0 && (
        <section className="card">
          <h2>Autoria</h2>
          <div className="chips">
            {data.autores.map((a, i) => a.deputadoId
              ? <Link key={i} className="chip" to={`/parlamentares/camara/${a.deputadoId}`}>{a.nome}</Link>
              : <span key={i} className="chip">{a.nome} <span className="n">{a.tipo}</span></span>)}
          </div>
        </section>
      )}

      <section className="card flush">
        <h2 style={{ padding: '16px 16px 0' }}>Votações deste projeto</h2>
        {data.votacoes.length === 0 ? <p className="muted" style={{ padding: 16 }}>Este projeto ainda não foi votado em Plenário ou comissão (ou a fonte não informa).</p> : (
          <div className="list">
            {data.votacoes.map((v) => {
              const inner = (
                <>
                  <DateBox date={v.data} />
                  <div className="item-main"><span className="item-title clamp2">{v.descricao || 'Votação'}</span><div className="item-meta"><span>{v.orgao}</span>{!v.naBase && <span className="faint">detalhes por parlamentar indisponíveis</span>}</div></div>
                  <ResultTag aprovada={v.aprovada} />
                </>
              );
              return v.naBase ? <Link key={v.id} className="item" to={`/votacoes/camara/${enc(v.id)}`} style={{ alignItems: 'center' }}>{inner}</Link> : <div key={v.id} className="item" style={{ alignItems: 'center' }}>{inner}</div>;
            })}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Tramitação</h2>
        <div className="tl">
          {data.tramitacoes.slice(0, 40).map((t, i) => (
            <div key={i}>
              <div className="row wrap" style={{ gap: 8 }}><b className="small">{fmtDateTime(t.data)}</b>{t.orgao && <span className="tag">{t.orgao}</span>}</div>
              <span className="small">{t.tramitacao}{t.situacao ? ` — ${t.situacao}` : ''}</span>
              {t.despacho && <p className="tiny muted clamp3">{t.despacho}</p>}
            </div>
          ))}
        </div>
        {data.tramitacoes.length > 40 && <p className="small faint">Mostrando as 40 movimentações mais recentes de {data.tramitacoes.length}. A ficha oficial tem o histórico completo.</p>}
      </section>
    </>
  );
}
