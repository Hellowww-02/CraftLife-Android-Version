/**
 * M07 — tema Android benar-benar berasal dari token M06.
 *
 * Yang diuji di sini adalah hal yang paling mudah rusak tanpa terlihat: kalau
 * ada satu nilai warna yang di-hardcode di sisi Android, web dan ponsel akan
 * berbeda dan tidak ada tes yang menyadarinya. Jadi tes-tes ini membandingkan
 * keluaran konversi langsung terhadap tokens.json, bukan terhadap angka tetap.
 */

import { describe, expect, it } from "vitest";

import raw from "@craftlife/core/design/tokens.json";

import {
  DEFAULT_THEME_KEY,
  cubicBezier,
  durationToMs,
  getTheme,
  lengthToDp,
  MIN_TOUCH_TARGET_DP,
  remToDp,
  scale,
  themes,
  themeKeys,
  TOKEN_VERSION,
} from "../src/theme/tokens";

const tokens = raw as {
  version: string;
  themes: Record<string, Record<string, string>>;
  structural: Record<string, string>;
};

describe("konversi satuan", () => {
  it("rem -> dp memakai 16 sebagai pengali", () => {
    expect(remToDp(0.625)).toBe(10);
    expect(remToDp(1.625)).toBe(26);
  });

  it("skala radius M06 menjadi 10/14/18/22/26 dp", () => {
    expect(scale.radius).toEqual({ sm: 10, md: 14, lg: 18, xl: 22, "2xl": 26 });
  });

  it("langkah radius seragam +4dp", () => {
    const steps = [scale.radius.sm, scale.radius.md, scale.radius.lg, scale.radius.xl, scale.radius["2xl"]];
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]! - steps[i - 1]!).toBe(4);
    }
  });

  it("durasi ms dan detik keduanya terbaca", () => {
    expect(durationToMs("140ms")).toBe(140);
    expect(durationToMs("1.9s")).toBe(1900);
    expect(scale.motion.fast).toBe(140);
    expect(scale.motion.xslow).toBe(700);
  });

  it("cubic-bezier menjadi 4 angka untuk PathInterpolator", () => {
    expect(cubicBezier("cubic-bezier(0.22, 1, 0.36, 1)")).toEqual([0.22, 1, 0.36, 1]);
    expect(cubicBezier("ease-in-out")).toBeNull();
    expect(scale.motion.ease).toEqual([0.22, 1, 0.36, 1]);
  });

  it("target sentuh minimum 48dp ditegakkan", () => {
    expect(MIN_TOUCH_TARGET_DP).toBe(48);
  });
});

describe("12 tema dari tokens.json", () => {
  it("jumlahnya sama dengan sumber", () => {
    expect(themeKeys).toHaveLength(12);
    expect(themeKeys.sort()).toEqual(Object.keys(tokens.themes).sort());
  });

  it("setiap warna diambil dari tokens.json, bukan hardcode", () => {
    for (const key of themeKeys) {
      const source = tokens.themes[key]!;
      const colors = themes[key]!.colors;
      expect(colors.primary).toBe(source.primary);
      expect(colors.bg).toBe(source.bg);
      expect(colors.text).toBe(source.text);
      // snake_case db -> camelCase Android, nilainya tidak boleh berubah
      expect(colors.onPrimary).toBe(source.on_primary);
      expect(colors.onAccent).toBe(source.on_accent);
      expect(colors.label).toBe(source.label);
    }
  });

  it("versi token sama dengan versi aplikasi", () => {
    expect(TOKEN_VERSION).toBe(tokens.version);
  });

  it("tema default adalah modern_dark, sama seperti :root di web", () => {
    expect(DEFAULT_THEME_KEY).toBe("modern_dark");
    expect(getTheme(null).key).toBe("modern_dark");
    expect(getTheme("tema_tidak_ada").key).toBe("modern_dark");
  });

  it("tidak ada warna yang kosong", () => {
    for (const key of themeKeys) {
      for (const [field, value] of Object.entries(themes[key]!.colors)) {
        expect(value, `${key}.${field}`).toBeTruthy();
      }
    }
  });
});

describe("panjang yang tidak dikenal", () => {
  it("mengembalikan 0, bukan NaN", () => {
    expect(lengthToDp("auto")).toBe(0);
    expect(durationToMs("")).toBe(0);
  });
});
