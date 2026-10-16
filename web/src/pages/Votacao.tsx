import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Cat, VotacaoDetalhe, VotoLinha } from '../api';
import { enc } from '../api';
import { AlignMark } from '../components/rows';
import { Avatar, BackLink, CasaTag, Chips, Empty, ErrorBox, ExtLink, Field, Legend, Party, PlacarBar, ResultTag, Score, Skeleton, VoteBadge } from '../components/ui';
import { CAT_LABEL, CAT_ORDER, casaNome, fmtDate, fmtInt, fmtPct, norm } from '../format';
import { useApi, useTitle } from '../hooks';

const PAGE = 80;

function VotosLista({ casa, votos }: { casa: 'camara' | 'senado'; votos: VotoLinha[] }) {
  const [cat, setCat] = useState<Cat | 'todos'>('todos');
  const [q, setQ] = useState('');
  const [partido, setPartido] = useState('');
  const [show, setShow] = useState(PAGE);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const v of votos) c[v.cat] = (c[v.cat] || 0) + 1;
    return c;
  }, [votos]);
  const partidos = useMemo(() => [...new Set(votos.map((v) => v.partido))].sort(), [votos]);
  const filtrados = useMemo(() => {
    const nq = norm(q);
    return votos.filter((v) => (cat === 'todos' || v.cat === cat) && (!partido || v.partido === partido) && (!nq || norm(`${v.nome} ${v.partido} ${v.uf}`).includes(nq)));
  }, [votos, cat, q, partido]);

  if (!votos.length) return <Empty title="Sem votos individuais">Esta votação não teve registro de voto de cada parlamentar (votação simbólica, secreta ou ainda não importada).</Empty>;
  const reset = () => setShow(PAGE);
  return (
    <div className="stack">
      <Chips
        label="Filtrar por voto" value={cat} onChange={(v) => { setCat(v); reset(); }}
        options={[{ id: 'todos', label: 'Todos', n: votos.length }, ...CAT_ORDER.filter((c) => counts[c]).map((c) => ({ id: c, label: CAT_LABEL[c], n: counts[c] }))]}
      />
      <div className="fields">
        <Field label="Nome, partido ou UF"><input className="input" type="search" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="Buscar parlamentar" /></Field>
        <Field label="Partido">
          <select className="input" value={partido} onChange={(e) => { setPartido(e.target.value); reset(); }}>
            <option value="">Todos</option>
            {partidos.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
      </div>
      <p className="small muted" aria-live="polite">{fmtInt(filtrados.length)} {filtrados.length === 1 ? 'parlamentar' : 'parlamentares'}</p>
      <div className="card flush">
        <div className="list">
          {filtrados.slice(0, show).map((v) => (
            <Link key={v.id} to={`/parlamentares/${casa}/${v.id}`} className="item" style={{ alignItems: 'center' }}>
              <Avatar src={v.foto} nome={v.nome} size="sm" />
              <div className="item-main" style={{ gap: 2 }}>
                <span className="item-title">{v.nome}</span>
                <div className="item-meta"><Party p={v.partido} uf={v.uf} /><AlignMark refTipo={v.ref_tipo} alinhado={v.alinhado} /></div>
              </div>
              <VoteBadge cat={v.cat} raw={v.raw} casa={casa} />
            </Link>
          ))}
        </div>
        {filtrados.length > show && (
          <div style={{ textAlign: 'center', padding: 14 }}><button className="btn" onClick={() => setShow(show + PAGE)}>Mostrar mais ({show} de {filtrados.length})</button></div>
        )}
      </div>
    </div>
  );
}

