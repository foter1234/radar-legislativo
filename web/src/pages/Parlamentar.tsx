import { useParams, useSearchParams } from 'react-router-dom';
import type { PerfilResp } from '../api';
import { qs } from '../api';
import { Avatar, BackLink, CasaTag, ErrorBox, ExtLink, Legend, Party, PlacarBar, Seg, Skeleton, Stat, Tabs } from '../components/ui';
import { casaPessoa, fmtDate, fmtInt, fmtPct, PRESETS, presetStart, type Preset } from '../format';
import { useApi, useTitle } from '../hooks';
import Perfil from './parlamentar/Perfil';
import Presenca from './parlamentar/Presenca';
import Proposicoes from './parlamentar/Proposicoes';
import Votos from './parlamentar/Votos';

type Aba = 'votos' | 'proposicoes' | 'leis' | 'presenca' | 'perfil';
const ABAS: { id: Aba; label: string }[] = [
  { id: 'votos', label: 'Como votou' }, { id: 'proposicoes', label: 'Projetos' }, { id: 'leis', label: 'Leis' }, { id: 'presenca', label: 'Presença' }, { id: 'perfil', label: 'Perfil' },
];

export default function Parlamentar() {
  const { casa, id } = useParams();
  const c = casa === 'senado' ? 'senado' : 'camara';
  const num = Number(id);
  const [sp, setSp] = useSearchParams();
  const aba = (ABAS.some((a) => a.id === sp.get('aba')) ? sp.get('aba') : 'votos') as Aba;
  const preset = (PRESETS.some((p) => p.id === sp.get('p')) ? sp.get('p') : 'tudo') as Preset;
  const de = presetStart(preset);
  const set = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    setSp(n, { replace: true });
  };

  const perfil = useApi<PerfilResp>(Number.isInteger(num) ? `/api/parlamentares/${c}/${num}${qs({ de })}` : null);
  const p = perfil.data?.parlamentar;
  useTitle(p ? p.nome : 'Parlamentar');

  if (perfil.error && !perfil.data) return (<><BackLink to={`/parlamentares?casa=${c}`}>Parlamentares</BackLink><ErrorBox message={perfil.error} onRetry={perfil.reload} /></>);
  if (!perfil.data || !p) return (<><BackLink to="/parlamentares">Parlamentares</BackLink><Skeleton rows={5} /></>);

  const { stats, detalhe } = perfil.data;
  const v = stats.votos;
  const placar = v ? { ...v } : null;
  const oficial = c === 'camara' ? `https://www.camara.leg.br/deputados/${p.id}` : p.pagina;

  return (
    <>
      <BackLink to={`/parlamentares?casa=${c}`}>{c === 'camara' ? 'Deputados' : 'Senadores'}</BackLink>
      <header className="hero">
        <Avatar src={p.foto} nome={p.nome} size="lg" />
        <div className="stack" style={{ gap: 6, flex: 1 }}>
          <h1>{p.nome}</h1>
          <div className="row wrap"><CasaTag casa={c} /><Party p={p.partido} uf={p.uf} /><span className="small muted">{casaPessoa(c)}{detalhe?.situacao ? ` · ${detalhe.situacao}` : ''}</span></div>
          {oficial && <ExtLink href={oficial}>Página oficial</ExtLink>}
        </div>
      </header>

      <div className="row wrap between">
        <Seg label="Período analisado" value={preset} onChange={(x) => set({ p: x === 'tudo' ? null : x })} options={PRESETS.map((x) => ({ id: x.id, label: x.label }))} />
        {stats.janela && <span className="small faint">Dados de {fmtDate(stats.janela.ini)} a {fmtDate(stats.janela.fim)}</span>}
      </div>

      {!stats.janela ? (
        <div className="notice">Ainda não há votações nem sessões importadas para {p.nome}. Se a importação do histórico está em andamento, volte em alguns minutos.</div>
      ) : (
        <>
          <section className="stats" aria-label="Resumo">
            <Stat label="Participação em votações" value={fmtPct(stats.participacao)} meter={stats.participacao} hint={v ? `votou em ${fmtInt(v.sim + v.nao + v.abst + v.obst)} de ${fmtInt(stats.nominais)} votações nominais` : undefined} />
            <Stat label="Presença no Plenário" value={fmtPct(stats.presenca?.pct ?? null)} meter={stats.presenca?.pct} hint={stats.presenca ? `${fmtInt(stats.presenca.presentes)} de ${fmtInt(stats.presenca.total)} ${stats.presenca.base === 'sessoes' ? 'sessões' : 'votações'}` : undefined} />
            <Stat label="Alinhamento ao partido" value={fmtPct(stats.alinhamento?.pct ?? null)} meter={stats.alinhamento?.pct} hint={stats.alinhamento && stats.alinhamento.comReferencia ? `em ${fmtInt(stats.alinhamento.comReferencia)} votos com referência` : 'sem votos com referência'} />
          </section>
          {placar && placar.total > 0 && (
            <section className="card" aria-label="Distribuição dos votos">
              <h2>Votos registrados</h2>
              <PlacarBar placar={{ ...placar }} />
              <Legend placar={{ ...placar }} />
              <p className="tiny faint">“Alinhamento” compara o voto com a orientação oficial do partido na votação; quando o partido não orientou, com o voto da maioria da própria bancada. Votações em que a bancada foi liberada ou ficou dividida não entram na conta.</p>
            </section>
          )}
        </>
      )}

      <Tabs value={aba} onChange={(x) => set({ aba: x === 'votos' ? null : x })} options={ABAS} />
      <div role="tabpanel">
        {aba === 'votos' && <Votos casa={c} id={p.id} de={de} stats={stats} />}
        {aba === 'proposicoes' && <Proposicoes casa={c} id={p.id} soLeis={false} />}
        {aba === 'leis' && <Proposicoes casa={c} id={p.id} soLeis />}
        {aba === 'presenca' && <Presenca casa={c} id={p.id} de={de} />}
        {aba === 'perfil' && <Perfil p={p} d={detalhe} />}
      </div>
    </>
  );
}
