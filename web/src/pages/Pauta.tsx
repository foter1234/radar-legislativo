import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PautaResp } from '../api';
import { qs } from '../api';
import ReuniaoCard from '../components/Reuniao';
import { Chips, Empty, ErrorBox, ExtLink, PageHead, Seg, Skeleton } from '../components/ui';
import { addDays, fmtDay, isoDate, parseIso, todayIso, weekday } from '../format';
import { useApi, useTitle } from '../hooks';

type CatF = 'todas' | 'plenario' | 'deliberativa' | 'audiencia';

/** Segunda-feira da semana de `iso`. */
function monday(iso: string): string {
  const d = parseIso(iso);
  const k = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - k);
  return isoDate(d);
}

export default function Pauta() {
  useTitle('Pauta');
  const [sp, setSp] = useSearchParams();
  const hoje = todayIso();
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('dia') || '') ? sp.get('dia')! : hoje;
  const casa = sp.get('casa') === 'camara' || sp.get('casa') === 'senado' ? sp.get('casa')! : '';
  const cat = (['plenario', 'deliberativa', 'audiencia'].includes(sp.get('cat') || '') ? sp.get('cat') : 'todas') as CatF;
  const ini = monday(dia);
  const fim = addDays(ini, 6);
  const set = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    setSp(n, { replace: true });
  };

  const { data, error, loading, reload } = useApi<PautaResp>(`/api/pauta${qs({ ini, fim, casa })}`, { refreshMs: 120000 });

  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data?.itens || []) m.set(r.data, (m.get(r.data) || 0) + 1);
    return m;
  }, [data]);
  const doDia = (data?.itens || []).filter((r) => r.data === dia);
  const counts = { todas: doDia.length, plenario: doDia.filter((r) => r.cat === 'plenario').length, deliberativa: doDia.filter((r) => r.cat === 'deliberativa').length, audiencia: doDia.filter((r) => r.cat === 'audiencia').length };
  const lista = doDia.filter((r) => cat === 'todas' || r.cat === cat);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ini, i));

  return (
    <>
      <PageHead title="Pauta" sub="O que está marcado para acontecer na Câmara e no Senado, dia a dia. Atualiza sozinha a cada poucos minutos." />
      <section className="card filters">
        <div className="row between wrap">
          <div className="row">
            <button className="btn" onClick={() => set({ dia: addDays(dia, -7) })} aria-label="Semana anterior">‹</button>
            <button className="btn" onClick={() => set({ dia: null })} disabled={dia === hoje}>Hoje</button>
            <button className="btn" onClick={() => set({ dia: addDays(dia, 7) })} aria-label="Próxima semana">›</button>
          </div>
          <Seg label="Casa" value={(casa || 'todas') as 'todas' | 'camara' | 'senado'} onChange={(v) => set({ casa: v === 'todas' ? null : v })} options={[{ id: 'todas', label: 'Ambas' }, { id: 'camara', label: 'Câmara' }, { id: 'senado', label: 'Senado' }]} />
        </div>
        <div className="daystrip" role="group" aria-label="Dias da semana">
          {days.map((d) => (
            <button key={d} className={`daybtn${d === hoje ? ' today' : ''}`} aria-pressed={d === dia} onClick={() => set({ dia: d === hoje ? null : d })}>
              <span>{weekday(d)}</span><b>{parseIso(d).getDate()}</b><small>{byDay.get(d) ? `${byDay.get(d)} reun.` : ''}</small>
            </button>
          ))}
        </div>
      </section>

      <h2>{fmtDay(dia)}{dia === hoje ? ' — hoje' : ''}</h2>
      <Chips label="Tipo de reunião" value={cat} onChange={(v) => set({ cat: v === 'todas' ? null : v })} options={[
        { id: 'todas', label: 'Todas', n: counts.todas }, { id: 'plenario', label: 'Plenário', n: counts.plenario }, { id: 'deliberativa', label: 'Deliberativas', n: counts.deliberativa }, { id: 'audiencia', label: 'Audiências', n: counts.audiencia },
      ]} />

      {data && Object.entries(data.erros).map(([k, msg]) => <div key={k} className="notice" role="status">{k === 'camara' ? 'Câmara' : 'Senado'}: {msg}. Os dados abaixo podem estar incompletos.</div>)}
      {error && !data && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <Skeleton rows={4} /> : (
        lista.length === 0 && data ? <Empty title="Nenhuma reunião para este filtro">Não há reuniões de {casa === 'camara' ? 'Câmara' : casa === 'senado' ? 'Senado' : 'Câmara ou Senado'} nesse dia{cat !== 'todas' ? ' e tipo' : ''}. Tente outro dia da semana.</Empty> : (
          <div className="grid cols-2">{lista.map((r) => <ReuniaoCard key={`${r.casa}:${r.id}`} r={r} />)}</div>
        )
      )}

      {(casa === '' || casa === 'senado') && (
        <p className="small faint">
          A pauta do <b>Plenário do Senado</b> não é publicada pelo serviço de dados abertos usado aqui; o Senado aparece com a agenda das comissões. Para o Plenário do Senado, consulte{' '}
          <ExtLink href="https://www25.senado.leg.br/web/atividade/plenario">a agenda oficial</ExtLink>.
        </p>
      )}
    </>
  );
}
