/**
 * M08 wave 2 — model layar Health logs.
 *
 * Sumber bentuk data: `life_api.py::map_health` dan `_health_log_for_date`,
 * disimpan lewat `POST /api/health`.
 *
 * Batas yang disengaja: total air dan kalori bersih TIDAK dikirim dari ponsel.
 * Backend menghitung keduanya sendiri dari log air dan log makanan
 * (`life_api.py:1703`). Mengirim angka dari klien akan membuka dua sumber
 * kebenaran untuk satu nilai — persis yang dilarang P2.
 */

import { percentOf } from "../tasks/model";

export type Mood = "great" | "good" | "neutral" | "tired" | "stressed";

export const MOODS: readonly Mood[] = ["great", "good", "neutral", "tired", "stressed"] as const;

export const MOOD_LABEL_KEY: Record<Mood, string> = {
  great: "mobile_mood_great",
  good: "mobile_mood_good",
  neutral: "mobile_mood_neutral",
  tired: "mobile_mood_tired",
  stressed: "mobile_mood_stressed",
};

/** Emoji mengikuti HealthPomodoroView desktop supaya kedua klien serupa. */
export const MOOD_ICON: Record<Mood, string> = {
  great: "😄",
  good: "🙂",
  neutral: "😐",
  tired: "🥱",
  stressed: "😫",
};

export function toMood(raw: unknown): Mood {
  return typeof raw === "string" && (MOODS as readonly string[]).includes(raw)
    ? (raw as Mood)
    : "good";
}

export interface HealthLog {
  date: string;
  steps: number;
  sleepHours: number;
  weightKg: number | null;
  heartRate: number | null;
  mood: Mood;
  notes: string;
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

/** Berat boleh null: backend menyimpan NULL untuk "tidak ditimbang hari ini". */
function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function toHealthLog(raw: unknown, fallbackDate: string): HealthLog {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    date: typeof r.date === "string" && r.date !== "" ? r.date.slice(0, 10) : fallbackDate,
    steps: Math.round(num(r.steps)),
    sleepHours: Math.round(num(r.sleepHours) * 10) / 10,
    weightKg: nullableNum(r.weightKg),
    heartRate: nullableNum(r.heartRate),
    mood: toMood(r.mood),
    notes: typeof r.notes === "string" ? r.notes : "",
  };
}

export interface HealthGoals {
  dailySteps: number;
  dailySleepHours: number;
}

export function toHealthGoals(raw: unknown): HealthGoals {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    dailySteps: Math.max(1, Math.round(num(r.dailySteps, 10000))),
    dailySleepHours: Math.max(0.5, num(r.dailySleepHours, 7)),
  };
}

export interface HealthBar {
  labelKey: string;
  /** Nilai yang sudah diformat untuk ditampilkan, mis. "7.250 / 10000". */
  detail: string;
  percent: number;
}

export function healthBars(log: HealthLog, goals: HealthGoals): HealthBar[] {
  return [
    {
      labelKey: "health_steps",
      detail: `${log.steps} / ${goals.dailySteps}`,
      percent: percentOf(log.steps, goals.dailySteps),
    },
    {
      labelKey: "health_sleep",
      detail: `${log.sleepHours} / ${goals.dailySleepHours}h`,
      percent: percentOf(log.sleepHours, goals.dailySleepHours),
    },
  ];
}

export interface HealthDraft {
  steps: number;
  sleepHours: number;
  weightKg: number | null;
  heartRate: number | null;
  mood: Mood;
  notes: string;
}

export function draftFromLog(log: HealthLog): HealthDraft {
  return {
    steps: log.steps,
    sleepHours: log.sleepHours,
    weightKg: log.weightKg,
    heartRate: log.heartRate,
    mood: log.mood,
    notes: log.notes,
  };
}

/** Tidur negatif tidak masuk akal dan akan merusak rata-rata 7 hari. */
export function draftError(draft: HealthDraft): "bad-sleep" | "bad-steps" | null {
  if (draft.sleepHours < 0 || draft.sleepHours > 24) return "bad-sleep";
  if (draft.steps < 0) return "bad-steps";
  return null;
}

/**
 * Payload `POST /api/health`.
 *
 * `waterMl` dan `netCalories` sengaja TIDAK dikirim — lihat komentar di atas.
 * `weightKg` dikirim sebagai null (bukan 0) kalau tidak diisi, karena backend
 * membedakan "tidak ditimbang" dari "timbangannya 0".
 */
export function healthPayload(
  draft: HealthDraft,
  logDate: string | null,
): Record<string, unknown> {
  return {
    ...(logDate ? { logDate } : {}),
    steps: Math.max(0, Math.round(draft.steps)),
    sleepHours: Math.max(0, draft.sleepHours),
    heartRate: draft.heartRate === null ? 0 : Math.round(draft.heartRate),
    weightKg: draft.weightKg === null ? "" : draft.weightKg,
    mood: draft.mood,
    notes: draft.notes,
  };
}

/**
 * Ubah teks ketikan jadi angka.
 *
 * Kosong = null, bukan 0: di layar kesehatan, "dikosongkan" berarti "tidak
 * diisi" dan harus tetap null supaya backend tidak menimpa data lama dengan 0.
 */
export function parseOptionalNumber(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
