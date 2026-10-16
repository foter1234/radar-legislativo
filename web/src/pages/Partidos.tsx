import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PartidosResp } from '../api';
import { qs } from '../api';
import { Empty, ErrorBox, PageHead, Seg, Skeleton } from '../components/ui';
import { fmtDate, fmtInt, fmtPct } from '../format';
import { useApi, useTitle } from '../hooks';

type Ord = 'membros' | 'sim' | 'nao' | 'alinhamento' | 'seguiu';

export default function Partidos() {
  useTitle('Partidos');
  const [sp, setSp] = useSearchParams();
  const casa = sp.get('casa') === 'senado' ? 'senado' : 'camara';
  const [ord, setOrd] = useState<Ord>('membros');
  const { data, error, loading, reload } = useApi<PartidosResp>(`/api/partidos${qs({ casa })}`);
  const itens = useMemo(() => {
    const arr = [...(data?.itens || [])];
    const key = (p: PartidosResp['itens'][number]) => (ord === 'membros' ? p.membros : ord === 'sim' ? p.sim : ord === 'nao' ? p.nao : ord === 'alinhamento' ? p.alinhamento : p.seguiuOrientacao);
    return arr.sort((a, b) => (key(b) ?? -1) - (key(a) ?? -1));
  }, [data, ord]);

  return (
    <>
      <PageHead title="Partidos" sub="Como cada partido votou nas votações nominais do Plenário, nos últimos 12 meses de dados importados." />
      <div className="row wrap between">
        <Seg label="Casa" value={casa} onChange={(v) => setSp(v === 'camara' ? {} : { casa: v }, { replace: true })} options={[{ id: 'camara', label: 'Câmara' }, { id: 'senado', label: 'Senado' }]} />
        <Seg label="Ordenar por" value={ord} onChange={setOrd} options={[{ id: 'membros', label: 'Tamanho' }, { id: 'sim', label: '% Sim' }, { id: 'nao', label: '% Não' }, { id: 'alinhamento', label: 'Coesão' }]} />
      </div>
      {error && !data && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <Skeleton rows={6} /> : data && (itens.length === 0 ? <Empty title="Sem dados no período">Ainda não há votações nominais importadas para esta casa.</Empty> : (
        <section className="card flush">
          <div className="tscroll">
            <table className="t">
              <thead><tr><th>Partido</th><th className="r">Parlamentares</th><th className="r">% Sim</th><th className="r">% Não</th><th className="r">% Abst./Obstr.</th><th className="r" title="Parte dos votos que seguiram a orientação do partido ou, sem orientação, a maioria da bancada">Coesão</th><th className="r" title="Parte dos votos que seguiram a orientação oficial, quando houve">Seguiu orientação</th></tr></thead>
              <tbody>
                {itens.map((p) => (
                  <tr key={p.partido}>
                    <td><b>{p.partido}</b></td><td className="r">{fmtInt(p.membros)}</td>
                    <td className="r">{fmtPct(p.sim)}</td><td className="r">{fmtPct(p.nao)}</td><td className="r">{fmtPct(p.abstObst)}</td>
                    <td className="r">{fmtPct(p.alinhamento)}</td><td className="r">{fmtPct(p.seguiuOrientacao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {data && <p className="small faint">Período: {fmtDate(data.de)} a {fmtDate(data.ate)} · {fmtInt(data.nominais)} votações nominais. “Parlamentares” conta quem votou ao menos uma vez pelo partido no período; quem trocou de partido aparece em cada um, no período correspondente.</p>}
    </>
  );
}
