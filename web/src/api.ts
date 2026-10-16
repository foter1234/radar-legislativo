// Tipos e chamadas da API do próprio app (o servidor Node que guarda o histórico).

export type Casa = 'camara' | 'senado';
export type Cat = 'sim' | 'nao' | 'abst' | 'obst' | 'aus' | 'outro';

export interface Placar { sim: number; nao: number; abst: number; obst: number; aus: number; outro: number; total: number }

export interface VotacaoResumo {
  casa: Casa; id: string; data: string; orgao: string; titulo: string; descricao: string; ementa: string;
  aprovada: boolean | null; secreta: boolean; placar: Placar;
}
export interface Cobertura { ini: string | null; fim: string | null }
export interface VotacoesResp { total: number; itens: VotacaoResumo[]; cobertura: { camara: Cobertura; senado: Cobertura } }

export interface VotoLinha {
  id: number; nome: string; partido: string; uf: string; cat: Cat; raw: string; alinhado: boolean | null; ref_tipo: 'orientacao' | 'maioria' | null; foto: string | null;
}
export interface PartidoLinha {
  partido: string; total: number; sim: number; nao: number; abst: number; obst: number; aus: number; outro: number;
  seguiu: number | null; refTipo: 'orientacao' | 'maioria' | null; orientacao: string | null;
}
export interface VotacaoDetalhe {
  votacao: VotacaoResumo & { link: string | null; eventoId: number | null; propId: number | null; props: { id: number; titulo: string; ementa: string }[] };
  orientacoes: { nome: string; cat: string | null; raw: string }[];
  partidos: PartidoLinha[];
  votos: VotoLinha[];
}

export interface Parlamentar {
  casa: Casa; id: number; nome: string; partido: string | null; uf: string | null; foto: string | null; email: string | null; pagina: string | null;
  primeira: string | null; ultima: string | null; legislatura: number | null;
}
export interface ParlamentaresResp { total: number; itens: Parlamentar[] }
export interface Filtros { partidos: string[]; ufs: string[] }

export interface Stats {
  janela: { ini: string; fim: string; primeira: string; ultima: string } | null;
  votos: { total: number; sim: number; nao: number; abst: number; obst: number; aus: number; outro: number } | null;
  nominais: number;
  participacao: number | null;
  alinhamento: { comReferencia: number; alinhados: number; pct: number | null } | null;
  orientacao: { comOrientacao: number; seguiu: number; pct: number | null } | null;
  presenca: { base: 'sessoes' | 'votacoes'; total: number; presentes: number; pct: number | null } | null;
}
export interface Detalhe {
  nomeCivil: string | null; sexo: string | null; dataNascimento: string | null; ufNascimento: string | null; municipioNascimento: string | null;
  escolaridade: string | null; urlWebsite: string | null; redeSocial: string[]; situacao: string | null; condicaoEleitoral: string | null; nomeEleitoral: string | null;
  gabinete: { nome: string; predio: string; sala: string; andar: string; telefone: string; email: string } | null;
}
export interface PerfilResp { parlamentar: Parlamentar; detalhe: Detalhe | null; stats: Stats }

export interface VotoHistorico extends VotacaoResumo {
  voto: Cat | null; votoRaw: string | null; partidoNaData: string | null; alinhado: boolean | null; refTipo: 'orientacao' | 'maioria' | null;
}
export interface VotosResp { total: number; itens: VotoHistorico[] }

export interface PresencaResp {
  base: 'sessoes' | 'votacoes'; meses: { mes: string; total: number; presentes: number }[];
  sessoes: { id: number; data: string; hora: string; tipo: string; descricao: string; presente: boolean }[];
  totalSessoes?: number; total: number; presentes: number; pct: number | null; janela: Stats['janela'];
}

export interface ProposicaoItem {
  id: number; tipo: string; numero: number; ano: number; ementa: string; data: string;
  situacao?: string | null; orgao?: string | null; despacho?: string | null; dataStatus?: string | null; lei?: boolean; verificada?: boolean; principal?: boolean; link?: string | null;
}
export interface ProposicoesResp {
  total: number; itens: ProposicaoItem[]; resumo: { total: number; porTipo: Record<string, number>; leis: number | null; pendentes: number };
  aviso?: string; semSituacao?: boolean; indisponivel?: boolean;
}

export interface PartidoStat {
  partido: string; membros: number; votos: number; votacoes: number; sim: number | null; nao: number | null; abstObst: number | null;
  contagem: Placar; alinhamento: number | null; seguiuOrientacao: number | null;
}
export interface PartidosResp { casa: Casa; de: string; ate: string; nominais: number; itens: PartidoStat[] }

