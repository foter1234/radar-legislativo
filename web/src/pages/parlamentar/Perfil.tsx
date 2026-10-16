import type { Detalhe, Parlamentar } from '../../api';
import { ExtLink } from '../../components/ui';
import { casaPessoa, fmtDate } from '../../format';

function Line({ k, v }: { k: string; v: React.ReactNode }) {
  if (v === null || v === undefined || v === '') return null;
  return <div className="row between wrap" style={{ alignItems: 'baseline' }}><span className="muted small">{k}</span><span style={{ textAlign: 'right', overflowWrap: 'anywhere' }}>{v}</span></div>;
}

export default function Perfil({ p, d }: { p: Parlamentar; d: Detalhe | null }) {
  const g = d?.gabinete;
  const site = p.casa === 'camara' ? `https://www.camara.leg.br/deputados/${p.id}` : p.pagina;
  return (
    <div className="grid cols-2">
      <section className="card">
        <h2>Cadastro</h2>
        <Line k="Cargo" v={casaPessoa(p.casa)} />
        <Line k="Nome civil" v={d?.nomeCivil} />
        <Line k="Partido atual" v={p.partido} />
        <Line k="Estado" v={p.uf} />
        <Line k="Situação" v={d?.situacao} />
        <Line k="Condição eleitoral" v={d?.condicaoEleitoral} />
        <Line k="Nascimento" v={d?.dataNascimento ? fmtDate(d.dataNascimento) : null} />
        <Line k="Naturalidade" v={d?.municipioNascimento ? `${d.municipioNascimento}${d.ufNascimento ? `/${d.ufNascimento}` : ''}` : null} />
        <Line k="Escolaridade" v={d?.escolaridade} />
        {!d && p.casa === 'camara' && <p className="small faint">Os dados cadastrais completos não puderam ser carregados agora.</p>}
        {site && <ExtLink href={site}>{p.casa === 'camara' ? 'Página no site da Câmara' : 'Página no site do Senado'}</ExtLink>}
      </section>
      <section className="card">
        <h2>Contato</h2>
        {g && (<>
          <Line k="Gabinete" v={[g.nome && `Gab. ${g.nome}`, g.predio && `Anexo ${g.predio}`, g.andar && `${g.andar}º andar`].filter(Boolean).join(' · ')} />
          <Line k="Telefone" v={g.telefone ? `(61) ${g.telefone}` : null} />
          <Line k="E-mail do gabinete" v={g.email ? <a className="link" href={`mailto:${g.email}`}>{g.email}</a> : null} />
        </>)}
        {!g && p.email && <Line k="E-mail" v={<a className="link" href={`mailto:${p.email}`}>{p.email}</a>} />}
        {d?.urlWebsite && <Line k="Site" v={<a className="link" href={d.urlWebsite} target="_blank" rel="noopener noreferrer">{d.urlWebsite}</a>} />}
        {d && d.redeSocial.length > 0 && (
          <div className="stack" style={{ gap: 4 }}>
            <span className="muted small">Redes sociais</span>
            {d.redeSocial.map((r) => <a key={r} className="link small" href={r} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: 'anywhere' }}>{r}</a>)}
          </div>
        )}
        {!g && !p.email && !d?.urlWebsite && !(d && d.redeSocial.length) && <p className="muted">Sem dados de contato disponíveis.</p>}
      </section>
    </div>
  );
}
