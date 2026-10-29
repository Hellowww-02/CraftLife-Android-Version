/**
 * M07 — menyuntikkan adapter platform ke API client bersama.
 *
 * `@craftlife/core/api/client.ts` lahir untuk browser: `apiBase()` membaca
 * `window.location` dan `import.meta.env`, `authToken()` membaca
 * `sessionStorage`. Tidak satu pun ada di React Native — dan `window.location`
 * dibaca di baris pertama, jadi tanpa adapter aplikasi akan crash sebelum
 * sempat fallback.
 *
 * Yang TIDAK dilakukan: menyalin client.ts menjadi versi Android. Dua salinan
 * berarti kontrak API bisa menyimpang diam-diam (P2). Yang dilakukan adalah
 * memasang adapter di titik suntik yang memang disediakan core.
 *
 * Token datang dari memori (K17), bukan dari penyimpanan dan bukan dari URL.
 */

import { setApiPlatformAdapter } from "@craftlife/core";

import { getAccessToken } from "../auth/session";

let configured = false;

/**
 * Panggil sekali, sebelum permintaan API pertama.
 *
 * Idempoten: memasang adapter dua kali tidak berbahaya, tapi `configured`
 * menjaga agar tidak ada kejutan kalau fungsi ini terpanggil dari dua tempat.
 */
export function configureApiAdapter(apiBaseUrl: string): void {
  if (configured) return;
  const base = apiBaseUrl.replace(/\/$/, "");
  setApiPlatformAdapter({
    apiBase: () => base,
    // Dibaca saat pemanggilan, bukan di sini: token diperbarui setelah refresh,
    // dan adapter harus selalu mengembalikan nilai terkini.
    authToken: () => getAccessToken(),
  });
  configured = true;
}

/** Untuk tes. */
export function __resetAdapterForTests(): void {
  setApiPlatformAdapter(null);
  configured = false;
}
