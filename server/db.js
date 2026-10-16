// Banco de dados: Postgres.
// - Com DATABASE_URL (ex.: Supabase), conecta num Postgres de verdade via `pg`.
// - Sem DATABASE_URL, usa o PGlite (Postgres embutido, guardado numa pasta local) — nada para instalar.
// O mesmo SQL roda nos dois.
import fs from 'node:fs';

const TABLES = ['parlamentar', 'votacao', 'voto', 'orientacao', 'sessao', 'presenca', 'proposicao_status', 'http_cache', 'meta'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS parlamentar (
  casa TEXT NOT NULL,
  id INTEGER NOT NULL,
  nome TEXT NOT NULL,
  nome_norm TEXT NOT NULL,
  partido TEXT,
  uf TEXT,
  foto TEXT,
  email TEXT,
  pagina TEXT,
  legislatura INTEGER,
  primeira_data TEXT,
  ultima_data TEXT,
  PRIMARY KEY (casa, id)
);
CREATE INDEX IF NOT EXISTS parlamentar_nome ON parlamentar (casa, nome_norm);

CREATE TABLE IF NOT EXISTS votacao (
  casa TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  ts TEXT NOT NULL,
  orgao TEXT,
  descricao TEXT,
  aprovada SMALLINT,
  titulo TEXT,
  ementa TEXT,
  prop_id BIGINT,
  props_json TEXT,
  evento_id BIGINT,
  link TEXT,
  secreta SMALLINT NOT NULL DEFAULT 0,
  n_sim INTEGER NOT NULL DEFAULT 0,
  n_nao INTEGER NOT NULL DEFAULT 0,
  n_abst INTEGER NOT NULL DEFAULT 0,
  n_obst INTEGER NOT NULL DEFAULT 0,
  n_aus INTEGER NOT NULL DEFAULT 0,
  n_outro INTEGER NOT NULL DEFAULT 0,
  n_total INTEGER NOT NULL DEFAULT 0,
  busca TEXT,
  complete SMALLINT NOT NULL DEFAULT 0,
  synced_at TEXT,
  PRIMARY KEY (casa, id)
);
CREATE INDEX IF NOT EXISTS votacao_data ON votacao (casa, data DESC, ts DESC);
CREATE INDEX IF NOT EXISTS votacao_data_all ON votacao (data DESC, ts DESC);

CREATE TABLE IF NOT EXISTS voto (
  casa TEXT NOT NULL,
  votacao_id TEXT NOT NULL,
  parlamentar_id INTEGER NOT NULL,
  cat TEXT NOT NULL,
  raw TEXT,
  partido TEXT,
  uf TEXT,
  ref_tipo TEXT,
  alinhado SMALLINT,
  PRIMARY KEY (casa, votacao_id, parlamentar_id)
);
CREATE INDEX IF NOT EXISTS voto_parlamentar ON voto (casa, parlamentar_id, votacao_id);

CREATE TABLE IF NOT EXISTS orientacao (
  casa TEXT NOT NULL,
  votacao_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  cat TEXT,
  raw TEXT,
  PRIMARY KEY (casa, votacao_id, nome)
);

CREATE TABLE IF NOT EXISTS sessao (
  casa TEXT NOT NULL,
  id BIGINT NOT NULL,
  data TEXT NOT NULL,
  hora TEXT,
  tipo TEXT,
  descricao TEXT,
  n_presentes INTEGER NOT NULL DEFAULT 0,
  complete SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (casa, id)
);
CREATE INDEX IF NOT EXISTS sessao_data ON sessao (casa, data);

CREATE TABLE IF NOT EXISTS presenca (
  casa TEXT NOT NULL,
  sessao_id BIGINT NOT NULL,
  parlamentar_id INTEGER NOT NULL,
  PRIMARY KEY (casa, sessao_id, parlamentar_id)
);
CREATE INDEX IF NOT EXISTS presenca_parlamentar ON presenca (casa, parlamentar_id);

CREATE TABLE IF NOT EXISTS proposicao_status (
  id BIGINT PRIMARY KEY,
  situacao TEXT,
  cod_situacao TEXT,
  tramitacao TEXT,
  orgao TEXT,
  despacho TEXT,
  data_status TEXT,
  is_lei SMALLINT NOT NULL DEFAULT 0,
  atualizado BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS http_cache (
  key TEXT PRIMARY KEY,
  ts BIGINT NOT NULL,
  body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
${/* No Supabase as tabelas do schema public ficam expostas pela API REST deles; com RLS ligado e sem políticas,
   ninguém lê nem escreve por lá. O app conecta como dono das tabelas, que não é afetado. */ ''}
${TABLES.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join('\n')}
`;

/** Converte `?` em `$1, $2…` (o SQL do app nunca usa `?` dentro de textos literais). */
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}
const NUMERIC_TYPES = new Set([20, 1700]); // int8, numeric
function cleanParams(params) {
  return params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));
}
function normalize(res) {
  const conv = (res.fields || []).filter((f) => NUMERIC_TYPES.has(f.dataTypeID)).map((f) => f.name);
  return res.rows.map((r) => {
    const o = { ...r };
    for (const k of Object.keys(o)) if (typeof o[k] === 'bigint') o[k] = Number(o[k]);
    for (const k of conv) if (typeof o[k] === 'string') o[k] = Number(o[k]);
    return o;
  });
}

function wrap(query) {
  const all = async (sql, ...p) => normalize(await query(toPg(sql), cleanParams(p)));
  return {
    all,
    get: async (sql, ...p) => (await all(sql, ...p))[0] || null,
    run: async (sql, ...p) => { const r = await query(toPg(sql), cleanParams(p)); return { changes: r.rowCount ?? r.affectedRows ?? 0 }; },
  };
}

export function dbDescription() {
  if (process.env.DATABASE_URL) {
    try { const u = new URL(process.env.DATABASE_URL); return `Postgres em ${u.hostname}`; } catch { return 'Postgres (DATABASE_URL)'; }
  }
  return `Postgres embutido (PGlite) em ${process.env.DB_PATH || 'data/pglite'}`;
}

/**
 * Abre o banco. `target`: DATABASE_URL (postgres://…), ou uma pasta para o PGlite, ou 'memory://' para testes.
 * Retorna { all, get, run, exec, tx, getMeta, setMeta, close, kind }.
 */
export async function openDb(target) {
  let api;
  if (/^postgres(ql)?:\/\//i.test(target)) {
    const { default: pg } = await import('pg');
    const ssl = /sslmode=disable/.test(target) || /@(localhost|127\.0\.0\.1)[:/]/.test(target) ? false : { rejectUnauthorized: false };
    const pool = new pg.Pool({
      connectionString: target.replace(/[?&]sslmode=[^&]*/g, ''), ssl,
      max: Number(process.env.PG_POOL_MAX) || 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 20000, application_name: 'radar-legislativo',
    });
    pool.on('error', (e) => console.error('[db] conexão ociosa caiu:', e.message));
    const base = wrap((sql, params) => pool.query(sql, params));
    api = {
      kind: 'pg',
      ...base,
      exec: (sql) => pool.query(sql),
      async tx(fn) {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const r = await fn(wrap((sql, params) => c.query(sql, params)));
          await c.query('COMMIT');
          return r;
        } catch (e) {
          try { await c.query('ROLLBACK'); } catch { /* conexão perdida */ }
          throw e;
        } finally { c.release(); }
      },
      close: () => pool.end(),
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = target && target !== 'memory://' ? target : undefined;
    if (dir) fs.mkdirSync(dir, { recursive: true });
    const lite = dir ? new PGlite(dir) : new PGlite();
    await lite.waitReady;
    const q = (sql, params) => lite.query(sql, params);
    const base = wrap(q);
    api = {
      kind: 'pglite',
      ...base,
      exec: (sql) => lite.exec(sql),
      tx: (fn) => lite.transaction((t) => fn(wrap((sql, params) => t.query(sql, params)))),
      close: () => lite.close(),
    };
  }
  // cria as tabelas (idempotente). Dois processos subindo juntos podem colidir; tenta de novo.
  for (let i = 0; ; i++) {
    try { await api.exec(SCHEMA); break; } catch (e) { if (i >= 2) throw e; await new Promise((r) => setTimeout(r, 500)); }
  }
  api.getMeta = async (k) => { const r = await api.get('SELECT value FROM meta WHERE key = ?', k); return r ? r.value : null; };
  api.setMeta = (k, v) => api.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', k, String(v));
  api.size = async () => { try { return (await api.get('SELECT pg_database_size(current_database()) AS n')).n; } catch { return null; } };
  return api;
}

/** Caminho/URL padrão do banco. */
export function defaultDbTarget() {
  return process.env.DATABASE_URL || process.env.DB_PATH || new URL('../data/pglite', import.meta.url).pathname;
}
