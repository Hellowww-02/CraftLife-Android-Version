/**
 * M07 — cache lokal, alasan aplikasi tetap berguna tanpa jaringan.
 *
 * Acceptance criteria M07 menuntut urutan: login -> data muncul dari cache ->
 * sync jalan. Artinya layar TIDAK PERNAH menunggu jaringan untuk menampilkan
 * sesuatu. Yang ditampilkan lebih dulu adalah isi cache; sync memperbaruinya di
 * belakang.
 *
 * Ini juga yang membuat mode pesawat berfungsi penuh: perubahan ditulis ke
 * cache (langsung terlihat) DAN ke outbox (dikirim nanti).
 */

import * as SQLite from "expo-sqlite";

/** M11: plafon cache lokal. Cache adalah salinan, bukan arsip — yang asli
 * selalu bisa ditarik lagi dari server, jadi membuang baris terlama aman. */
export const MAX_CACHE_ROWS_PER_TYPE = 2000;
export const MAX_CACHE_TOTAL_ROWS = 10000;

export interface CacheRowMeta {
  entityType: string;
  entityLocalId: string;
  cachedAt: string;
  bytes: number;
}

/**
 * Pilih baris yang harus dibuang: per jenis entitas dulu (yang terlama di
 * atas plafon per-jenis), lalu global (terlama lintas jenis). Murni dan
 * deterministik supaya aturannya bisa diuji tanpa SQLite.
 */
export function selectCacheEvictions(
  rows: CacheRowMeta[],
  caps: { perType?: number; total?: number } = {},
): CacheRowMeta[] {
  const perType = caps.perType ?? MAX_CACHE_ROWS_PER_TYPE;
  const total = caps.total ?? MAX_CACHE_TOTAL_ROWS;
  const byAge = [...rows].sort((a, b) =>
    a.cachedAt === b.cachedAt
      ? a.entityLocalId.localeCompare(b.entityLocalId)
      : a.cachedAt < b.cachedAt
        ? -1
        : 1,
  );
  const evict = new Set<CacheRowMeta>();
  const counts = new Map<string, number>();
  for (const row of byAge) {
    counts.set(row.entityType, (counts.get(row.entityType) ?? 0) + 1);
  }
  // Jalan dari yang TERBARU: pertahankan `perType` termuda tiap jenis.
  const keptPerType = new Map<string, number>();
  const newestFirst = [...byAge].reverse();
  for (const row of newestFirst) {
    const kept = keptPerType.get(row.entityType) ?? 0;
    if (kept >= perType) {
      evict.add(row);
    } else {
      keptPerType.set(row.entityType, kept + 1);
    }
  }
  let remaining = byAge.length - evict.size;
  for (const row of byAge) {
    if (remaining <= total) break;
    if (!evict.has(row)) {
      evict.add(row);
      remaining -= 1;
    }
  }
  return byAge.filter((r) => evict.has(r));
}

export interface CachedEntity {
  entity_type: string;
  entity_local_id: string;
  payload: string;
  server_updated_at: string | null;
  cached_at: string;
}

export class EntityCache {
  constructor(private readonly db: SQLite.SQLiteDatabase) {}

