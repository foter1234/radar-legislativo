import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PropBusca } from '../api';
import { qs } from '../api';
import { PropRow } from './parlamentar/Proposicoes';
import { Empty, ErrorBox, Field, PageHead, Skeleton } from '../components/ui';
import { useApi, useTitle } from '../hooks';

export default function Proposicoes() {
  useTitle('Buscar projetos');
  const [sp, setSp] = useSearchParams();
  const [tipo, setTipo] = useState(sp.get('tipo') || '');
  const [numero, setNumero] = useState(sp.get('numero') || '');
  const [ano, setAno] = useState(sp.get('ano') || '');
  const [q, setQ] = useState(sp.get('q') || '');
  const [pagina, setPagina] = useState(1);
  const ativo = !!(sp.get('numero') || sp.get('q'));
  const path = ativo ? `/api/proposicoes${qs({ tipo: sp.get('tipo'), numero: sp.get('numero'), ano: sp.get('ano'), q: sp.get('q'), pagina })}` : null;
  const { data, error, loading, reload } = useApi<PropBusca>(path);
  useEffect(() => setPagina(1), [sp]);

  const buscar = (e: React.FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (tipo.trim()) n.tipo = tipo.trim().toUpperCase();
    if (numero.trim()) n.numero = numero.trim();
    if (ano.trim()) n.ano = ano.trim();
    if (q.trim()) n.q = q.trim();
    setSp(n);
  };

  return (
    <>
      <PageHead title="Buscar projetos" sub="Encontre um projeto da Câmara pelo número (ex.: PL 2338/2023) ou por palavra-chave, e veja a tramitação, os autores e as votações." />
      <form className="card filters" onSubmit={buscar}>
        <div className="fields">
          <Field label="Tipo"><input className="input" value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="PL, PEC, PLP…" maxLength={6} /></Field>
          <Field label="Número"><input className="input" inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))} placeholder="2338" /></Field>
          <Field label="Ano"><input className="input" inputMode="numeric" value={ano} onChange={(e) => setAno(e.target.value.replace(/\D/g, ''))} placeholder="2023" maxLength={4} /></Field>
        </div>
        <Field label="Ou palavra-chave"><input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex.: inteligência artificial" /></Field>
        <button className="btn primary" type="submit" style={{ alignSelf: 'flex-start' }}>Buscar</button>
      </form>
      {!ativo && <Empty title="Digite o número ou uma palavra-chave">Dica: use o tipo, o número e o ano juntos para achar um projeto específico.</Empty>}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && ativo && <Skeleton rows={4} />}
      {data && (data.itens.length === 0 ? <Empty title="Nada encontrado">Confira o tipo, o número e o ano.</Empty> : (
        <section className="card flush"><div className="list">{data.itens.map((p) => <PropRow key={p.id} p={p} casa="camara" />)}</div>
          <div className="row between" style={{ padding: 12 }}>
            <button className="btn" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>‹ Anterior</button>
            <span className="small muted">Página {pagina}</span>
            <button className="btn" disabled={!data.temMais} onClick={() => setPagina(pagina + 1)}>Próxima ›</button>
          </div>
        </section>
      ))}
    </>
  );
}
