/**
 * M08 — penjaga kunci i18n.
 *
 * Tes ini ada karena cacat nyata yang pernah lolos di M07: sebuah `labelKey`
 * menunjuk kunci yang tidak pernah ada di `translations.py` ("pomo_focus").
 * Typecheck tidak bisa menangkapnya karena nilainya string biasa, dan 30 tes
 * lain tetap hijau. Gejalanya baru terlihat saat aplikasi dijalankan: pengguna
 * melihat nama kunci mentah, bukan kalimat.
 *
 * Jadi: setiap kunci yang ditulis sebagai literal di `src/` dan `app/`
 * dipindai dan harus benar-benar ada di katalog.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { translate } from "../src/i18n";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Pola yang dipindai. Sengaja hanya literal — `t(rank.nameKey)` tidak bisa
 * diperiksa statis dan memang sudah dijaga oleh tes modelnya sendiri.
 */
const PATTERNS: RegExp[] = [
  /\bt\(\s*"([A-Za-z0-9_]+)"/g,
  /\btranslate\(\s*"([A-Za-z0-9_]+)"/g,
  /\blabelKey:\s*"([A-Za-z0-9_]+)"/g,
  /"((?:insights|dashboard|mobile)_[A-Za-z0-9_]+)"/g,
];

function collectKeys(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const files = [...walk(join(root, "src")), ...walk(join(root, "app"))];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const pattern of PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const key = match[1]!;
        const list = found.get(key) ?? [];
        list.push(file.slice(root.length + 1));
        found.set(key, list);
      }
    }
  }
  return found;
}

describe("kunci i18n yang dipakai kode Android", () => {
  const keys = collectKeys();

  it("pemindaian benar-benar menemukan kunci (bukan nol kosong)", () => {
    // Kalau pola regex-nya rusak, tes ini akan lolos tanpa memeriksa apa pun.
    expect(keys.size).toBeGreaterThan(40);
    expect(keys.has("dialog_save")).toBe(true);
  });

  it("setiap kunci ada di translations.py", () => {
    const missing = [...keys.entries()]
      .filter(([key]) => translate(key, "id") === key)
      .map(([key, files]) => `${key}  <-  ${[...new Set(files)].join(", ")}`)
      .sort();
    expect(missing, `kunci i18n tidak ada di translations.py:\n${missing.join("\n")}`).toEqual([]);
  });

  it("kunci M08 yang baru ikut ada di kedua bahasa", () => {
    const added = [
      "mobile_quest_no_due",
      "mobile_quest_overdue",
      "mobile_saved_offline",
      "mobile_offline_banner",
      "mobile_settings_appearance",
      "mobile_settings_account",
      "mobile_settings_sync",
      "mobile_settings_about",
      "mobile_repeat_everyday",
      "mobile_today_progress",
      "mobile_long_press_hint",
    ];
    for (const key of added) {
      expect(translate(key, "id"), `id hilang: ${key}`).not.toBe(key);
      expect(translate(key, "en"), `en hilang: ${key}`).not.toBe(key);
    }
  });
});