  /** Simpan atau timpa satu baris. */
  async put(
    localUserId: number,
    entityType: string,
    entityLocalId: string,
    payload: unknown,
    serverUpdatedAt: string | null = null,
  ): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO entity_cache
         (local_user_id, entity_type, entity_local_id, payload, server_updated_at, cached_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(local_user_id, entity_type, entity_local_id) DO UPDATE SET
         payload = excluded.payload,
         server_updated_at = COALESCE(excluded.server_updated_at, entity_cache.server_updated_at),
         cached_at = excluded.cached_at`,
      [localUserId, entityType, entityLocalId, JSON.stringify(payload ?? {}), serverUpdatedAt],
    );
  }

  async putMany(
    localUserId: number,
    entityType: string,
    rows: Array<{ entityLocalId: string; payload: unknown; serverUpdatedAt?: string | null }>,
  ): Promise<number> {
    if (rows.length === 0) return 0;
    // Satu transaksi: 500 INSERT terpisah akan 500 kali fsync, dan itu terasa
    // sebagai jeda saat sinkronisasi awal.
    await this.db.withTransactionAsync(async () => {
      for (const row of rows) {
        await this.put(localUserId, entityType, row.entityLocalId, row.payload, row.serverUpdatedAt ?? null);
      }
    });
    return rows.length;
  }

  async list(localUserId: number, entityType: string): Promise<CachedEntity[]> {
    return this.db.getAllAsync<CachedEntity>(
      `SELECT entity_type, entity_local_id, payload, server_updated_at, cached_at
         FROM entity_cache
        WHERE local_user_id = ? AND entity_type = ?
        ORDER BY entity_local_id`,
      [localUserId, entityType],
    );
  }

  async get(
    localUserId: number,
    entityType: string,
    entityLocalId: string,
  ): Promise<CachedEntity | null> {
    const row = await this.db.getFirstAsync<CachedEntity>(
      `SELECT entity_type, entity_local_id, payload, server_updated_at, cached_at
         FROM entity_cache
        WHERE local_user_id = ? AND entity_type = ? AND entity_local_id = ?`,
      [localUserId, entityType, entityLocalId],
    );
    return row ?? null;
  }

  async remove(localUserId: number, entityType: string, entityLocalId: string): Promise<void> {
    await this.db.runAsync(
      `DELETE FROM entity_cache
        WHERE local_user_id = ? AND entity_type = ? AND entity_local_id = ?`,
      [localUserId, entityType, entityLocalId],
    );
  }

  /**
   * M11: terapkan plafon cache (lihat selectCacheEvictions). Mengembalikan
   * jumlah baris yang dibuang. Dipanggil setelah sinkronisasi besar supaya
   * pertumbuhan store lokal berhenti di batas yang jelas.
   */
  async prune(localUserId: number): Promise<number> {
    const rows = await this.db.getAllAsync<CacheRowMeta>(
      `SELECT entity_type AS entityType, entity_local_id AS entityLocalId,
              cached_at AS cachedAt, LENGTH(payload) AS bytes
         FROM entity_cache
        WHERE local_user_id = ?`,
      [localUserId],
    );
    const evictions = selectCacheEvictions(rows ?? []);
    for (const row of evictions) {
      await this.remove(localUserId, row.entityType, row.entityLocalId);
    }
    return evictions.length;
  }

  /**
   * Hapus data satu pengguna saja.
   *
   * Tidak pernah dipanggil tanpa local_user_id: menghapus cache lintas pengguna
   * akan membocorkan data antar akun di perangkat bersama.
   */
  async clearUser(localUserId: number): Promise<void> {
    await this.db.runAsync(`DELETE FROM entity_cache WHERE local_user_id = ?`, [localUserId]);
  }
}

export class Watermarks {
  constructor(private readonly db: SQLite.SQLiteDatabase) {}

  async get(localUserId: number, entityType: string): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ last_server_updated_at: string | null }>(
      `SELECT last_server_updated_at FROM sync_watermark
        WHERE local_user_id = ? AND entity_type = ?`,
      [localUserId, entityType],
    );
    return row?.last_server_updated_at ?? null;
  }

  /**
   * Maju, tidak pernah mundur.
   *
   * Kalau watermark mundur, baris lama akan diunduh ulang selamanya — persis
   * pemborosan egress yang ditutup di commit `81d08b4`. Karena itu pemajuannya
   * memakai MAX(), bukan penugasan langsung.
   */
  async advance(localUserId: number, entityType: string, serverUpdatedAt: string): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO sync_watermark (local_user_id, entity_type, last_server_updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(local_user_id, entity_type) DO UPDATE SET
         last_server_updated_at = MAX(sync_watermark.last_server_updated_at, excluded.last_server_updated_at)`,
      [localUserId, entityType, serverUpdatedAt],
    );
  }
}
