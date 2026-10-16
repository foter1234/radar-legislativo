import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

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
  aprovada INTEGER,
  titulo TEXT,
  ementa TEXT,
  prop_id INTEGER,
  props_json TEXT,
  evento_id INTEGER,
  link TEXT,
  secreta INTEGER NOT NULL DEFAULT 0,
  n_sim INTEGER NOT NULL DEFAULT 0,
  n_nao INTEGER NOT NULL DEFAULT 0,
  n_abst INTEGER NOT NULL DEFAULT 0,
  n_obst INTEGER NOT NULL DEFAULT 0,
  n_aus INTEGER NOT NULL DEFAULT 0,
  n_outro INTEGER NOT NULL DEFAULT 0,
  n_total INTEGER NOT NULL DEFAULT 0,
  busca TEXT,
  complete INTEGER NOT NULL DEFAULT 0,
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
  alinhado INTEGER,
  PRIMARY KEY (casa, votacao_id, parlamentar_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS voto_parlamentar ON voto (casa, parlamentar_id, votacao_id);

CREATE TABLE IF NOT EXISTS orientacao (
  casa TEXT NOT NULL,
  votacao_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  cat TEXT,
  raw TEXT,
  PRIMARY KEY (casa, votacao_id, nome)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS sessao (
  casa TEXT NOT NULL,
  id INTEGER NOT NULL,
  data TEXT NOT NULL,
  hora TEXT,
  tipo TEXT,
  descricao TEXT,
  n_presentes INTEGER NOT NULL DEFAULT 0,
  complete INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (casa, id)
);
CREATE INDEX IF NOT EXISTS sessao_data ON sessao (casa, data);

CREATE TABLE IF NOT EXISTS presenca (
  casa TEXT NOT NULL,
  sessao_id INTEGER NOT NULL,
  parlamentar_id INTEGER NOT NULL,
  PRIMARY KEY (casa, sessao_id, parlamentar_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS presenca_parlamentar ON presenca (casa, parlamentar_id);

CREATE TABLE IF NOT EXISTS proposicao_status (
  id INTEGER PRIMARY KEY,
  situacao TEXT,
  cod_situacao TEXT,
  tramitacao TEXT,
  orgao TEXT,
  despacho TEXT,
  data_status TEXT,
  is_lei INTEGER NOT NULL DEFAULT 0,
  atualizado INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS http_cache (
  key TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  const cache = new Map();
  const prep = (sql) => {
    let st = cache.get(sql);
    if (!st) { st = db.prepare(sql); cache.set(sql, st); }
    return st;
  };
  const clean = (params) => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));
  return {
    raw: db,
    all: (sql, ...p) => prep(sql).all(...clean(p)).map((r) => ({ ...r })),
    get: (sql, ...p) => { const r = prep(sql).get(...clean(p)); return r ? { ...r } : null; },
    run: (sql, ...p) => prep(sql).run(...clean(p)),
    exec: (sql) => db.exec(sql),
    tx(fn) {
      db.exec('BEGIN');
      try { const r = fn(); db.exec('COMMIT'); return r; }
      catch (e) { try { db.exec('ROLLBACK'); } catch { /* já encerrada */ } throw e; }
    },
    getMeta: (k) => { const r = prep('SELECT value FROM meta WHERE key = ?').get(k); return r ? r.value : null; },
    setMeta: (k, v) => { prep('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v)); },
    close: () => db.close(),
  };
}
