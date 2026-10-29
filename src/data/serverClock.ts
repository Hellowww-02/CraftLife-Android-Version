/**
 * M08 — jam server untuk Android.
 *
 * Ini bukan detail kecil. Roadmap M08 menyebutnya eksplisit: tanggal WAJIB lewat
 * `serverClock`/`serverTime`, bukan jam perangkat — "kritis untuk streak".
 *
 * Alasannya konkret: reset harian dihitung backend dari zona aplikasi
 * (Asia/Jakarta). Kalau Android memakai `new Date()` perangkat, seorang
 * pengguna yang bepergian ke zona lain — atau yang jamnya meleset beberapa
 * menit di sekitar tengah malam — akan melihat streak yang berbeda dari
 * desktopnya. Dua klien yang tidak sepakat soal "hari ini" akan saling
 * menimpa data.
 *
 * Modelnya sama persis dengan web (`GameContext.tsx:452`): server mengirim
 * `epoch` (detik Unix) + `tzOffsetMin`, klien menyimpan kapan itu diterima, lalu
 * "sekarang" = epoch + waktu yang sudah berjalan sejak diterima.
 */

import { apiGet } from "@craftlife/core";
import { computeDateKey } from "@craftlife/core";

export interface ServerClockBase {
  /** Detik Unix menurut server. */
  epoch: number;
  /** `Date.now()` klien saat respons diterima. */
  receivedAt: number;
  /** Offset zona aplikasi dalam menit (Asia/Jakarta = 420). */
  tzOffsetMin: number;
}

interface ClockResponse {
  ok?: boolean;
  serverNow?: { epoch: number; tzOffsetMin?: number };
}

/**
 * Sumber jam. Bisa diganti di tes supaya tidak bergantung waktu nyata.
 */
export interface ClockSource {
  fetchBase(): Promise<ServerClockBase | null>;
  nowMs(): number;
}

export const liveClockSource: ClockSource = {
  async fetchBase() {
    try {
      const res = await apiGet<ClockResponse>("/api/clock");
      const now = res?.serverNow;
      if (!now || typeof now.epoch !== "number") return null;
      return {
        epoch: now.epoch,
        receivedAt: Date.now(),
        tzOffsetMin: now.tzOffsetMin ?? 0,
      };
    } catch {
      // Offline: tidak ada jam server. Mengembalikan null membuat pemanggil
      // sadar, bukan diam-diam memakai jam perangkat.
      return null;
    }
  },
  nowMs: () => Date.now(),
};

export class ServerClock {
  private base: ServerClockBase | null = null;

  constructor(private readonly source: ClockSource = liveClockSource) {}

  /** Ambil ulang dari server. Mengembalikan true kalau berhasil. */
  async refresh(): Promise<boolean> {
    const next = await this.source.fetchBase();
    if (!next) return false;
    this.base = next;
    return true;
  }

  /** Suntik base yang sudah ada (mis. dari respons /api/bootstrap). */
  setBase(base: ServerClockBase | null): void {
    this.base = base;
  }

  get isReady(): boolean {
    return this.base !== null;
  }

  /**
   * Tanggal wall-clock server sebagai `YYYY-MM-DD`, atau null kalau jam server
   * belum pernah diterima.
   *
   * Sengaja null, bukan fallback ke jam perangkat. Web melakukan hal yang sama
   * (`GameContext.tsx:469` mengembalikan `''` sampai base ada) — karena tanggal
   * yang salah lebih berbahaya daripada tidak ada tanggal: ia bisa memutus
   * streak yang sebenarnya masih hidup.
   */
  dateKey(): string | null {
    const base = this.base;
    if (!base) return null;
    return computeDateKey(base.epoch, base.receivedAt, base.tzOffsetMin, this.source.nowMs());
  }

  /** Date menurut zona aplikasi, untuk komponen tanggal React Native. */
  nowDate(): Date | null {
    const base = this.base;
    if (!base) return null;
    const ms = base.epoch * 1000 + (this.source.nowMs() - base.receivedAt) + base.tzOffsetMin * 60000;
    return new Date(ms);
  }
}
