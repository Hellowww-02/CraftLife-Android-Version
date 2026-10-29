/**
 * M07 — K22: tiga jangkar versi harus sama.
 *
 * Acceptance criteria M07 menyebutnya eksplisit: `mobile/package.json version`
 * == `updater.py APP_VERSION` == `web/package.json version`. Kalau salah satu
 * naik sendiri, updater akan menawarkan pembaruan yang tidak cocok dengan
 * aplikasi yang terpasang.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import mobilePkg from "../package.json";

const here = dirname(fileURLToPath(import.meta.url));
// Proyek ini berada DI LUAR repo CraftLife (keputusan yang tercatat di
// README.md), jadi repo desktop dicapai lewat folder saudaranya, bukan "..".
const desktopRoot = resolve(here, "..", "..", "CraftLife");

function pyAppVersion(): string {
  const src = readFileSync(resolve(desktopRoot, "updater.py"), "utf8");
  const m = /APP_VERSION\s*=\s*["']([^"']+)["']/.exec(src);
  if (!m) throw new Error("APP_VERSION tidak ditemukan di updater.py");
  return m[1]!;
}

function webVersion(): string {
  const pkg = JSON.parse(
    readFileSync(resolve(desktopRoot, "web", "package.json"), "utf8"),
  ) as { version: string };
  return pkg.version;
}

function appJsonVersion(): string {
  const cfg = JSON.parse(readFileSync(resolve(here, "..", "app.json"), "utf8")) as {
    expo: { version: string };
  };
  return cfg.expo.version;
}

describe("K22 paritas versi", () => {
  it("mobile == updater.py == web", () => {
    const py = pyAppVersion();
    const web = webVersion();
    expect(mobilePkg.version).toBe(py);
    expect(web).toBe(py);
  });

  it("app.json ikut sama, karena itu yang dilihat Play Store", () => {
    expect(appJsonVersion()).toBe(mobilePkg.version);
  });

  it("bukan string kosong", () => {
    expect(mobilePkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
