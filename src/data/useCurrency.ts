/**
 * M08 wave 3 — mata uang pengguna, diambil sekali per layar yang butuh uang.
 *
 * Dipakai Economy (wave 2) dan Supplies (wave 3). Sebelumnya Economy
 * mengambilnya sendiri; begitu layar kedua membutuhkannya, salinan kedua
 * hanya soal waktu — dan dua salinan berarti dua tempat yang bisa lupa
 * memakai fallback IDR.
 *
 * Fallback-nya "IDR" dan itu bukan tebakan sembarangan: database memang
 * menyimpan IDR, jadi saat mata uang belum diketahui menampilkan IDR adalah
 * satu-satunya jawaban yang pasti benar.
 */

import { useEffect, useState } from "react";

import { toUserSummary } from "../features/dashboard/model";
import { loadRemote } from "./taskActions";
import type { AppData } from "./appData";

export const FALLBACK_CURRENCY = "IDR";

export function useCurrency(app: AppData | null): string {
  const [currency, setCurrency] = useState(FALLBACK_CURRENCY);

  useEffect(() => {
    let alive = true;
    if (!app) return;
    void (async () => {
      try {
        const me = await loadRemote<{ user?: unknown }>(app.api, "/api/me");
        const summary = me.data ? toUserSummary(me.data.user) : null;
        const value = summary?.currency?.trim();
        if (alive && value) setCurrency(value);
      } catch {
        // Gagal memuat mata uang tidak boleh mematikan layar; tetap IDR.
      }
    })();
    return () => {
      alive = false;
    };
  }, [app]);

  return currency;
}
