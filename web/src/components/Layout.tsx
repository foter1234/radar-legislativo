import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon, Mark } from './ui';
import { onWaking } from '../api';

const MAIN = [
  { to: '/', label: 'Início', icon: Icon.home, end: true },
  { to: '/pauta', label: 'Pauta', icon: Icon.calendar },
  { to: '/votacoes', label: 'Votações', icon: Icon.vote },
  { to: '/parlamentares', label: 'Parlamentares', icon: Icon.people },
];
const MORE = [
  { to: '/partidos', label: 'Partidos' },
  { to: '/proposicoes', label: 'Buscar projetos' },
  { to: '/sobre', label: 'Sobre os dados' },
];

type Theme = 'auto' | 'light' | 'dark';
function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { const t = localStorage.getItem('radar:theme'); return t === 'light' || t === 'dark' ? t : 'auto'; } catch { return 'auto'; }
  });
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'auto') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', theme);
    try { if (theme === 'auto') localStorage.removeItem('radar:theme'); else localStorage.setItem('radar:theme', theme); } catch { /* sem armazenamento */ }
  }, [theme]);
  return [theme, setTheme] as const;
}

export default function Layout() {
  const [theme, setTheme] = useTheme();
  const [more, setMore] = useState(false);
  const [waking, setWakingUi] = useState(false);
  useEffect(() => onWaking(setWakingUi), []);
  const loc = useLocation();
  useEffect(() => { setMore(false); window.scrollTo(0, 0); }, [loc.pathname]);
  const moreActive = MORE.some((m) => loc.pathname.startsWith(m.to));
  const nextTheme: Theme = theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto';

  return (
    <>
      <a href="#conteudo" className="sr">Ir para o conteúdo</a>
      <header className="topbar">
        <div className="topbar-in">
          <Link to="/" className="brand"><Mark /> Radar Legislativo</Link>
          <nav className="nav" aria-label="Principal">
            {[...MAIN, ...MORE.map((m) => ({ ...m, icon: null, end: false }))].map((n) => (
              <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : false} className={({ isActive }) => (isActive ? 'on' : '')}>{n.label}</NavLink>
            ))}
          </nav>
          <span className="spacer" />
          <button className="iconbtn" onClick={() => setTheme(nextTheme)} title={`Tema: ${theme === 'auto' ? 'automático' : theme === 'dark' ? 'escuro' : 'claro'} (clique para mudar)`} aria-label="Alternar tema">
            {Icon.sun}
          </button>
        </div>
      </header>

      {waking && (
        <div className="wakebar" role="status">
          <span className="spin" aria-hidden="true" />
          Acordando o servidor… a versão gratuita “dorme” quando fica sem uso e leva até 1 minuto para voltar.
        </div>
      )}
      <main id="conteudo" className="page"><Outlet /></main>

      <footer className="footer">
        Dados oficiais: <a href="https://dadosabertos.camara.leg.br" target="_blank" rel="noopener noreferrer">Câmara dos Deputados</a> e{' '}
        <a href="https://www12.senado.leg.br/dados-abertos" target="_blank" rel="noopener noreferrer">Senado Federal</a>. Projeto independente, sem vínculo com o governo ou com partidos.
        <br />Este app organiza e resume as informações; em caso de dúvida, vale a fonte oficial.
      </footer>

      <nav className="bottomnav" aria-label="Principal (celular)">
        {MAIN.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'on' : '')}>{n.icon}{n.label === 'Parlamentares' ? 'Congresso' : n.label}</NavLink>
        ))}
        <button onClick={() => setMore(true)} className={moreActive ? 'on' : ''} style={moreActive ? { color: 'var(--accent)' } : undefined} aria-haspopup="dialog">{Icon.more}Mais</button>
      </nav>
      {more && (
        <>
          <div className="sheet-back" onClick={() => setMore(false)} />
          <div className="sheet" role="dialog" aria-label="Mais opções">
            {MORE.map((m) => <NavLink key={m.to} to={m.to} className={({ isActive }) => (isActive ? 'on' : '')}>{m.label}<span>›</span></NavLink>)}
          </div>
        </>
      )}
    </>
  );
}
