import { Link } from 'react-router-dom';
import type { Cat, VotacaoResumo } from '../api';
import { fmtInt, parseIso, votoTexto } from '../format';
import { CasaTag, PlacarBar, ResultTag, VoteBadge, votacaoHref } from './ui';

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function DateBox({ date }: { date: string }) {
  const d = parseIso(date);
  return <div className="datebox" aria-label={date}><b>{d.getDate()}</b><span>{MES[d.getMonth()]}/{String(d.getFullYear()).slice(2)}</span></div>;
}

export function AlignMark({ refTipo, alinhado }: { refTipo: 'orientacao' | 'maioria' | null; alinhado: boolean | null }) {
  if (!refTipo || alinhado === null) return null;
  const txt = refTipo === 'orientacao'
    ? alinhado ? 'Seguiu a orientação do partido' : 'Votou contra a orientação do partido'
    : alinhado ? 'Com a maioria do partido' : 'Contra a maioria do partido';
  return <span className={`tag ${alinhado ? 'ok' : 'warn'}`} title={refTipo === 'maioria' ? 'O partido não declarou orientação; comparado com o voto da maioria da bancada' : undefined}>{alinhado ? '✓' : '✗'} {txt}</span>;
}

export function VotacaoRow({ v, voto }: { v: VotacaoResumo; voto?: { cat: Cat | null; raw: string | null; partidoNaData: string | null; refTipo: 'orientacao' | 'maioria' | null; alinhado: boolean | null } }) {
  const p = v.placar;
  const nominal = p.total > 0;
  return (
    <Link to={votacaoHref(v.casa, v.id)} className="item" aria-label={`${v.titulo || v.descricao}${voto ? ` — ${votoTexto(voto.cat, voto.raw, v.casa)}` : ''}`}>
      <DateBox date={v.data} />
      <div className="item-main">
        <div className="item-meta">
          <CasaTag casa={v.casa} />
          {v.titulo && <b style={{ color: 'var(--fg)' }}>{v.titulo}</b>}
          <ResultTag aprovada={v.aprovada} secreta={v.secreta} />
        </div>
        {v.ementa ? <span className="item-title clamp2">{v.ementa}</span> : <span className="item-title clamp2">{v.descricao || 'Votação'}</span>}
        {v.ementa && v.descricao && <span className="small muted clamp2">{v.descricao}</span>}
        {nominal ? (
          <div className="stack" style={{ gap: 5, marginTop: 4, maxWidth: 420 }}>
            <PlacarBar placar={p} />
            <span className="tiny muted num">Sim {fmtInt(p.sim)} · Não {fmtInt(p.nao)}{p.abst ? ` · Abst. ${p.abst}` : ''}{p.obst ? ` · Obstr. ${p.obst}` : ''} · {fmtInt(p.total)} registros</span>
          </div>
        ) : (
          <span className="tiny faint">{v.secreta ? 'Votação secreta: sem voto individual' : 'Sem votos individuais registrados (simbólica ou sem painel)'}</span>
        )}
        {voto && voto.refTipo && <div><AlignMark refTipo={voto.refTipo} alinhado={voto.alinhado} /></div>}
      </div>
      {voto && (
        <div className="item-side">
          <VoteBadge cat={voto.cat} raw={voto.raw} casa={v.casa} />
          {voto.partidoNaData && <span className="tiny faint">{voto.partidoNaData} na data</span>}
        </div>
      )}
    </Link>
  );
}
