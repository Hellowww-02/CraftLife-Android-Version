/**
 * M07 — outbox Android yang meniru bentuk `sync_queue` desktop.
 *
 * Roadmap M07 meminta outbox "meniru bentuk sync_queue" (`status` ·
 * `retry_count` · `next_retry_at` · `last_error`). Yang ditiru bukan cuma nama
 * kolomnya, tapi ATURANNYA, supaya desktop dan Android tidak mengambil
 * keputusan berbeda tentang pekerjaan yang sama (P2).
 *
 * Dua aturan yang dibawa dari Python (database.py):
 *
 *   1. PERMANENT_SYNC_ERRORS + MAX_PERMANENT_RETRIES = 3. Pekerjaan yang memang
 *      tidak akan pernah berhasil (kuota habis, tidak diizinkan) mati setelah 3
 *      percobaan, bukan dicoba selamanya.
 *   2. Error JARINGAN dicoba ulang selamanya. Mematikan pekerjaan karena
 *      koneksi putus berarti membuang perubahan pengguna, dan P6 melarang itu.
 *
 * Modul ini sengaja tidak tahu apa-apa tentang SQLite. Penyimpanan disuntikkan
 * lewat `OutboxStore`, sehingga logika retry bisa diuji tanpa emulator.
 */

/** Nama kolom persis seperti `CREATE TABLE sync_queue` di database.py. */
export interface OutboxRow {
  id: number;
  local_user_id: number;
  entity_type: string;
  entity_local_id: string | null;
  operation: string;
  payload: string;
  status: "pending" | "retry" | "done" | "dead";
  retry_count: number;
  next_retry_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export const PERMANENT_SYNC_ERRORS: readonly string[] = [
  "402",
  "401",
  "403",
  "payment required",
  "quota",
  "unauthorized",
  "forbidden",
  "account_unavailable",
  "unsupported_table",
  "invalid_jwt",
  "jwt_expired",
];

export const MAX_PERMANENT_RETRIES = 3;

/**
 * Backoff eksponensial dengan batas atas 1 jam, sama seperti desktop.
 * retry_count 0 -> 30s, 1 -> 60s, 2 -> 120s, ... maksimum 3600s.
 */
export const BACKOFF_BASE_SECONDS = 30;
export const BACKOFF_MAX_SECONDS = 3600;

export function backoffSeconds(retryCount: number, seed = 0): number {
  const raw = BACKOFF_BASE_SECONDS * 2 ** Math.max(0, retryCount);
  const base = Math.min(raw, BACKOFF_MAX_SECONDS);
  // M11: jitter deterministik +0..20% (sama seperti desktop) supaya job
  // yang gagal bersamaan tidak menyerbu server di detik yang sama saat
  // jaringan pulih. Deterministik per (seed, retry) agar bisa diuji.
  const jitterPct =
    seed === 0 ? 0 : (Math.abs(seed) * 31 + Math.max(0, retryCount) * 17) % 21;
  return base + Math.floor((base * jitterPct) / 100);
}

/**
 * Cermin `is_permanent_sync_error()` di Python: pencocokan substring pada
 * pesan error, case-insensitive. Sengaja longgar karena bentuk pesan berbeda
 * antar versi pustaka — dan salah menilai error jaringan sebagai permanen
 * jauh lebih mahal daripada sebaliknya (kehilangan data vs coba lagi).
 */
export function isPermanentSyncError(message: string | null | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return PERMANENT_SYNC_ERRORS.some((needle) => lower.includes(needle));
}

/** Jam yang bisa disuntikkan, supaya tes tidak bergantung waktu nyata. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** "2026-10-13 04:05:06" — format yang dipakai SQLite `datetime('now')`. */
export function toSqliteUtc(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function fromSqliteUtc(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value.replace(" ", "T") + "Z");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Antarmuka penyimpanan. Implementasi nyata memakai expo-sqlite
 * (src/sync/sqliteStore.ts); tes memakai array di memori.
 */
export interface OutboxStore {
  insert(row: Omit<OutboxRow, "id">): Promise<number>;
  update(id: number, patch: Partial<OutboxRow>): Promise<void>;
  /** Pekerjaan pending/retry yang sudah jatuh tempo, urut id. */
  due(now: Date, limit: number): Promise<OutboxRow[]>;
  /** Pekerjaan pending untuk entitas yang sama — untuk menumpuk, bukan menduplikasi. */
  findPending(
    localUserId: number,
    entityType: string,
    entityLocalId: string | null,
  ): Promise<OutboxRow | null>;
  count(localUserId: number, status?: OutboxRow["status"]): Promise<number>;
  /** Semua baris satu status untuk pengguna — untuk inspeksi & pemulihan. */
  list(localUserId: number, status: OutboxRow["status"]): Promise<OutboxRow[]>;
}

export interface EnqueueInput {
  localUserId: number;
  entityType: string;
  entityLocalId?: string | null;
  operation: string;
  payload?: unknown;
}

export class Outbox {
  constructor(
    private readonly store: OutboxStore,
    private readonly clock: Clock = systemClock,
  ) {}

  /**
   * Antre perubahan. Kalau sudah ada pekerjaan pending untuk entitas yang sama,
   * payload-nya DITIMPA dan pekerjaan itu dipakai lagi — meniru
   * database.py:15879. Tanpa ini, mengedit satu baris 50 kali akan mengirim
   * 50 permintaan, dan itu persis pemborosan yang ditutup di commit egress.
   */
  async enqueue(input: EnqueueInput): Promise<number> {
    const now = this.clock.now();
    const stamp = toSqliteUtc(now);
    const entityLocalId = input.entityLocalId ?? null;
    const payload = JSON.stringify(input.payload ?? {});

    const existing = await this.store.findPending(
      input.localUserId,
      input.entityType,
      entityLocalId,
    );
    if (existing) {
      // `operation` ikut ditimpa, dan ini bukan detail. Tanpa itu, membuat
      // sebuah baris lalu menghapusnya saat offline akan tetap mengirim
      // "upsert" — dan baris yang sudah dihapus pengguna hidup lagi di server
      // begitu jaringan kembali. Operasi terakhir pada satu entitas selalu
      // menang: upsert lalu delete -> delete; delete lalu upsert -> upsert.
      await this.store.update(existing.id, {
        operation: input.operation,
        payload,
        status: "pending",
        next_retry_at: null,
        last_error: null,
        updated_at: stamp,
      });
      return existing.id;
    }

    return this.store.insert({
      local_user_id: input.localUserId,
      entity_type: input.entityType,
      entity_local_id: entityLocalId,
      operation: input.operation,
      payload,
      status: "pending",
      retry_count: 0,
      next_retry_at: null,
      last_error: null,
      created_at: stamp,
      updated_at: stamp,
    });
  }

  /** Ambil pekerjaan yang jatuh tempo. `limit` menjaga drain tetap hemat baterai. */
  async drain(limit = 25): Promise<OutboxRow[]> {
    return this.store.due(this.clock.now(), limit);
  }

  async markDone(id: number): Promise<void> {
    await this.store.update(id, {
      status: "done",
      next_retry_at: null,
      last_error: null,
      updated_at: toSqliteUtc(this.clock.now()),
    });
  }

  /**
   * Keputusan inti: coba lagi, atau mati?
   *
   * Error permanen -> mati setelah MAX_PERMANENT_RETRIES.
   * Error jaringan -> coba lagi selamanya (P6: jangan pernah buang data).
   */
  async markFailed(id: number, error: string): Promise<"retry" | "dead"> {
    const now = this.clock.now();
    const row = await this.byId(id);
    if (!row) return "dead";

    const permanent = isPermanentSyncError(error);
    const retryCount = row.retry_count + 1;

    if (permanent && retryCount >= MAX_PERMANENT_RETRIES) {
      await this.store.update(id, {
        status: "dead",
        retry_count: retryCount,
        last_error: error,
        next_retry_at: null,
        updated_at: toSqliteUtc(now),
      });
      return "dead";
    }

    const delay = permanent
      ? BACKOFF_BASE_SECONDS
      : backoffSeconds(row.retry_count, row.id);
    const next = new Date(now.getTime() + delay * 1000);
    await this.store.update(id, {
      status: "retry",
      retry_count: retryCount,
      last_error: error,
      next_retry_at: toSqliteUtc(next),
      updated_at: toSqliteUtc(now),
    });
    return "retry";
  }

  async pendingCount(localUserId: number): Promise<number> {
    return this.store.count(localUserId, "pending");
  }

  /**
   * M11 recovery: hidupkan lagi semua job mati sebagai pending.
   *
   * Job mati bukan data sampah — ia perubahan pengguna yang gagal permanen
   * menurut klasifikasi error saat itu (mis. server sempat membatasi).
   * Mengantrekan ulang adalah keputusan pengguna lewat UI, bukan otomatis,
   * supaya penyebab yang masih ada tidak berputar tanpa terlihat.
   */
  async requeueDead(localUserId: number): Promise<number> {
    const dead = await this.store.list(localUserId, "dead");
    for (const row of dead) {
      await this.store.update(row.id, {
        status: "pending",
        retry_count: 0,
        next_retry_at: null,
        last_error: null,
        updated_at: toSqliteUtc(this.clock.now()),
      });
    }
    return dead.length;
  }

  async deadJobs(localUserId: number): Promise<OutboxRow[]> {
    return this.store.list(localUserId, "dead");
  }

  async deadCount(localUserId: number): Promise<number> {
    return this.store.count(localUserId, "dead");
  }

  private async byId(id: number): Promise<OutboxRow | null> {
    // due() tidak bisa dipakai di sini karena baris yang gagal belum tentu
    // jatuh tempo. Penyimpanan menyediakan pencarian langsung.
    return (this.store as OutboxStore & { findById?: (id: number) => Promise<OutboxRow | null> })
      .findById?.(id) ?? null;
  }
}
