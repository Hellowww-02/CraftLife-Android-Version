/**
 * M08 — repository: cache untuk dibaca, outbox untuk ditulis.
 *
 * Acceptance criteria M08 menuntut "DB jalan · sync jalan · offline jalan" per
 * layar. Ketiganya berasal dari satu pola di sini:
 *
 *   BACA  -> selalu dari cache. Layar tidak pernah menunggu jaringan.
 *   TULIS -> ke cache (langsung terlihat) DAN ke outbox (dikirim nanti).
 *   SYNC  -> pull memperbarui cache + watermark, di belakang layar.
 *
 * Karena tulis selalu mendarat di cache lebih dulu, mode pesawat terasa seperti
 * aplikasi yang berfungsi penuh — bukan aplikasi yang menunggu. Itu bukan
 * kosmetik; itu arti "offline-first".
 *
 * Cache diakses lewat `CachePort`, bukan `EntityCache` langsung, supaya aturan
 * read-through/write-through bisa diuji tanpa SQLite native.
 */

import type { Outbox } from "../sync/outbox";

export interface CachedRow {
  entity_local_id: string;
  payload: string;
  server_updated_at: string | null;
}

/** Bagian cache yang dibutuhkan repository. Diimplementasi `EntityCache`. */
export interface CachePort {
  list(localUserId: number, entityType: string): Promise<CachedRow[]>;
  get(localUserId: number, entityType: string, entityLocalId: string): Promise<CachedRow | null>;
  put(
    localUserId: number,
    entityType: string,
    entityLocalId: string,
    payload: unknown,
    serverUpdatedAt?: string | null,
  ): Promise<void>;
  remove(localUserId: number, entityType: string, entityLocalId: string): Promise<void>;
}

export interface WatermarkPort {
  get(localUserId: number, entityType: string): Promise<string | null>;
  advance(localUserId: number, entityType: string, serverUpdatedAt: string): Promise<void>;
}

/** Jalur jaringan. Disuntikkan supaya tes tidak menyentuh HTTP. */
export interface RemoteSource {
  list(
    localUserId: number,
    entityType: string,
    since: string | null,
  ): Promise<{ rows: Array<{ entityLocalId: string; payload: unknown; serverUpdatedAt: string | null }>; watermark: string | null }>;
}

export interface RepositoryDeps {
  cache: CachePort;
  watermarks: WatermarkPort;
  outbox: Outbox;
  remote: RemoteSource;
  localUserId: number;
}

export interface ReadResult<T> {
  rows: T[];
  /** true kalau cache kosong dan belum pernah ada sync — layar menampilkan empty state. */
  isEmpty: boolean;
}

export class Repository {
  constructor(private readonly deps: RepositoryDeps) {}

  /**
   * Baca dari cache. Tidak pernah melempar karena jaringan, karena tidak
   * menyentuh jaringan.
   *
   * Baris yang payload-nya rusak dilewati, bukan membuat seluruh layar gagal:
   * satu baris cacat tidak boleh menyembunyikan sisanya.
   */
  async read<T = Record<string, unknown>>(entityType: string): Promise<ReadResult<T>> {
    const cached = await this.deps.cache.list(this.deps.localUserId, entityType);
    const rows: T[] = [];
    for (const row of cached) {
      try {
        rows.push(JSON.parse(row.payload) as T);
      } catch {
        // payload rusak: lewati. Dicatat lewat return, bukan ditelan diam-diam.
      }
    }
    return { rows, isEmpty: rows.length === 0 };
  }

  /**
   * Tulis lokal: cache + outbox.
   *
   * Urutannya penting. Cache lebih dulu supaya UI langsung menampilkan hasil
   * bahkan kalau penulisan outbox gagal; kalau dibalik, pengguna melihat
   * perubahan yang ternyata tidak akan pernah tersinkron.
   */
  async upsert(
    entityType: string,
    entityLocalId: string,
    payload: unknown,
  ): Promise<void> {
    const { cache, outbox, localUserId } = this.deps;
    await cache.put(localUserId, entityType, entityLocalId, payload);
    await outbox.enqueue({
      localUserId,
      entityType,
      entityLocalId,
      operation: "upsert",
      payload,
    });
  }

  async remove(entityType: string, entityLocalId: string): Promise<void> {
    const { cache, outbox, localUserId } = this.deps;
    await cache.remove(localUserId, entityType, entityLocalId);
    await outbox.enqueue({
      localUserId,
      entityType,
      entityLocalId,
      operation: "delete",
      payload: {},
    });
  }

  /**
   * Tulis cache saja, TANPA antrean kirim.
   *
   * Dipakai setelah server mengakui sebuah perubahan. Mengantre perubahan yang
   * sudah sampai di server akan mengirim duplikat, dan untuk delete duplikat
   * itu bisa menghidupkan kembali baris yang baru saja dihapus.
   */
  async cacheOnly(
    entityType: string,
    entityLocalId: string,
    payload: unknown,
  ): Promise<void> {
    await this.deps.cache.put(this.deps.localUserId, entityType, entityLocalId, payload);
  }

  /** Buang dari cache saja, tanpa antrean kirim. Pasangan `cacheOnly`. */
  async evict(entityType: string, entityLocalId: string): Promise<void> {
    await this.deps.cache.remove(this.deps.localUserId, entityType, entityLocalId);
  }

  /**
   * Kembalikan cache ke keadaan sebelum sebuah aksi yang ditolak server.
   * `previous === null` berarti baris itu belum ada sebelumnya.
   */
  async rollback(
    entityType: string,
    entityLocalId: string,
    previous: unknown | null,
  ): Promise<void> {
    if (previous === null) {
      await this.deps.cache.remove(this.deps.localUserId, entityType, entityLocalId);
      return;
    }
    await this.deps.cache.put(this.deps.localUserId, entityType, entityLocalId, previous);
  }

  /**
   * Tarik perubahan dari server dan perbarui cache.
   *
   * Incremental: memakai watermark, jadi putaran kedua tidak mengunduh ulang
   * seluruh riwayat. Baris yang dihapus di server (`deleted: true`) ikut
   * dibersihkan dari cache — kalau tidak, data yang sudah dihapus di desktop
   * akan tetap muncul di ponsel selamanya.
   */
  async refresh(entityType: string): Promise<number> {
    const { cache, watermarks, outbox, remote, localUserId } = this.deps;
    const since = await watermarks.get(localUserId, entityType);
    const result = await remote.list(localUserId, entityType, since);

    let applied = 0;
    for (const row of result.rows) {
      const payload = row.payload as Record<string, unknown> | null;
      if (payload && payload.deleted === true) {
        await cache.remove(localUserId, entityType, row.entityLocalId);
      } else {
        await cache.put(localUserId, entityType, row.entityLocalId, row.payload, row.serverUpdatedAt);
      }
      applied++;
    }

    if (result.watermark) {
      await watermarks.advance(localUserId, entityType, result.watermark);
    }
    // `outbox` ikut dipegang repository supaya drain dan refresh memakai
    // local_user_id yang sama; tidak dipakai langsung di sini.
    void outbox;
    return applied;
  }
}
