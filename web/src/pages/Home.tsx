import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import type { PautaResp, StatusResp, VotacoesResp } from '../api';
import { qs } from '../api';
import ReuniaoCard from '../components/Reuniao';
import { VotacaoRow } from '../components/rows';
import { Icon, ErrorBox, Skeleton } from '../components/ui';
import { fmtDay, fmtInt, todayIso } from '../format';
import { useApi, useTitle } from '../hooks';

export default function Home() {
  useTitle('');
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const hoje = todayIso();
  const status = useApi<StatusResp>('/api/status', { refreshMs: 15000 });
  const pauta = useApi<PautaResp>(`/api/pauta${qs({ ini: hoje, fim: hoje })}`, { refreshMs: 120000 });
  const vot = useApi<VotacoesResp>('/api/votacoes?limit=6&nominal=1');

  const st = status.data;
  const importando = st?.sync.running;
  const vazio = st && st.camara.votacoes + st.senado.votacoes === 0;
  const hojeLista = [...(pauta.data?.itens || [])].sort((a, b) => Number(b.cat === 'plenario') - Number(a.cat === 'plenario')).slice(0, 4);
  const nHoje = pauta.data?.itens.length ?? 0;

  return (
    <>
      <section className="stack" style={{ gap: 14 }}>
        <h1>O que o Congresso está fazendo, <br />e como cada um votou.</h1>
        <p className="muted" style={{ maxWidth: '58ch' }}>Pauta do dia, histórico de votações e o desempenho de cada deputado e senador, com dados abertos oficiais.</p>
        <form className="row" onSubmit={(e) => { e.preventDefault(); nav(`/parlamentares${qs({ q: q.trim() })}`); }} role="search" style={{ maxWidth: 520 }}>
          <label className="sr" htmlFor="busca-parl">Buscar parlamentar</label>
          <input id="busca-parl" className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar parlamentar pelo nome" />
          <button className="btn primary" type="submit" aria-label="Buscar"><span style={{ width: 18, height: 18, display: 'inline-flex' }}>{Icon.search}</span></button>
        </form>
      </section>

      {(importando || vazio) && (
        <div className="notice info" role="status">
          {importando
            ? `Importando o histórico oficial: ${st!.sync.fase}${st!.sync.detalhe ? ` (${st!.sync.detalhe})` : ''} — ${fmtInt(st!.sync.feito)}${st!.sync.total ? ` de ${fmtInt(st!.sync.total)}` : ''}. Os dados vão aparecendo conforme a importação avança.`
            : 'Ainda não há histórico importado. Rode a importação (npm run sync) ou aguarde a primeira sincronização automática.'}
          {' '}<Link className="link" to="/sobre">Detalhes</Link>
        </div>
      )}

      <div className="split">
        <section className="stack" aria-label="Pauta de hoje">
          <div className="row between wrap"><h2>Hoje · {fmtDay(hoje)}</h2><Link to="/pauta" className="link small">Ver a semana</Link></div>
          {pauta.error && !pauta.data && <ErrorBox message={pauta.error} onRetry={pauta.reload} />}
          {pauta.loading && !pauta.data ? <Skeleton rows={3} /> : hojeLista.length === 0 ? (
            <div className="card"><p className="muted">Nenhuma reunião marcada para hoje nas fontes consultadas.</p><Link className="link" to="/pauta">Ver outros dias</Link></div>
          ) : (
            <>
              <div className="stack">{hojeLista.map((r) => <ReuniaoCard key={`${r.casa}:${r.id}`} r={r} />)}</div>
              {nHoje > hojeLista.length && <Link className="link" to="/pauta">+ {nHoje - hojeLista.length} reuniões hoje</Link>}
            </>
          )}
        </section>

        <section className="stack" aria-label="Últimas votações">
          <div className="row between wrap"><h2>Últimas votações</h2><Link to="/votacoes" className="link small">Ver todas</Link></div>
          {vot.error && !vot.data && <ErrorBox message={vot.error} onRetry={vot.reload} />}
          {vot.loading && !vot.data ? <Skeleton rows={4} /> : vot.data && vot.data.itens.length === 0 ? (
            <div className="card"><p className="muted">Sem votações importadas ainda.</p></div>
          ) : (
            <div className="card flush"><div className="list">{vot.data?.itens.map((v) => <VotacaoRow key={`${v.casa}:${v.id}`} v={v} />)}</div></div>
          )}
        </section>
      </div>
    </>
  );
}
