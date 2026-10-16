import { describe, expect, it } from 'vitest';
import { addDays, addMonths, fmtDate, fmtDay, fmtPct, initials, norm, presetStart, votoTexto } from './format';

describe('format', () => {
  it('formata datas sem deslocar por fuso', () => {
    expect(fmtDate('2026-03-05')).toBe('05/03/2026');
    expect(fmtDate('2026-03-05T10:00:00')).toBe('05/03/2026');
    expect(fmtDate(null)).toBe('—');
    expect(fmtDay('2026-10-15')).toBe('Quinta-feira, 15 de outubro');
  });
  it('soma dias e meses', () => {
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addMonths('2026-03-31', -1)).toMatch(/^2026-0[23]-/);
  });
  it('porcentagem em pt-BR', () => {
    expect(fmtPct(33.3, 1)).toBe('33,3%');
    expect(fmtPct(null)).toBe('—');
    expect(fmtPct(100)).toBe('100%');
  });
  it('texto do voto', () => {
    expect(votoTexto('sim', 'Sim', 'camara')).toBe('Sim');
    expect(votoTexto(null, null, 'camara')).toBe('Sem registro');
    expect(votoTexto('aus', 'NCom', 'senado')).toBe('Não compareceu');
    expect(votoTexto('aus', 'P-NRV', 'senado')).toBe('Presente, sem voto');
    expect(votoTexto('outro', 'Art. 17', 'camara')).toBe('Art. 17');
  });
  it('utilitários', () => {
    expect(norm('Doação de Órgãos')).toBe('doacao de orgaos');
    expect(initials('Maria da Silva')).toBe('MS');
    expect(presetStart('tudo')).toBeUndefined();
    expect(presetStart('3m')).toBeDefined();
  });
});
