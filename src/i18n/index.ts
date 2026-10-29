/**
 * M07 — katalog terjemahan, dibaca dari sumber yang sama dengan web.
 *
 * `@craftlife/core/i18n/messages.json` dihasilkan oleh `scripts/export_i18n.py`
 * dari `translations.py`. Android tidak boleh punya salinan sendiri: kalau ada,
 * satu string yang diperbaiki di desktop akan tetap salah di ponsel (P2).
 *
 * Sengaja dibuat kecil. Fallback-nya berjenjang: kunci di bahasa yang dipilih
 * -> kunci di bahasa Indonesia -> kunci itu sendiri. Mengembalikan nama kunci
 * lebih baik daripada string kosong, karena string kosong terlihat seperti
 * komponen rusak sementara nama kunci langsung menunjuk masalahnya.
 */

import raw from "@craftlife/core/i18n/messages.json";

export type Lang = "id" | "en";

const catalogue = raw as Record<Lang, Record<string, string>>;

/**
 * Ambil string katalog.
 *
 * `params` mengisi placeholder `{nama}` yang dipakai banyak kunci lama
 * (mis. `task_streak_days` = "🔥 {streak} hari"). Penanda markdown `**` ikut
 * dibuang karena React Native tidak merender markdown — di desktop string yang
 * sama dirender sebagai HTML, jadi bintangnya harus hilang di sini.
 */
export function translate(
  key: string,
  lang: Lang = "id",
  params?: Record<string, string | number>,
): string {
  const template = catalogue[lang]?.[key] ?? catalogue.id?.[key] ?? key;
  if (!params) return template;
  let out = template;
  for (const [name, value] of Object.entries(params)) {
    out = out.split(`{${name}}`).join(String(value));
  }
  return out.replace(/\*\*/g, "");
}

/** Untuk tes: memastikan katalog benar-benar termuat, bukan objek kosong. */
export function catalogueSize(lang: Lang): number {
  return Object.keys(catalogue[lang] ?? {}).length;
}

/**
 * Bahasa aktif sesi ini.
 *
 * Disimpan di modul, bukan di AsyncStorage, karena sumber kebenaran bahasa
 * adalah kolom `users.language` di server — layar Settings membacanya dari
 * `/api/me` lalu memanggil `setLang`. Menyimpan salinan lokal permanen akan
 * membuat ponsel dan desktop bisa berbeda bahasa secara diam-diam.
 */
let currentLang: Lang = "id";

export function setLang(next: Lang): void {
  currentLang = next;
}

export function getLang(): Lang {
  return currentLang;
}

/** Pintasan untuk layar: bahasa aktif sudah dipilihkan. */
export function t(key: string, params?: Record<string, string | number>): string {
  return translate(key, currentLang, params);
}
