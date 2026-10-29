/**
 * M07 — tema Android dari token M06.
 *
 * File ini TIDAK memuat satu pun nilai warna. Semuanya dibaca dari
 * `@craftlife/core/design/tokens.json`, yang dihasilkan dari `database.THEMES`
 * dan `web/src/index.css`. Kalau ada warna yang di-hardcode di sini, web dan
 * Android akan diam-diam berbeda dan tidak ada yang menyadarinya.
 *
 * Yang dilakukan file ini hanya menerjemahkan satuan:
 *   rem  -> dp   (1rem = 16dp)
 *   "140ms" -> 140
 *   cubic-bezier(...) -> PathInterpolator arguments
 */

import raw from "@craftlife/core/design/tokens.json";

/** Bentuk tokens.json yang dihasilkan scripts/export_design_tokens.py. */
interface TokensFile {
  version: string;
  meta: Record<string, number>;
  themes: Record<string, Record<string, string>>;
  structural: Record<string, string>;
  atmosphere: Record<string, Record<string, string>>;
}

const tokens = raw as TokensFile;

export const TOKEN_VERSION = tokens.version;

/** 1rem = 16px CSS = 16dp Android. Skala radius M06 memang +4dp seragam. */
export const REM_TO_DP = 16;

export function remToDp(rem: number): number {
  return Math.round(rem * REM_TO_DP);
}

/** "0.625rem" -> 10 · "14px" -> 14 · "1.5" -> 24 */
export function lengthToDp(value: string): number {
  const v = value.trim();
  const num = Number.parseFloat(v);
  if (Number.isNaN(num)) return 0;
  if (v.endsWith("rem")) return remToDp(num);
  if (v.endsWith("px")) return Math.round(num);
  return remToDp(num);
}

/** "140ms" -> 140 · "1.9s" -> 1900 */
export function durationToMs(value: string): number {
  const v = value.trim();
  const num = Number.parseFloat(v);
  if (Number.isNaN(num)) return 0;
  return v.endsWith("ms") ? Math.round(num) : Math.round(num * 1000);
}

/**
 * "cubic-bezier(0.22, 1, 0.36, 1)" -> [0.22, 1, 0.36, 1]
 *
 * React Native tidak punya cubic-bezier; angkanya dipakai untuk
 * `new PathInterpolator(x1, y1, x2, y2)` di sisi native, atau sebagai
 * easing approximation di JS. Mengembalikan null untuk kurva yang tidak
 * dikenal supaya pemanggil sadar, bukan diam-diam memakai default.
 */
export function cubicBezier(value: string): [number, number, number, number] | null {
  const m = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(
    value,
  );
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

/** Warna palet untuk satu tema. Field-nya persis 16 field db.THEMES. */
export interface ThemeColors {
  primary: string;
  light: string;
  bg: string;
  bg2: string;
  bg3: string;
  panel: string;
  border: string;
  accent: string;
  accent2: string;
  accent3: string;
  glow: string;
  text: string;
  muted: string;
  onPrimary: string;
  onAccent: string;
  /** Nama tampilan, mis. "🌸 Sakura". Bukan warna. */
  label: string;
}

export interface Theme {
  key: string;
  colors: ThemeColors;
  /** Intensitas atmosfer per tema, dari blok [data-theme]. */
  atmosphere: Record<string, number>;
}

export interface DesignScale {
  radius: { sm: number; md: number; lg: number; xl: number; "2xl": number };
  motion: {
    fast: number;
    med: number;
    slow: number;
    xslow: number;
    ease: [number, number, number, number] | null;
    easeSpring: [number, number, number, number] | null;
    easeInout: [number, number, number, number] | null;
  };
  font: { sans: string; display: string; mono: string };
}

const S = tokens.structural;

export const scale: DesignScale = {
  radius: {
    sm: lengthToDp(S["--ct-r-sm"] ?? "0.625rem"),
    md: lengthToDp(S["--ct-r-md"] ?? "0.875rem"),
    lg: lengthToDp(S["--ct-r-lg"] ?? "1.125rem"),
    xl: lengthToDp(S["--ct-r-xl"] ?? "1.375rem"),
    "2xl": lengthToDp(S["--ct-r-2xl"] ?? "1.625rem"),
  },
  motion: {
    fast: durationToMs(S["--ct-t-fast"] ?? "140ms"),
    med: durationToMs(S["--ct-t-med"] ?? "240ms"),
    slow: durationToMs(S["--ct-t-slow"] ?? "420ms"),
    xslow: durationToMs(S["--ct-t-xslow"] ?? "700ms"),
    ease: cubicBezier(S["--ct-ease"] ?? ""),
    easeSpring: cubicBezier(S["--ct-ease-spring"] ?? ""),
    easeInout: cubicBezier(S["--ct-ease-inout"] ?? ""),
  },
  font: {
    sans: S["--ct-font-sans"] ?? "sans-serif",
    display: S["--ct-font-display"] ?? "sans-serif-medium",
    mono: S["--ct-font-mono"] ?? "monospace",
  },
};

/** snake_case db.THEMES -> camelCase, tanpa mengubah nilainya. */
function toColors(palette: Record<string, string>, key: string): ThemeColors {
  const need = (field: string): string => {
    const value = palette[field];
    if (value === undefined || value === "") {
      throw new Error(`tema "${key}" kehilangan field palet "${field}"`);
    }
    return value;
  };
  return {
    primary: need("primary"),
    light: need("light"),
    bg: need("bg"),
    bg2: need("bg2"),
    bg3: need("bg3"),
    panel: need("panel"),
    border: need("border"),
    accent: need("accent"),
    accent2: need("accent2"),
    accent3: need("accent3"),
    glow: need("glow"),
    text: need("text"),
    muted: need("muted"),
    onPrimary: need("on_primary"),
    onAccent: need("on_accent"),
    label: need("label"),
  };
}

function toAtmosphere(key: string): Record<string, number> {
  const block = tokens.atmosphere[key] ?? {};
  const out: Record<string, number> = {};
  for (const [token, value] of Object.entries(block)) {
    const name = token.replace(/^--ct-/, "");
    const v = value.trim();
    // Hanya opasitas/durasi yang masuk akal sebagai angka; yang lain (mis.
    // "40%" untuk amb-round) dibiarkan apa adanya sebagai string.
    const num = Number.parseFloat(v);
    if (!Number.isNaN(num) && /o$|tempo$|size$|glow-r$/.test(name)) {
      out[name] = v.endsWith("ms") || v.endsWith("s") ? durationToMs(v) : num;
    } else {
      out[name] = num;
    }
  }
  return out;
}

/** 12 tema, dibangun dari tokens.json saat modul dimuat. */
export const themes: Record<string, Theme> = Object.fromEntries(
  Object.entries(tokens.themes).map(([key, palette]) => [
    key,
    { key, colors: toColors(palette, key), atmosphere: toAtmosphere(key) },
  ]),
);

export const themeKeys: string[] = Object.keys(themes);

export const DEFAULT_THEME_KEY = "modern_dark";

export function getTheme(key: string | null | undefined): Theme {
  const found = key ? themes[key] : undefined;
  return found ?? themes[DEFAULT_THEME_KEY]!;
}

/**
 * Target sentuh minimum Android.
 *
 * DESIGN.md §6.3 mencatat bahwa ambang 48dp belum diverifikasi di web karena
 * tidak ada komponen native untuk diukur. Di Android nilainya bisa — dan harus
 * — ditegakkan, jadi setiap target sentuh memakai angka ini.
 */
export const MIN_TOUCH_TARGET_DP = 48;