export default function Votacao() {
  const { casa, id } = useParams();
  const c = casa === 'senado' ? 'senado' : 'camara';
  const { data, error, loading, reload } = useApi<VotacaoDetalhe>(id ? `/api/votacoes/${c}/${enc(id)}` : null);
  const v = data?.votacao;
  useTitle(v ? v.titulo || v.descricao : 'Votação');

  if (error && !data) return (<><BackLink to="/votacoes">Votações</BackLink><ErrorBox message={error} onRetry={reload} /></>);
  if (loading || !data || !v) return (<><BackLink to="/votacoes">Votações</BackLink><Skeleton rows={5} /></>);

  const nominal = v.placar.total > 0;
  return (
    <>
      <BackLink to="/votacoes">Votações</BackLink>
      <header className="page-head">
        <div className="row wrap"><CasaTag casa={v.casa} /><ResultTag aprovada={v.aprovada} secreta={v.secreta} /><span className="small muted">{fmtDate(v.data)} · {v.orgao}</span></div>
        <h1>{v.titulo || v.descricao || 'Votação'}</h1>
        {v.ementa && <p>{v.ementa}</p>}
        {v.titulo && v.descricao && <p className="small">{v.descricao}</p>}
        <div className="row wrap" style={{ gap: 14 }}>
          {v.link && <ExtLink href={v.link}>{v.casa === 'camara' ? 'Sessão no site da Câmara' : 'Matéria no site do Senado'}</ExtLink>}
          {v.casa === 'camara' && v.props.map((p) => <Link key={p.id} className="link" to={`/proposicoes/${p.id}`}>Ver tramitação de {p.titulo}</Link>)}
        </div>
      </header>

      <section className="card" aria-label="Placar">
        <h2>Placar</h2>
        {nominal ? (<><Score placar={v.placar} /><PlacarBar placar={v.placar} /><Legend placar={v.placar} /></>) : (
          <p className="muted">{v.secreta ? 'Votação secreta: o voto de cada parlamentar não é divulgado.' : 'Esta votação não tem registro individual de votos (por exemplo, votação simbólica, em que não há painel nominal).'}</p>
        )}
        {nominal && v.casa === 'senado' && <p className="small faint">No Senado, “Ausentes” inclui quem não compareceu e quem estava presente sem votar.</p>}
      </section>

      {data.orientacoes.length > 0 && (
        <section className="card" aria-label="Orientações">
          <h2>Orientação das lideranças</h2>
          <div className="chips">
            {data.orientacoes.map((o) => (
              <span key={o.nome} className={`vote ${o.cat === 'lib' || !o.cat ? 'sem' : o.cat}`} style={{ minWidth: 0 }}>
                {o.nome}: {o.cat && o.cat !== 'lib' ? CAT_LABEL[o.cat as Cat] : o.raw || 'sem orientação'}
              </span>
            ))}
          </div>
        </section>
      )}

      {nominal && data.partidos.length > 0 && (
        <section className="card" aria-label="Por partido">
          <h2>Como cada partido votou</h2>
          <div className="tscroll">
            <table className="t">
              <thead><tr><th>Partido</th><th className="r">Sim</th><th className="r">Não</th><th className="r">Abst.</th><th className="r">Obstr.</th><th className="r">Aus.</th><th>Orientação</th><th className="r" title="Parte da bancada que votou conforme a orientação (ou a maioria, se não houve orientação)">Seguiu</th></tr></thead>
              <tbody>
                {data.partidos.map((p) => (
                  <tr key={p.partido}>
                    <td><b>{p.partido}</b> <span className="faint tiny">({p.total})</span></td>
                    <td className="r">{p.sim || '·'}</td><td className="r">{p.nao || '·'}</td><td className="r">{p.abst || '·'}</td><td className="r">{p.obst || '·'}</td><td className="r">{p.aus + p.outro || '·'}</td>
                    <td>{p.orientacao ? (p.orientacao === 'lib' ? 'Liberado' : CAT_LABEL[p.orientacao as Cat]) : <span className="faint">—</span>}</td>
                    <td className="r">{p.seguiu === null ? '—' : fmtPct(p.seguiu)}{p.refTipo === 'maioria' ? <span className="faint" title="Comparado com a maioria da bancada"> *</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny faint">* Sem orientação oficial do partido: comparado com o voto da maioria da própria bancada (só quando há ao menos 3 votos Sim/Não e não há empate).</p>
        </section>
      )}

      <section className="stack" aria-label="Votos individuais">
        <h2>Como cada {v.casa === 'camara' ? 'deputado' : 'senador'} votou</h2>
        {nominal ? <VotosLista casa={v.casa} votos={data.votos} /> : <Empty title="Sem votos individuais" />}
        {nominal && v.casa === 'camara' && <p className="small faint">Quem não aparece na lista não registrou voto nesta votação. {casaNome(v.casa)} registra apenas votos de quem participou do painel.</p>}
      </section>
    </>
  );
}
