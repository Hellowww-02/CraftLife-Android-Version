/**
 * M13 — aksesibilitas terukur (bukan klaim):
 * 1. Kontras teks ≥ 4.5:1 (WCAG AA) untuk pasangan warna yang benar-benar
 *    dipakai membaca, di SEMUA tema.
 * 2. Target sentuh primitif ≥ 48dp — dicek dari konstanta + sumber primitif
 *    (perbaikan M13: Chip dulu 40dp).
 * TalkBack & "Remove animations" adalah pemeriksaan perangkat — dicatat
 * di QA_M13.md sebagai menunggu bukti pengguna, tidak dikarang di sini.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MIN_TOUCH_TARGET_DP, themeKeys, themes } from "../src/theme/tokens";

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(value: string): Rgb {
  const v = value.trim();
  const hex = v.replace("#", "");
  if (/^[0-9a-fA-F]+$/.test(hex) && (hex.length === 3 || hex.length === 6)) {
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }
  const m = v.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/);
  if (m) {
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] ? Number(m[4]) : 1 };
  }
  throw new Error(`warna tidak dikenal: ${value}`);
}

/** Gabungkan warna semi-transparan di atas latar (panel di atas bg). */
function composite(fg: Rgb, bg: Rgb): Rgb {
  const mix = (f: number, b: number) => Math.round(fg.a * f + (1 - fg.a) * b);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: 1 };
}

function luminance(c: Rgb): number {
  const channel = (raw: number) => {
    const s = raw / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

function contrast(fgValue: string, bgValue: string, baseValue: string): number {
  const base = parseColor(baseValue);
  const bg = composite(parseColor(bgValue), base);
  const fg = composite(parseColor(fgValue), bg);
  const la = luminance(fg);
  const lb = luminance(bg);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS: Array<[string, string]> = [
  ["text", "bg"],
  ["text", "bg3"],
  ["text", "panel"],
  ["muted", "bg"],
  ["muted", "bg3"],
  ["onPrimary", "primary"],
  ["onAccent", "accent"],
];

describe("kontras WCAG AA ≥ 4.5:1 di semua tema", () => {
  it("ada 12 tema terdaftar", () => {
    expect(themeKeys.length).toBe(12);
  });
  for (const key of themeKeys) {
    it(`tema ${key}: teks terbaca`, () => {
      const colors = themes[key]?.colors;
      expect(colors).toBeTruthy();
      if (!colors) return;
      for (const [fg, bg] of TEXT_PAIRS) {
        const ratio = contrast(colors[fg as keyof typeof colors] as string,
                               colors[bg as keyof typeof colors] as string,
                               colors.bg);
        expect(ratio, `${key}: ${fg} di ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe("target sentuh ≥ 48dp", () => {
  it("konstanta proyek memang 48", () => {
    expect(MIN_TOUCH_TARGET_DP).toBe(48);
  });
  it("tidak ada minHeight di bawah 48 pada primitif interaktif", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/components/ui/primitives.tsx"), "utf-8");
    const heights = [...src.matchAll(/minHeight:\s*(\d+)/g)].map((m) => Number(m[1]));
    for (const h of heights) {
      expect(h, `minHeight ${h} < 48`).toBeGreaterThanOrEqual(48);
    }
    expect(src).not.toMatch(/minHeight:\s*40/);
  });
});
