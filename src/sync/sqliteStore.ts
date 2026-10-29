/**
 * M07 — implementasi `OutboxStore` di atas expo-sqlite.
 *
 * Logika retry TIDAK ada di sini; itu milik `outbox.ts` dan sudah diuji. File
 * ini hanya menerjemahkan antarmuka menjadi SQL. Pembagian itu sengaja: kalau
 * aturan retry bercampur dengan SQL, satu-satunya cara mengujinya adalah lewat
 * emulator.
 *
 * SQL-nya sendiri diverifikasi di `CraftLife/tests/test_m07_android_sql.py`,
 * yang menjalankan DDL dan kueri yang sama di SQLite sungguhan.
 */

import * as SQLite from "expo-sqlite";

import type { OutboxRow, OutboxStore } from "./outbox";

export const DB_NAME = "craftlife.db";

/** Nama kolom persis seperti di SCHEMA_SQL — jangan diubah sepihak. */
const ROW_COLUMNS = [
  "id",
  "local_user_id",
  "entity_type",
  "entity_local_id",
  "operation",
  "payload",
  "status",
  "retry_count",
  "next_retry_at",
  "last_error",
  "created_at",
  "updated_at",
].join(", ");

export class SqliteOutboxStore implements OutboxStore {
  private constructor(private readonly db: SQLite.SQLiteDatabase) {}

  static async open(schemaSql: string): Promise<SqliteOutboxStore> {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    return SqliteOutboxStore.fromDatabase(db, schemaSql);
  }

  /**
   * Pakai koneksi yang SUDAH dibuka.
   *
   * `EntityCache` dan outbox hidup di berkas database yang sama. Membuka dua
   * handle berarti dua kali `PRAGMA`, dua kali eksekusi skema, dan dua jalur
   * yang bisa saling menunggu di WAL. Lewat sini keduanya berbagi satu koneksi.
   */
  static async fromDatabase(
    db: SQLite.SQLiteDatabase,
    schemaSql: string,
  ): Promise<SqliteOutboxStore> {
    // WAL: pembaca tidak memblokir penulis. Penting karena UI membaca cache
    // sementara drain sync menulis di latar.
    await db.execAsync("PRAGMA journal_mode = WAL;");
    await db.execAsync("PRAGMA foreign_keys = ON;");
    await db.execAsync(schemaSql);
    return new SqliteOutboxStore(db);
  }

  async insert(row: Omit<OutboxRow, "id">): Promise<number> {
    const result = await this.db.runAsync(
      `INSERT INTO sync_outbox
         (local_user_id, entity_type, entity_local_id, operation, payload,
          status, retry_count, next_retry_at, last_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.local_user_id,
        row.entity_type,
        row.entity_local_id,
        row.operation,
        row.payload,
        row.status,
        row.retry_count,
        row.next_retry_at,
        row.last_error,
        row.created_at,
        row.updated_at,
      ],
    );
    return Number(result.lastInsertRowId);
  }

  async update(id: number, patch: Partial<OutboxRow>): Promise<void> {
    // Kolom dibangun dari whitelist, bukan dari Object.keys(patch) langsung:
    // menyambung nama kolom dari input adalah jalan masuk injeksi SQL.
    const allowed = new Set(ROW_COLUMNS.split(", ").filter((c) => c !== "id"));
    const cols: string[] = [];
    const values: (string | number | null)[] = [];
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.has(key)) continue;
      cols.push(`${key} = ?`);
      values.push(value as string | number | null);
    }
    if (cols.length === 0) return;
    values.push(id);
    await this.db.runAsync(`UPDATE sync_outbox SET ${cols.join(", ")} WHERE id = ?`, values);
  }

  async findById(id: number): Promise<OutboxRow | null> {
    const row = await this.db.getFirstAsync<OutboxRow>(
      `SELECT ${ROW_COLUMNS} FROM sync_outbox WHERE id = ?`,
      [id],
    );
    return row ?? null;
  }

  async due(now: Date, limit: number): Promise<OutboxRow[]> {
    const cutoff = now.toISOString().slice(0, 19).replace("T", " ");
    // next_retry_at NULL berarti "siap sekarang". Perbandingan string aman
    // karena formatnya fixed-width 'YYYY-MM-DD HH:MM:SS' (UTC).
    return this.db.getAllAsync<OutboxRow>(
      `SELECT ${ROW_COLUMNS} FROM sync_outbox
        WHERE status IN ('pending', 'retry')
          AND (next_retry_at IS NULL OR next_retry_at <= ?)
        ORDER BY id
        LIMIT ?`,
      [cutoff, limit],
    );
  }

  async findPending(
    localUserId: number,
    entityType: string,
    entityLocalId: string | null,
  ): Promise<OutboxRow | null> {
    // entity_local_id boleh NULL, dan `= NULL` tidak pernah benar di SQL,
    // jadi pencocokannya memakai IS.
    const row = entityLocalId === null
      ? await this.db.getFirstAsync<OutboxRow>(
          `SELECT ${ROW_COLUMNS} FROM sync_outbox
            WHERE local_user_id = ? AND entity_type = ? AND entity_local_id IS NULL
              AND status IN ('pending', 'retry')
            ORDER BY id LIMIT 1`,
          [localUserId, entityType],
        )
      : await this.db.getFirstAsync<OutboxRow>(
          `SELECT ${ROW_COLUMNS} FROM sync_outbox
            WHERE local_user_id = ? AND entity_type = ? AND entity_local_id = ?
              AND status IN ('pending', 'retry')
            ORDER BY id LIMIT 1`,
          [localUserId, entityType, entityLocalId],
        );
    return row ?? null;
  }

  async list(localUserId: number, status: OutboxRow["status"]): Promise<OutboxRow[]> {
    return this.db.getAllAsync<OutboxRow>(
      `SELECT * FROM sync_outbox
        WHERE local_user_id = ? AND status = ?
        ORDER BY id`,
      [localUserId, status],
    );
  }

  async count(localUserId: number, status?: OutboxRow["status"]): Promise<number> {
    const row =
      status === undefined
        ? await this.db.getFirstAsync<{ n: number }>(
            `SELECT COUNT(*) AS n FROM sync_outbox WHERE local_user_id = ?`,
            [localUserId],
          )
        : await this.db.getFirstAsync<{ n: number }>(
            `SELECT COUNT(*) AS n FROM sync_outbox WHERE local_user_id = ? AND status = ?`,
            [localUserId, status],
          );
    return row?.n ?? 0;
  }
}
