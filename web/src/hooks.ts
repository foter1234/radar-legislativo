import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiGet } from './api';

export interface ApiState<T> { data: T | null; error: string | null; loading: boolean; reload: () => void }

/** Busca `path` (ou nada, se null). Descarta respostas antigas quando o caminho muda. */
export function useApi<T>(path: string | null, opts: { refreshMs?: number } = {}): ApiState<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean; key: string | null }>({ data: null, error: null, loading: !!path, key: path });
  const [tick, setTick] = useState(0);
  const refreshMs = opts.refreshMs;

  useEffect(() => {
    if (!path) { setState({ data: null, error: null, loading: false, key: null }); return; }
    const ctl = new AbortController();
    // ao trocar de caminho, não mostra dado do caminho anterior
    setState((s) => (s.key === path ? { ...s, loading: true, error: null } : { data: null, error: null, loading: true, key: path }));
    apiGet<T>(path, ctl.signal)
      .then((data) => setState({ data, error: null, loading: false, key: path }))
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return;
        setState((s) => ({ data: s.key === path ? s.data : null, error: e instanceof ApiError ? e.message : 'Erro inesperado.', loading: false, key: path }));
      });
    return () => ctl.abort();
  }, [path, tick]);

  useEffect(() => {
    if (!refreshMs || !path) return;
    const t = setInterval(() => setTick((n) => n + 1), refreshMs);
    return () => clearInterval(t);
  }, [refreshMs, path]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}

export interface PagerState<I> { itens: I[]; total: number | null; loading: boolean; loadingMore: boolean; error: string | null; hasMore: boolean; loadMore: () => void; reload: () => void; extra: Record<string, unknown> | null }

/** Lista paginada com "carregar mais". `build(offset)` devolve o caminho da API para aquela página. */
export function usePager<I, R = { total: number; itens: I[] }>(base: string | null, pageSize: number, select: (r: R) => { total: number; itens: I[] } = (r) => r as unknown as { total: number; itens: I[] }): PagerState<I> {
  const selRef = useRef(select);
  selRef.current = select;
  const [st, setSt] = useState<{ itens: I[]; total: number | null; loading: boolean; loadingMore: boolean; error: string | null; extra: Record<string, unknown> | null; key: string | null }>(
    { itens: [], total: null, loading: !!base, loadingMore: false, error: null, extra: null, key: base },
  );
  const [tick, setTick] = useState(0);
  const ctl = useRef<AbortController | null>(null);
  const sep = base && base.includes('?') ? '&' : '?';

  useEffect(() => {
    ctl.current?.abort();
    if (!base) { setSt({ itens: [], total: null, loading: false, loadingMore: false, error: null, extra: null, key: null }); return; }
    const c = new AbortController();
    ctl.current = c;
    setSt((s) => ({ itens: s.key === base ? s.itens : [], total: s.key === base ? s.total : null, loading: true, loadingMore: false, error: null, extra: s.key === base ? s.extra : null, key: base }));
    apiGet<R>(`${base}${sep}limit=${pageSize}&offset=0`, c.signal)
      .then((r) => { const x = selRef.current(r); setSt({ itens: x.itens, total: x.total, loading: false, loadingMore: false, error: null, extra: r as unknown as Record<string, unknown>, key: base }); })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return;
        setSt((s) => ({ ...s, loading: false, error: e instanceof ApiError ? e.message : 'Erro inesperado.' }));
      });
    return () => c.abort();
  }, [base, pageSize, sep, tick]);

  const stRef = useRef(st);
  stRef.current = st;
  const loadMore = useCallback(() => {
    const s = stRef.current;
    if (!base || s.loadingMore || s.loading || s.total === null || s.itens.length >= s.total) return;
    const c = new AbortController();
    ctl.current = c;
    setSt((p) => ({ ...p, loadingMore: true, error: null }));
    apiGet<R>(`${base}${sep}limit=${pageSize}&offset=${s.itens.length}`, c.signal)
      .then((r) => { const x = selRef.current(r); setSt((p) => (p.key !== base ? p : { ...p, itens: [...p.itens, ...x.itens], total: x.total, loadingMore: false })); })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return;
        setSt((p) => ({ ...p, loadingMore: false, error: e instanceof ApiError ? e.message : 'Erro inesperado.' }));
      });
  }, [base, pageSize, sep]);

  return {
    itens: st.itens, total: st.total, loading: st.loading, loadingMore: st.loadingMore, error: st.error, extra: st.extra,
    hasMore: st.total !== null && st.itens.length < st.total, loadMore, reload: () => setTick((n) => n + 1),
  };
}

/** Valor com atraso, para campos de busca não dispararem uma consulta por tecla. */
export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Radar Legislativo` : 'Radar Legislativo';
  }, [title]);
}