export interface ReuniaoItem { ordem: number | string; titulo: string; apelido?: string; ementa: string; autor?: string; relatorio?: string; situacao?: string }
export interface Reuniao {
  casa: Casa; id: string; data: string; hora: string; cat: 'plenario' | 'deliberativa' | 'audiencia' | 'outros'; tipo: string; titulo: string;
  orgao: string; orgaoNome: string; situacao: string; descricao: string; local: string; links: Record<string, string | null>; itens: ReuniaoItem[] | null;
}
export interface PautaResp { ini: string; fim: string; itens: Reuniao[]; erros: Partial<Record<Casa, string>> }
export interface PautaItem {
  ordem: number; titulo: string; topico: string; regime: string; ementa: string; propId: number | null;
  relator: { id: number; nome: string; partido: string; uf: string } | null; situacao: string; votacaoId: string;
}

export interface PropBusca { pagina: number; temMais: boolean; itens: ProposicaoItem[] }
export interface PropDetalhe {
  proposicao: {
    id: number; tipo: string; numero: number; ano: number; descricaoTipo: string; ementa: string; ementaDetalhada: string; keywords: string;
    apresentacao: string; inteiroTeor: string | null; oficial: string; lei: boolean;
  };
  situacao: { descricao: string | null; tramitacao: string | null; orgao: string | null; regime: string | null; despacho: string | null; data: string | null; apreciacao: string | null };
  autores: { nome: string; tipo: string; deputadoId: number | null }[];
  tramitacoes: { data: string; orgao: string; tramitacao: string; situacao: string | null; despacho: string }[];
  votacoes: { id: string; data: string; orgao: string; descricao: string; aprovada: boolean | null; naBase: boolean }[];
}

export interface StatusResp {
  camara: { votacoes: number; nominais: number; primeira: string | null; ultima: string | null; parlamentares: number; sessoes: number };
  senado: { votacoes: number; nominais: number; primeira: string | null; ultima: string | null; parlamentares: number; sessoes: number };
  ultimaSync: string | null; desde: string | null;
  banco?: { tipo: string; tamanhoMB: number | null; limiteMB: number | null };
  sync: { onde?: string; running: boolean; fase: string; detalhe: string; feito: number; total: number; erros: number; inicio: string | null; fim: string | null; ultimoErro: string };
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '' || v === false) continue;
    u.set(k, v === true ? '1' : String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

/* ---------- servidor "dormindo" ----------
 * Na hospedagem gratuita (Render) o servidor dorme após 15 min sem acesso e leva ~1 min para acordar.
 * Enquanto isso, as consultas falham ou recebem uma página de espera em vez de JSON. Aqui elas são
 * repetidas por até ~2 min e a interface mostra um aviso "acordando o servidor". */
type WakeListener = (waking: boolean) => void;
const wakeListeners = new Set<WakeListener>();
let waking = false;
function setWaking(v: boolean) {
  if (v === waking) return;
  waking = v;
  wakeListeners.forEach((f) => f(v));
}
export function onWaking(f: WakeListener): () => void { wakeListeners.add(f); f(waking); return () => { wakeListeners.delete(f); }; }
export const wakeConfig = { maxMs: 120000, stepMs: 3000 };

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
});
class Transient extends Error {}

async function attempt<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new Transient('rede');
  }
  const type = res.headers.get('content-type') || '';
  if ([502, 503, 504].includes(res.status) || (res.ok && !type.includes('json'))) throw new Transient(`http ${res.status}`);
  if (!res.ok) {
    let msg = 'Não foi possível carregar os dados.';
    try { const j = await res.json(); if (j && j.erro) msg = j.erro; } catch { /* corpo não é JSON */ }
    if (res.status === 429) msg = 'Muitas consultas em pouco tempo. Aguarde alguns segundos.';
    throw new ApiError(res.status, msg);
  }
  try { return (await res.json()) as T; } catch { throw new Transient('json'); }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const start = Date.now();
  for (;;) {
    try {
      const r = await attempt<T>(path, signal);
      setWaking(false);
      return r;
    } catch (e) {
      if (!(e instanceof Transient)) throw e;
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (offline || Date.now() - start >= wakeConfig.maxMs) {
        setWaking(false);
        throw new ApiError(0, offline ? 'Você está sem internet. Conecte-se e tente de novo.' : 'Sem conexão com o servidor. Verifique sua internet e tente de novo.');
      }
      setWaking(true);
      await sleep(wakeConfig.stepMs, signal);
    }
  }
}

export const enc = encodeURIComponent;
