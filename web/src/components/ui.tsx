import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Casa, Cat, Placar } from '../api';
import { CAT_LABEL, CAT_ORDER, casaNome, initials, resultadoTexto, votoTexto } from '../format';
import { useState } from 'react';

/* ---------- ícones ---------- */
const P = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
export const Icon = {
  home: P('M3 11.5 12 4l9 7.5M5.5 10v10h13V10'),
  calendar: P('M4 6.5h16V20H4zM4 10.5h16M8 3.5v5M16 3.5v5'),
  vote: P('M5 12.5 9.5 17 19 7M4 21h16'),
  people: P('M16 20v-1.5a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3M15.5 4.3a3.5 3.5 0 0 1 0 6.4'),
  more: P('M5 12h.01M12 12h.01M19 12h.01'),
  search: P('m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z'),
  sun: P('M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'),
  external: P('M14 4h6v6M20 4 10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'),
};

export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#0A6847" />
      <path d="M12 44a20 20 0 0 1 40 0z" fill="#17306B" />
      <path d="M18.5 44a13.5 13.5 0 0 1 27 0z" fill="#7B2D5B" />
      <rect x="10" y="45.5" width="44" height="3.5" rx="1" fill="#F4F1EA" />
    </svg>
  );
}

/* ---------- selos ---------- */
export function CasaTag({ casa }: { casa: Casa }) {
  return <span className={`tag ${casa}`}>{casaNome(casa)}</span>;
}
export function Party({ p, uf }: { p: string | null | undefined; uf?: string | null }) {
  if (!p && !uf) return null;
  return <span className="party">{[p, uf].filter(Boolean).join(' · ')}</span>;
}
export function VoteBadge({ cat, raw, casa }: { cat: Cat | null; raw?: string | null; casa: Casa }) {
  const label = votoTexto(cat, raw ?? null, casa);
  return <span className={`vote ${cat ?? 'sem'}`}>{label}</span>;
}
export function ResultTag({ aprovada, secreta }: { aprovada: boolean | null; secreta?: boolean }) {
  const cls = aprovada === true ? 'ok' : aprovada === false ? 'no' : '';
  return <span className={`tag ${cls}`}>{resultadoTexto(aprovada, secreta)}</span>;
}

export function Avatar({ src, nome, size }: { src?: string | null; nome: string; size?: 'sm' | 'lg' }) {
  const [bad, setBad] = useState(false);
  const cls = `avatar${size ? ` ${size}` : ''}`;
  if (!src || bad) return <span className={cls} aria-hidden="true">{initials(nome)}</span>;
  return <img className={cls} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />;
}

/* ---------- placar ---------- */
export function PlacarBar({ placar }: { placar: Placar }) {
  const tot = CAT_ORDER.reduce((a, c) => a + placar[c], 0);
  if (!tot) return null;
  return (
    <div className="bar" role="img" aria-label={CAT_ORDER.filter((c) => placar[c]).map((c) => `${CAT_LABEL[c]}: ${placar[c]}`).join(', ')}>
      {CAT_ORDER.map((c) => (placar[c] ? <i key={c} className={c} style={{ flex: placar[c] }} /> : null))}
    </div>
  );
}
export function Legend({ placar }: { placar: Placar }) {
  return (
    <div className="legend">
      {CAT_ORDER.filter((c) => placar[c] > 0).map((c) => (
        <span key={c} className={c}><i /> {CAT_LABEL[c]} <b className="num">{placar[c]}</b></span>
      ))}
    </div>
  );
}
export function Score({ placar }: { placar: Placar }) {
  return (
    <div className="score">
      <div className="sim"><b>{placar.sim}</b><span>Sim</span></div>
      <div className="nao"><b>{placar.nao}</b><span>Não</span></div>
      {placar.abst > 0 && <div className="abst"><b>{placar.abst}</b><span>Abstenção</span></div>}
      {placar.obst > 0 && <div className="obst"><b>{placar.obst}</b><span>Obstrução</span></div>}
      {placar.aus > 0 && <div><b>{placar.aus}</b><span>Ausentes</span></div>}
      {placar.outro > 0 && <div><b>{placar.outro}</b><span>Outros</span></div>}
    </div>
  );
}

/* ---------- estados ---------- */
export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skel" style={{ height: 54 }} />)}
    </div>
  );
}
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice err row between wrap" role="alert">
      <span>{message}</span>
      {onRetry && <button className="btn" onClick={onRetry}>Tentar de novo</button>}
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}
export function MoreButton({ hasMore, loading, onClick, shown, total }: { hasMore: boolean; loading: boolean; onClick: () => void; shown: number; total: number | null }) {
  if (!hasMore && total !== null && shown > 0) return <p className="small faint" style={{ textAlign: 'center', padding: '10px 0' }}>{shown} de {total} exibidos — fim da lista.</p>;
  if (!hasMore) return null;
  return (
    <div style={{ textAlign: 'center', padding: '14px 0' }}>
      <button className="btn" onClick={onClick} disabled={loading}>{loading ? 'Carregando…' : `Carregar mais (${shown} de ${total ?? '?'})`}</button>
    </div>
  );
}

/* ---------- controles ---------- */
export function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.id} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  );
}
export function Chips<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string; n?: number | string }[]; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} className="chip" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}{o.n !== undefined && <span className="n">{o.n}</span>}
        </button>
      ))}
    </div>
  );
}
export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => <button key={o.id} role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
export function Stat({ value, label, hint, meter }: { value: string; label: string; hint?: string; meter?: number | null }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b>{value}</b>
      {meter !== undefined && meter !== null && <div className="meter" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, meter))}%` }} /></div>}
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return <a className="link pill-link" href={href} target="_blank" rel="noopener noreferrer">{children}<span style={{ width: 14, height: 14, display: 'inline-flex' }}>{Icon.external}</span></a>;
}
export function PageHead({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return <header className="page-head"><h1>{title}</h1>{sub && <p>{sub}</p>}{children}</header>;
}

/* linha de votação reutilizada em várias telas */
export function votacaoHref(casa: Casa, id: string) { return `/votacoes/${casa}/${encodeURIComponent(id)}`; }
export function VotacaoTitle({ titulo, descricao }: { titulo: string; descricao: string }) {
  return <>{titulo ? <span className="item-title">{titulo}</span> : null}{!titulo && descricao ? <span className="item-title clamp2">{descricao}</span> : null}</>;
}
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="small link" style={{ alignSelf: 'flex-start' }}>← {children}</Link>;
}
