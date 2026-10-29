/**
 * M07 — drain outbox + penjadwalan yang sadar baterai.
 *
 * Roadmap M07: "Sync status bar + WorkManager drain (battery-aware)".
 *
 * Yang penting di sini bukan sekadar "ada loop", tapi KAPAN loop itu boleh
 * jalan. Mengirim perubahan saat baterai rendah atau saat pengguna tidak
 * memegang ponsel adalah cara tercepat membuat aplikasi dibenci — dan di
 * Android, aplikasi yang boros baterai dibatasi sistem, jadi malah makin tidak
 * sinkron.
 *
 * Tiga gerbang sebelum drain, semuanya bisa diuji karena disuntikkan:
 *   1. jaringan benar-benar tersedia (bukan "tidak ada wifi")
 *   2. bukan mode hemat baterai
 *   3. baterai di atas ambang, kecuali pengisi daya terpasang
 */

import type { Outbox, OutboxRow } from "./outbox";
import { LOW_BATTERY_THRESHOLD, type SyncBlocked, type SyncProbe } from "./policy";

// Diekspor ulang supaya pemakai tidak perlu tahu di berkas mana tipe ini hidup.
export type { SyncBlocked };

/**
 * Transport ke server. Diuji dengan tiruan; implementasi nyata memakai
 * `@craftlife/core` API client (yang tokennya datang dari SecureStore lewat
 * adapter platform, bukan dari URL — R10).
 */
export interface SyncTransport {
  push(rows: OutboxRow[]): Promise<PushResult[]>;
  pull(localUserId: number, entityType: string, since: string | null): Promise<PullResult>;
}

export interface PushResult {
  id: number;
  ok: boolean;
  error?: string;
}

export interface PullResult {
  rows: Array<{ entityLocalId: string; payload: unknown; serverUpdatedAt: string | null }>;
  watermark: string | null;
}


export interface SyncOutcome {
  blocked: SyncBlocked;
  pushed: number;
  failed: number;
  pulled: number;
}

export interface SyncDeps {
  outbox: Outbox;
  transport: SyncTransport;
  probe: SyncProbe;
  localUserId: number;
  entityTypes: string[];
  /** Baca watermark terakhir untuk satu tipe entitas, atau null saat sync pertama. */
  readWatermark?: (entityType: string) => Promise<string | null>;
  onCacheRows?: (
    entityType: string,
    rows: PullResult["rows"],
  ) => Promise<void>;
  onWatermark?: (entityType: string, watermark: string) => Promise<void>;
}

export class SyncService {
  constructor(private readonly deps: SyncDeps) {}

  /**
   * Kenapa drain tidak boleh jalan sekarang, atau null kalau boleh.
   *
   * Urutannya sengaja: jaringan diperiksa lebih dulu karena itu penyebab
   * paling umum dan paling murah untuk dipastikan.
   */
  async blockedReason(): Promise<SyncBlocked> {
    const { probe } = this.deps;
    if (!(await probe.isOnline())) return "offline";
    if (await probe.isLowPowerMode()) return "low_power";

    const charging = await probe.isCharging();
    if (!charging) {
      const level = await probe.batteryLevel();
      if (level !== null && level < LOW_BATTERY_THRESHOLD) return "low_battery";
    }
    return null;
  }

  /**
   * Satu putaran: kirim yang tertunda, lalu tarik yang baru.
   *
   * Push didahulukan dari pull. Kalau dibalik, perubahan lokal bisa tertimpa
   * data server yang lebih tua sementara kiriman pengguna masih mengantre.
   */
  async drainOnce(batchSize = 25): Promise<SyncOutcome> {
    const blocked = await this.blockedReason();
    if (blocked) {
      return { blocked, pushed: 0, failed: 0, pulled: 0 };
    }

    const { outbox, transport, localUserId, entityTypes } = this.deps;
    let pushed = 0;
    let failed = 0;

    const due = await outbox.drain(batchSize);
    if (due.length > 0) {
      let results: PushResult[];
      try {
        results = await transport.push(due);
      } catch (err) {
        // Seluruh batch gagal (jaringan putus di tengah jalan). Tandai satu
        // per satu supaya aturan retry di outbox yang memutuskan nasibnya.
        const message = err instanceof Error ? err.message : String(err);
        for (const row of due) await outbox.markFailed(row.id, message);
        return { blocked: null, pushed: 0, failed: due.length, pulled: 0 };
      }
      for (const result of results) {
        if (result.ok) {
          await outbox.markDone(result.id);
          pushed++;
        } else {
          await outbox.markFailed(result.id, result.error ?? "push_failed");
          failed++;
        }
      }
    }

    let pulled = 0;
    for (const entityType of entityTypes) {
      // Tanpa watermark, pull akan mengunduh seluruh riwayat setiap putaran —
      // persis pemborosan egress yang ditutup di commit 81d08b4 pada desktop.
      const since = this.deps.readWatermark ? await this.deps.readWatermark(entityType) : null;
      const result = await transport.pull(localUserId, entityType, since);
      if (result.rows.length > 0 && this.deps.onCacheRows) {
        await this.deps.onCacheRows(entityType, result.rows);
        pulled += result.rows.length;
      }
      if (result.watermark && this.deps.onWatermark) {
        await this.deps.onWatermark(entityType, result.watermark);
      }
    }

    return { blocked: null, pushed, failed, pulled };
  }
}
