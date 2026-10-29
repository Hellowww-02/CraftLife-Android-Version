/**
 * M07 — skema SQLite lokal Android.
 *
 * File ini adalah SATU-SATUNYA tempat skema didefinisikan, dan itu bukan
 * sekadar kerapian: `CraftLife/tests/test_m07_android_sql.py` mengekstrak
 * string di bawah, menjalankannya di SQLite sungguhan (stdlib `sqlite3`), lalu
 * menguji kueri utamanya. Jadi SQL yang dikirim ke perangkat adalah SQL yang
 * sudah terbukti jalan — bukan SQL yang cuma dibaca mata.
 *
 * Kolom `sync_outbox` meniru `sync_queue` di desktop (database.py) supaya dua
 * klien tidak berbeda pendapat tentang pekerjaan yang sama.
 */

/** DDL, dijalankan berurutan saat basis data dibuka. Idempoten. */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sync_outbox(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  local_user_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_local_id TEXT,
  operation TEXT NOT NULL,
  payload TEXT DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  next_retry_at TEXT,
  last_error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_outbox_due
  ON sync_outbox(status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_outbox_entity
  ON sync_outbox(local_user_id, entity_type, entity_local_id, status);

CREATE TABLE IF NOT EXISTS entity_cache(
  local_user_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_local_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  server_updated_at TEXT,
  cached_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY(local_user_id, entity_type, entity_local_id)
);

CREATE TABLE IF NOT EXISTS sync_watermark(
  local_user_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  last_server_updated_at TEXT,
  PRIMARY KEY(local_user_id, entity_type)
);

CREATE TABLE IF NOT EXISTS sync_run(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  local_user_id INTEGER NOT NULL,
  started_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT,
  pushed INTEGER DEFAULT 0,
  pulled INTEGER DEFAULT 0,
  outcome TEXT DEFAULT 'running',
  detail TEXT
);
`;

/** Tabel yang dibuat, dipakai tes untuk memastikan tidak ada yang hilang. */
export const SCHEMA_TABLES = [
  "sync_outbox",
  "entity_cache",
  "sync_watermark",
  "sync_run",
] as const;
