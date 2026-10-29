/**
 * M07 — rute dan label tidak boleh yatim.
 *
 * Tes ini ada karena dua cacat nyata sempat lolos: sebuah `labelKey` menunjuk
 * kunci i18n yang tidak pernah ada ("pomo_focus"), dan 19 rute `/more/*`
 * dideklarasikan tanpa satu pun file layar - jadi setiap deep link ke sana akan
 * 404. Keduanya tidak terlihat oleh typecheck karena nilainya string biasa.
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { catalogueSize, translate } from "../src/i18n";
import { MORE_GROUPS, MORE_ROUTES } from "../src/nav/moreGroups";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "..", "app");

describe("katalog i18n", () => {
  it("termuat dari craftlife-core, bukan salinan lokal", () => {
    expect(catalogueSize("id")).toBeGreaterThan(4000);
    expect(catalogueSize("en")).toBe(catalogueSize("id"));
  });

  it("menerjemahkan kunci yang ada", () => {
    expect(translate("nav_pomodoro", "id")).toBe("Pomodoro");
  });

  it("kunci yang tidak dikenal dikembalikan apa adanya, bukan string kosong", () => {
    expect(translate("kunci_yang_tidak_ada", "id")).toBe("kunci_yang_tidak_ada");
  });
});

describe("label More", () => {
  const labels = MORE_GROUPS.flatMap((g) => [g.labelKey, ...g.items.map((i) => i.labelKey)]);

  it("ada lebih dari 20 label yang diperiksa", () => {
    expect(labels.length).toBeGreaterThan(20);
  });

  it("setiap labelKey benar-benar ada di katalog i18n", () => {
    const missing = labels.filter((k) => translate(k) === k);
    expect(missing, `labelKey tanpa entri di translations.py: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("rute More", () => {
  it("setiap rute punya file layar yang bisa di-resolve expo-router", () => {
    const missing = MORE_ROUTES.filter((route) => {
      // "/more/settings" -> app/more/settings.tsx
      const file = resolve(appDir, `${route.replace(/^\//, "")}.tsx`);
      return !existsSync(file);
    });
    expect(missing, `rute tanpa layar (deep link akan 404): ${missing.join(", ")}`).toEqual([]);
  });

  it("tidak ada rute duplikat", () => {
    expect(new Set(MORE_ROUTES).size).toBe(MORE_ROUTES.length);
  });

  it("kelima tab bawah juga punya layarnya", () => {
    for (const tab of ["index", "tasks", "tracker", "social", "more"]) {
      expect(existsSync(resolve(appDir, "(tabs)", `${tab}.tsx`)), `tab ${tab}`).toBe(true);
    }
  });
});
