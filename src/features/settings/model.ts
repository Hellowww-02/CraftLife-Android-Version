/**
 * M08 — model layar Settings.
 *
 * Layar ini menggabungkan dua sumber yang sifatnya beda, dan mencampur keduanya
 * adalah sumber bug klasik:
 *
 *   1. Preferensi AKUN (bahasa, tema, skala font, kontras tinggi) — tersimpan
 *      di server lewat `POST /api/settings`, jadi ikut tersinkron ke desktop.
 *   2. Status PERANGKAT (antrean sync, terakhir sync, versi app) — hanya
 *      berlaku di ponsel ini dan tidak dikirim ke mana-mana.
 *
 * Karena itu bagian "Data"/"Sinkronisasi" tidak pernah menulis ke server, dan
 * bagian "Tampilan" tidak pernah menjanjikan sesuatu yang hanya berlaku lokal.
 */

import { themeKeys, themes } from "../../theme/tokens";

export interface ThemeOption {
  key: string;
  /** Label tampilan dari token M06, mis. "🌸 Sakura". Bukan warna. */
  label: string;
  selected: boolean;
}

/** 12 tema, sumbernya sama dengan desktop (`tokens.json` <- `db.THEMES`). */
export function themeOptions(selectedKey: string | null | undefined): ThemeOption[] {
  return themeKeys.map((key) => ({
    key,
    label: themes[key]!.colors.label,
    selected: key === selectedKey,
  }));
}

export interface LanguageOption {
  key: "id" | "en";
  labelKey: string;
  selected: boolean;
}

export function languageOptions(selectedKey: string | null | undefined): LanguageOption[] {
  return [
    { key: "id", labelKey: "settings_language_id", selected: selectedKey === "id" },
    { key: "en", labelKey: "settings_language_en", selected: selectedKey === "en" },
  ];
}

/** Skala font yang ditawarkan. 100 = ukuran bawaan. */
export const FONT_SCALE_OPTIONS: readonly number[] = [90, 100, 115, 130] as const;

export function isFontScale(value: unknown): value is number {
  return typeof value === "number" && (FONT_SCALE_OPTIONS as readonly number[]).includes(value);
}

/**
 * Nilai dari server bisa apa saja (kolom DB integer bebas). Yang tidak ada di
 * daftar ditawarkan dibulatkan ke pilihan terdekat, bukan dipakai mentah —
 * kalau tidak, slider akan berada di posisi yang tidak bisa dipilih kembali.
 */
export function nearestFontScale(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 100;
  let best = FONT_SCALE_OPTIONS[0]!;
  for (const option of FONT_SCALE_OPTIONS) {
    if (Math.abs(option - n) < Math.abs(best - n)) best = option;
  }
  return best;
}

export interface AppearanceState {
  themeKey: string;
  language: "id" | "en";
  fontScale: number;
  highContrast: boolean;
}

export function toAppearanceState(user: unknown): AppearanceState {
  const u = (user && typeof user === "object" ? user : {}) as Record<string, unknown>;
  const themeKey = typeof u.theme === "string" && u.theme !== "" ? u.theme : "modern_dark";
  const language = u.language === "en" ? "en" : "id";
  return {
    // Tema yang tidak dikenal (mis. dihapus di versi lain) jatuh ke default
    // lewat `getTheme`, tetapi di sini disimpan apa adanya supaya pilihan
    // pengguna tidak diam-diam diubah sebelum ia menyentuh apa pun.
    themeKey: themes[themeKey] ? themeKey : "modern_dark",
    language,
    fontScale: nearestFontScale(u.fontScale),
    highContrast: u.highContrast === true,
  };
}

export type SettingsSectionKey = "appearance" | "account" | "sync" | "about";

export interface SettingsSection {
  key: SettingsSectionKey;
  labelKey: string;
}

/** Urutan bagian. Ditulis eksplisit supaya tes bisa menguncinya. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { key: "appearance", labelKey: "mobile_settings_appearance" },
  { key: "account", labelKey: "mobile_settings_account" },
  { key: "sync", labelKey: "mobile_settings_sync" },
  { key: "about", labelKey: "mobile_settings_about" },
] as const;

export interface SyncPanelState {
  pending: number;
  dead: number;
  lastSyncedAt: string | null;
}

export interface AboutState {
  version: string;
  /** Kunci i18n `update_version` memakai placeholder `{version}`. */
  versionLabelKey: string;
}

export function toAboutState(appVersion: string): AboutState {
  return { version: appVersion, versionLabelKey: "update_version" };
}

/**
 * Payload untuk `POST /api/settings`.
 *
 * Field yang dibaca handler: `language`, `theme`, `displayName`, `bio`,
 * `avatar`, `heroClass` (`api_server.py:2121`). `fontScale` dan `highContrast`
 * TIDAK dibaca handler itu — keduanya preferensi perangkat dan disimpan
 * lokal. Mengirimnya akan memberi kesan tersimpan padahal tidak, jadi
 * keduanya sengaja tidak ikut.
 */
export function settingsPayload(
  changes: Partial<Pick<AppearanceState, "themeKey" | "language">>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (changes.themeKey !== undefined) payload.theme = changes.themeKey;
  if (changes.language !== undefined) payload.language = changes.language;
  return payload;
}
