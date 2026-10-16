import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Votacao from './pages/Votacao';
import { wakeConfig } from './api';

wakeConfig.maxMs = 0;

const votacao = {
  votacao: { casa: 'camara', id: '1-1', data: '2026-05-10', orgao: 'PLEN', titulo: 'PL 1/2026', descricao: 'Votação nominal', ementa: 'Ementa de teste', aprovada: true, secreta: false,
    placar: { sim: 2, nao: 1, abst: 0, obst: 0, aus: 0, outro: 0, total: 3 }, link: null, eventoId: null, propId: 1, props: [{ id: 1, titulo: 'PL 1/2026', ementa: '' }] },
  orientacoes: [{ nome: 'PL', cat: 'sim', raw: 'Sim' }],
  partidos: [{ partido: 'PL', total: 3, sim: 2, nao: 1, abst: 0, obst: 0, aus: 0, outro: 0, seguiu: 66.7, refTipo: 'orientacao', orientacao: 'sim' }],
  votos: [
    { id: 1, nome: 'Ana Souza', partido: 'PL', uf: 'SP', cat: 'sim', raw: 'Sim', alinhado: true, ref_tipo: 'orientacao', foto: null },
    { id: 2, nome: 'Bruno Lima', partido: 'PL', uf: 'RJ', cat: 'nao', raw: 'Não', alinhado: false, ref_tipo: 'orientacao', foto: null },
    { id: 3, nome: 'Carla Dias', partido: 'PL', uf: 'MG', cat: 'sim', raw: 'Sim', alinhado: true, ref_tipo: 'orientacao', foto: null },
  ],
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount() {
  return render(
    <MemoryRouter initialEntries={['/votacoes/camara/1-1']}>
      <Routes><Route path="/votacoes/:casa/:id" element={<Votacao />} /></Routes>
    </MemoryRouter>,
  );
}

describe('tela de votação', () => {
  it('servidor dormindo: repete até acordar (página de espera em HTML, depois JSON)', async () => {
    wakeConfig.maxMs = 5000; wakeConfig.stepMs = 10;
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (++n < 3
      ? new Response('<html>acordando</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
      : new Response(JSON.stringify(votacao), { status: 200, headers: { 'Content-Type': 'application/json' } }))));
    mount();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'PL 1/2026' })).toBeTruthy());
    expect(n).toBe(3);
    wakeConfig.maxMs = 0;
  });
  it('mostra o placar e quem votou em quê', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(votacao), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    mount();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'PL 1/2026' })).toBeTruthy());
    expect(screen.getByText('Ana Souza')).toBeTruthy();
    expect(screen.getByText('Bruno Lima')).toBeTruthy();
    expect(screen.getByText(/Votou contra a orientação do partido/)).toBeTruthy();
  });
  it('mostra erro com botão para tentar de novo quando a API falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ erro: 'Votação não encontrada' }), { status: 404, headers: { 'Content-Type': 'application/json' } })));
    mount();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Votação não encontrada'));
  });
  it('mostra mensagem amigável sem conexão', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    mount();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Sem conexão'));
  });
});
