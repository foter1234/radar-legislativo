import type { StatusResp } from '../api';
import { ErrorBox, ExtLink, PageHead, Skeleton } from '../components/ui';
import { fmtDate, fmtDateTime, fmtInt } from '../format';
import { useApi, useTitle } from '../hooks';

export default function Sobre() {
  useTitle('Sobre os dados');
  const { data: s, error, reload } = useApi<StatusResp>('/api/status', { refreshMs: 10000 });
  return (
    <>
      <PageHead title="Sobre os dados" sub="De onde vêm as informações, o que este app calcula e o que ele não cobre." />
      {error && !s && <ErrorBox message={error} onRetry={reload} />}
      {!s && !error && <Skeleton rows={3} />}
      {s && (
        <section className="card" aria-label="Estado da importação">
          <h2>Histórico importado</h2>
          {s.sync.running && (
            <div className="notice info" role="status">
              Importando agora: {s.sync.fase}{s.sync.detalhe ? ` (${s.sync.detalhe})` : ''} — {fmtInt(s.sync.feito)}{s.sync.total ? ` de ${fmtInt(s.sync.total)}` : ''}{s.sync.erros ? ` · ${s.sync.erros} falhas (serão tentadas de novo)` : ''}.
            </div>
          )}
          {!s.sync.running && s.sync.erros > 0 && <div className="notice">A última importação teve {s.sync.erros} falhas na fonte oficial; elas são retomadas automaticamente na próxima rodada. Último erro: {s.sync.ultimoErro}</div>}
          <div className="tscroll">
            <table className="t">
              <thead><tr><th></th><th className="r">Votações</th><th className="r">Com voto individual</th><th className="r">Parlamentares</th><th className="r">Sessões</th><th>Período</th></tr></thead>
              <tbody>
                {(['camara', 'senado'] as const).map((c) => (
                  <tr key={c}><td><b>{c === 'camara' ? 'Câmara' : 'Senado'}</b></td><td className="r">{fmtInt(s[c].votacoes)}</td><td className="r">{fmtInt(s[c].nominais)}</td><td className="r">{fmtInt(s[c].parlamentares)}</td><td className="r">{c === 'camara' ? fmtInt(s[c].sessoes) : '—'}</td><td>{s[c].primeira ? `${fmtDate(s[c].primeira)} a ${fmtDate(s[c].ultima)}` : '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">Última sincronização concluída: {fmtDateTime(s.ultimaSync)}{s.desde ? ` · histórico desde ${fmtDate(s.desde)}` : ''}{s.sync.onde ? ` · importação feita por: ${s.sync.onde}` : ''}.</p>
          {s.banco && s.banco.tamanhoMB !== null && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="small muted">Banco de dados ({s.banco.tipo}): {s.banco.tamanhoMB.toLocaleString('pt-BR')} MB{s.banco.limiteMB ? ` de ${s.banco.limiteMB} MB do plano` : ''}</span>
              {s.banco.limiteMB ? <div className="meter" aria-hidden="true"><i style={{ width: `${Math.min(100, (100 * s.banco.tamanhoMB) / s.banco.limiteMB)}%`, background: s.banco.tamanhoMB / s.banco.limiteMB > 0.85 ? 'var(--nao)' : undefined }} /></div> : null}
            </div>
          )}
        </section>
      )}

      <section className="card">
        <h2>Fontes</h2>
        <p>Todos os dados vêm das APIs de dados abertos oficiais: <ExtLink href="https://dadosabertos.camara.leg.br">Câmara dos Deputados</ExtLink> e <ExtLink href="https://www12.senado.leg.br/dados-abertos">Senado Federal</ExtLink>. O histórico de votações é copiado para o servidor deste app e atualizado automaticamente; pauta, tramitação e dados cadastrais são consultados ao vivo (com cache curto).</p>
      </section>

      <section className="card">
        <h2>Como os números são calculados</h2>
        <div className="stack">
          <p><b>Participação em votações:</b> votos registrados (Sim, Não, Abstenção ou Obstrução) divididos pelas votações nominais do Plenário ocorridas entre a primeira e a última aparição do parlamentar nos dados. Quem assumiu depois ou saiu antes não é penalizado pelo período fora do cargo, mas licenças no meio do mandato contam como falta.</p>
          <p><b>Presença (Câmara):</b> sessões deliberativas do Plenário em que o deputado consta como presente, divididas pelo total dessas sessões no mesmo período. Não inclui comissões.</p>
          <p><b>Presença (Senado):</b> calculada pelas votações nominais do Plenário — “Não compareceu” conta como falta; voto ou “presente, sem voto” contam como presença.</p>
          <p><b>Alinhamento ao partido:</b> parte dos votos que coincidem com a orientação oficial do partido na votação ou, se não houve orientação, com o voto da maioria da bancada (só quando há pelo menos 3 votos Sim/Não e não há empate). Bancada liberada não entra na conta. O partido considerado é o da data da votação.</p>
          <p><b>Leis:</b> projetos de autoria ou coautoria do deputado cuja situação oficial é “Transformado em Norma Jurídica”. A situação de cada projeto é conferida aos poucos na fonte oficial, por isso a lista pode demorar alguns instantes na primeira visita.</p>
        </div>
      </section>

      <section className="card">
        <h2>O que este app não cobre</h2>
        <div className="stack">
          <p>• Votações simbólicas e secretas não têm voto individual, então não aparecem no histórico de cada parlamentar.</p>
          <p>• Só votações do <b>Plenário</b> entram no histórico; votos em comissões não são importados.</p>
          <p>• A pauta do <b>Plenário do Senado</b> não está disponível na fonte usada; o Senado aparece com as reuniões de comissões.</p>
          <p>• A lista de projetos de senadores usa um serviço do Senado que pode ser descontinuado e não informa quais viraram lei.</p>
          <p>• Os dados dependem da publicação oficial e podem ter atraso de horas ou dias, ou correções posteriores.</p>
        </div>
      </section>
    </>
  );
}
