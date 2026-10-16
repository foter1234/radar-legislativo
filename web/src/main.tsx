import { StrictMode, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.error(e); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ padding: 24, maxWidth: 560, margin: '10vh auto', fontFamily: 'system-ui' }}>
        <h1>Algo deu errado</h1>
        <p>Ocorreu um erro inesperado ao montar a tela. Recarregue a página; se persistir, tente novamente mais tarde.</p>
        <button onClick={() => location.reload()}>Recarregar</button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><Boundary><BrowserRouter><App /></BrowserRouter></Boundary></StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* sem service worker: o app funciona igual */ }); });
}
