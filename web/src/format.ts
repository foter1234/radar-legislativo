import type { Cat, Casa } from './api';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const todayIso = () => isoDate(new Date());
export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDays(s: string, n: number): string {
  const d = parseIso(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
export function addMonths(s: string, n: number): string {
  const d = parseIso(s);
  d.setMonth(d.getMonth() + n);
  return isoDate(d);
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const [y, m, d] = s.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}
export function fmtDateShort(s: string): string {
  const d = parseIso(s);
  return `${d.getDate()} ${MESES_CURTOS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}
export function fmtDay(s: string): string {
  const d = parseIso(s);
  const txt = `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}
export function weekday(s: string): string { return DIAS[parseIso(s).getDay()].slice(0, 3); }
export function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MESES_CURTOS[m - 1]}/${String(y).slice(2)}`;
}
export function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export const fmtInt = (n: number) => n.toLocaleString('pt-BR');
export function fmtPct(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined) return '—';
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export const CAT_LABEL: Record<Cat | 'sem', string> = {
  sim: 'Sim', nao: 'Não', abst: 'Abstenção', obst: 'Obstrução', aus: 'Ausente', outro: 'Outro', sem: 'Sem registro',
};
export const CAT_ORDER: Cat[] = ['sim', 'nao', 'abst', 'obst', 'aus', 'outro'];

/** Texto do voto como a fonte oficial escreve, quando difere da categoria (ex.: "Art. 17", "P-NRV", "NCom"). */
export function votoTexto(cat: Cat | null, raw: string | null, casa: Casa): string {
  if (!cat) return CAT_LABEL.sem;
  if (casa === 'senado' && raw === 'NCom') return 'Não compareceu';
  if (casa === 'senado' && raw === 'P-NRV') return 'Presente, sem voto';
  if (cat === 'outro' && raw) return raw;
  return CAT_LABEL[cat];
}

export const casaNome = (c: Casa) => (c === 'camara' ? 'Câmara' : 'Senado');
export const casaPessoa = (c: Casa) => (c === 'camara' ? 'Deputado(a)' : 'Senador(a)');

export function resultadoTexto(aprovada: boolean | null, secreta = false): string {
  if (aprovada === true) return 'Aprovada';
  if (aprovada === false) return 'Rejeitada';
  return secreta ? 'Votação secreta' : 'Sem resultado';
}

export function initials(nome: string): string {
  const p = nome.replace(/^(dep\.?|sen\.?)\s+/i, '').split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

export function propLabel(p: { tipo: string; numero: number; ano: number }): string {
  return `${p.tipo} ${p.numero}/${p.ano}`;
}

/** Cor estável por partido, só para identificação visual. */
export function partyHue(p: string | null | undefined): number {
  let h = 0;
  for (const ch of p || '') h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export type Preset = 'tudo' | '12m' | '6m' | '3m';
export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'tudo', label: 'Tudo' }, { id: '12m', label: '12 meses' }, { id: '6m', label: '6 meses' }, { id: '3m', label: '3 meses' },
];
export function presetStart(p: Preset): string | undefined {
  const t = todayIso();
  if (p === '12m') return addMonths(t, -12);
  if (p === '6m') return addMonths(t, -6);
  if (p === '3m') return addMonths(t, -3);
  return undefined;
}

export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
