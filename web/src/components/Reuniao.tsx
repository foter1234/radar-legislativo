import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { PautaItem, Reuniao } from '../api';
import { enc } from '../api';
import { useApi } from '../hooks';
import { CasaTag, ErrorBox, ExtLink, Skeleton } from './ui';

function ItensCamara({ id }: { id: string }) {
  const { data, error, loading, reload } = useApi<PautaItem[]>(`/api/pauta/camara/${enc(id)}/itens`);
  if (loading && !data) return <Skeleton rows={2} />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data || data.length === 0) return <p className="small muted">A pauta detalhada desta reunião ainda não foi publicada.</p>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {data.map((i, k) => (
        <div key={`${i.ordem}-${k}`} className="itembox">
          <div className="row wrap" style={{ gap: 6 }}>
            <b>{i.ordem ? `${i.ordem}. ` : ''}{i.titulo}</b>
            {i.regime && <span className="tag">{i.regime}</span>}
            {i.situacao && <span className="tag warn">{i.situacao}</span>}
          </div>
          {i.ementa && <span className="small">{i.ementa}</span>}
          {i.topico && <span className="tiny faint">{i.topico}</span>}
          {i.relator && <span className="tiny muted">Relator: <Link className="link" to={`/parlamentares/camara/${i.relator.id}`}>{i.relator.nome}</Link> ({i.relator.partido}-{i.relator.uf})</span>}
          <div className="row wrap" style={{ gap: 12 }}>
            {i.propId && <Link className="link small" to={`/proposicoes/${i.propId}`}>Ver tramitação</Link>}
            {i.votacaoId && <Link className="link small" to={`/votacoes/camara/${enc(i.votacaoId)}`}>Ver votação</Link>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ReuniaoCard({ r }: { r: Reuniao }) {
  const [open, setOpen] = useState(false);
  const itens = r.itens;
  const nItens = itens?.length ?? 0;
  const links = Object.entries(r.links).filter(([, v]) => v) as [string, string][];
  const LABEL: Record<string, string> = { video: 'Assistir', oficial: 'Página oficial', pauta: 'Pauta (PDF)', resultado: 'Resultado', ata: 'Ata' };
  return (
    <article className="card">
      <div className="row wrap" style={{ gap: 8 }}>
        <b className="num" style={{ fontFamily: 'var(--font-head)', fontSize: '1.15rem' }}>{r.hora || '—'}</b>
        <CasaTag casa={r.casa} />
        <span className="tag">{r.orgao}</span>
        {r.situacao && <span className={`tag ${/cancel/i.test(r.situacao) ? 'no' : /encerr|realiz/i.test(r.situacao) ? 'ok' : 'warn'}`}>{r.situacao}</span>}
      </div>
      <div className="stack" style={{ gap: 3 }}>
        <h3>{r.titulo || r.tipo}</h3>
        {r.orgaoNome && <span className="small muted">{r.orgaoNome}{r.local ? ` · ${r.local}` : ''}</span>}
        {r.descricao && <p className="small clamp3" style={{ overflowWrap: 'anywhere' }}>{r.descricao}</p>}
      </div>
      {r.casa === 'senado' && nItens > 0 && (
        <details>
          <summary>{nItens} {nItens === 1 ? 'item' : 'itens'} na pauta</summary>
          <div className="stack" style={{ gap: 8, marginTop: 10 }}>
            {itens!.map((i, k) => (
              <div key={`${i.ordem}-${k}`} className="itembox">
                <b>{i.ordem ? `${i.ordem}. ` : ''}{i.titulo}{i.apelido ? ` — ${i.apelido}` : ''}</b>
                {i.ementa && <span className="small">{i.ementa}</span>}
                {i.autor && <span className="tiny muted">Autoria: {i.autor}</span>}
                {i.relatorio && <span className="tiny muted">Relatoria: {i.relatorio}</span>}
              </div>
            ))}
          </div>
        </details>
      )}
      {r.casa === 'camara' && (
        <div className="stack" style={{ gap: 10 }}>
          <button className="btn" style={{ alignSelf: 'flex-start' }} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Ocultar itens da pauta' : 'Ver itens da pauta'}</button>
          {open && <ItensCamara id={r.id} />}
        </div>
      )}
      {links.length > 0 && <div className="row wrap" style={{ gap: 14 }}>{links.map(([k, v]) => <ExtLink key={k} href={v}>{LABEL[k] || k}</ExtLink>)}</div>}
    </article>
  );
}
