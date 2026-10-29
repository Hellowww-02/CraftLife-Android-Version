/**
 * M14 rev-B — parity pin menu More ↔ desktop `NavBar._TABS`.
 *
 * Tiga jaminan:
 * 1. Urutan & label item desktop di menu Android SAMA PERSIS dengan
 *    `MainPyQt6.py` `_TABS` (minus `nav_home` yang sudah jadi tab bawah).
 * 2. Setiap tujuan menu benar-benar punya file rute (tidak ada menu mati).
 * 3. Setiap label punya terjemahan id + en yang tidak kosong.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  MORE_MENU_ALL,
  MORE_MENU_DESKTOP,
  MORE_MENU_EXTRAS,
} from "../src/features/menu";
import messages from "../src/i18n/messages.json";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..", "app");
const desktopRoot = resolve(here, "..", "..", "CraftLife");

function desktopTabLabelKeys(): string[] {
  const src = readFileSync(resolve(desktopRoot, "MainPyQt6.py"), "utf8");
  const m = /_TABS\s*=\s*\[(.*?)\]\s*_AUX_TABS/s.exec(src);
  if (!m) throw new Error("_TABS tidak ditemukan di MainPyQt6.py");
  return [...m[1]!.matchAll(/"(nav_[a-z_]+)"/g)].map((x) => x[1]!);
}

function routeFile(route: string): string {
  // "/more/pets" -> app/more/pets.tsx ; "/tasks" -> app/(tabs)/tasks.tsx
  if (route.startsWith("/more/")) return resolve(appRoot, "more", `${route.slice(6)}.tsx`);
  return resolve(appRoot, "(tabs)", `${route.slice(1)}.tsx`);
}

describe("menu More — parity desktop", () => {
  it("urutan & label = NavBar._TABS (minus nav_home)", () => {
    const desktop = desktopTabLabelKeys().filter((k) => k !== "nav_home");
    expect(MORE_MENU_DESKTOP.map((i) => i.labelKey)).toEqual(desktop);
  });

  it("setiap item menu punya file rute yang hidup", () => {
    for (const item of MORE_MENU_ALL) {
      expect(existsSync(routeFile(item.route)), `rute mati: ${item.route}`).toBe(true);
    }
  });

  it("setiap label punya terjemahan id + en", () => {
    for (const item of MORE_MENU_ALL) {
      const id = (messages.id as Record<string, string>)[item.labelKey];
      const en = (messages.en as Record<string, string>)[item.labelKey];
      expect(id, `id hilang: ${item.labelKey}`).toBeTruthy();
      expect(en, `en hilang: ${item.labelKey}`).toBeTruthy();
    }
  });

  it("ikon emoji terisi dan kunci unik", () => {
    const keys = MORE_MENU_ALL.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const item of MORE_MENU_ALL) {
      expect(item.icon.length, `ikon kosong: ${item.key}`).toBeGreaterThan(0);
    }
  });

  it("item ekstra ponsel tidak menggeser urutan desktop", () => {
    // Ekstra harus SETELAH seluruh item desktop (lihat MORE_MENU_ALL).
    const allKeys = MORE_MENU_ALL.map((i) => i.key);
    const lastDesktop = allKeys.indexOf(MORE_MENU_DESKTOP[MORE_MENU_DESKTOP.length - 1]!.key);
    const firstExtra = allKeys.indexOf(MORE_MENU_EXTRAS[0]!.key);
    expect(firstExtra).toBe(lastDesktop + 1);
  });
});
