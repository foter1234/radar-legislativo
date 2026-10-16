import { useState } from 'react';
import type { Casa, PresencaResp } from '../../api';
import { qs } from '../../api';
import { Chips, Empty, ErrorBox, MoreButton, Skeleton, Stat } from '../../components/ui';
import { DateBox } from '../../components/rows';
import { fmtInt, fmtMonth, fmtPct } from '../../format';
import { useApi, usePager } from '../../hooks';

type Sess = PresencaResp['sessoes'][number];

export default function Presenca({ casa, id, de }: { casa: Casa; id: number; de?: string }) {
  const [so, setSo] = useState<'todas' | 'ausencias'>('todas');
  const resumo = useApi<PresencaResp>(`/api/parlamentares/${casa}/${id}/presenca${qs({ de })}`);
  const lista = usePager<Sess, PresencaResp>(casa === 'camara' ? `/api/parlamentares/${casa}/${id}/presenca${qs({ de, so: so === 'ausencias' ? 'ausencias' : '' })}` : null, 30, (r) => ({ total: r.totalSessoes ?? 0, itens: r.sessoes }));
  const d = resumo.data;

  if (resumo.error && !d) return <ErrorBox message={resumo.error} onRetry={resumo.reload} />;
  if (!d) return <Skeleton rows={3} />;
  if (d.total === 0) return <Empty title="Sem dados de presença neste período">Não há sessões ou votações importadas para este parlamentar no período escolhido.</Empty>;

  return (
    <div className="stack">
      <div className="stats">
        <Stat label="Presença" value={fmtPct(d.pct, 1)} meter={d.pct} hint={`${fmtInt(d.presentes)} de ${fmtInt(d.total)} ${d.base === 'sessoes' ? 'sessões deliberativas do Plenário' : 'votações nominais do Plenário'}`} />
      </div>
      <p className="small muted">
        {d.base === 'sessoes'
          ? 'Presença registrada pela Câmara nas sessões deliberativas do Plenário, no período em que o deputado aparece nos dados. Não inclui comissões nem faltas justificadas.'
          : 'No Senado, a presença é calculada pelas votações nominais do Plenário: conta como presente quem registrou voto ou estava no painel (“presente, sem voto”); “Não compareceu” conta como falta.'}
      </p>
      <section className="card" aria-label="Presença por mês">
        <h2>Mês a mês</h2>
        <div className="mbars" role="img" aria-label={`Presença mensal: ${d.meses.map((m) => `${fmtMonth(m.mes)} ${fmtPct(m.total ? (100 * m.presentes) / m.total : null)}`).join(', ')}`}>
          {d.meses.map((m) => {
            const pct = m.total ? (100 * m.presentes) / m.total : 0;
            return (
              <div key={m.mes} className="mbar" title={`${fmtMonth(m.mes)}: ${m.presentes} de ${m.total}`}>
                <em>{Math.round(pct)}%</em>
                <div className="col"><i className={pct < 60 ? 'low' : ''} style={{ height: `${pct}%` }} /></div>
                <small>{fmtMonth(m.mes)}</small>
              </div>
            );
          })}
        </div>
        <p className="tiny faint">Barras alaranjadas: presença abaixo de 60% no mês.</p>
      </section>
      {casa === 'camara' && (
        <section className="stack">
          <Chips label="Sessões" value={so} onChange={setSo} options={[{ id: 'todas', label: 'Todas as sessões' }, { id: 'ausencias', label: 'Só as ausências' }]} />
          {lista.error && <ErrorBox message={lista.error} onRetry={lista.reload} />}
          <div className="card flush">
            {lista.itens.length === 0 && !lista.loading ? <Empty title="Nenhuma sessão" /> : (
              <div className="list">
                {lista.itens.map((s) => (
                  <div key={s.id} className="item" style={{ alignItems: 'center' }}>
                    <DateBox date={s.data} />
                    <div className="item-main"><span className="item-title">{s.tipo}</span><span className="small muted clamp2">{s.descricao}{s.hora ? ` · ${s.hora}` : ''}</span></div>
                    <span className={`vote ${s.presente ? 'sim' : 'aus'}`}>{s.presente ? 'Presente' : 'Ausente'}</span>
                  </div>
                ))}
              </div>
            )}
            <MoreButton hasMore={lista.hasMore} loading={lista.loadingMore} onClick={lista.loadMore} shown={lista.itens.length} total={lista.total} />
          </div>
        </section>
      )}
    </div>
  );
}
