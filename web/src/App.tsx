import { Link, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { Empty } from './components/ui';
import Home from './pages/Home';
import Parlamentar from './pages/Parlamentar';
import Parlamentares from './pages/Parlamentares';
import Partidos from './pages/Partidos';
import Pauta from './pages/Pauta';
import Proposicao from './pages/Proposicao';
import Proposicoes from './pages/Proposicoes';
import Sobre from './pages/Sobre';
import Votacao from './pages/Votacao';
import Votacoes from './pages/Votacoes';

function NotFound() {
  return <Empty title="Página não encontrada"><Link className="link" to="/">Voltar ao início</Link></Empty>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="pauta" element={<Pauta />} />
        <Route path="votacoes" element={<Votacoes />} />
        <Route path="votacoes/:casa/:id" element={<Votacao />} />
        <Route path="parlamentares" element={<Parlamentares />} />
        <Route path="parlamentares/:casa/:id" element={<Parlamentar />} />
        <Route path="partidos" element={<Partidos />} />
        <Route path="proposicoes" element={<Proposicoes />} />
        <Route path="proposicoes/:id" element={<Proposicao />} />
        <Route path="sobre" element={<Sobre />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
