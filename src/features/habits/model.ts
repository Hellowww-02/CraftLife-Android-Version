/**
 * M08 — model layar Habits.
 *
 * Sumber bentuk data: `api_server.py::_map_habit`. Yang penting dan mudah
 * salah ada di komentar `_map_habit` itu sendiri: streak harus MURNI dari
 * kolom `streak` / `fail_streak`, tidak boleh fallback ke counter lifetime —
 * bug lama membuat angka streak bangkit lagi setelah direset.
 */

import {
  percentOf,
  sortTasks,
  toTaskBase,
  type Difficulty,
  type TaskBase,
} from "../tasks/model";

export interface HabitRow extends TaskBase {
  isPositive: boolean;
  isNegative: boolean;
  positiveStreak: number;
  negativeStreak: number;
  doneToday: boolean;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function toHabitRow(raw: unknown): HabitRow | null {
  const base = toTaskBase(raw, "⚔️");
  if (!base) return null;
  const r = raw as Record<string, unknown>;
  return {
    ...base,
    // default mengikuti `_map_habit`: positive default 1, negative default 0.
    isPositive: asBool(r.isPositive, true),
    isNegative: asBool(r.isNegative, false),
    positiveStreak: Number(r.positiveStreak) || 0,
    negativeStreak: Number(r.negativeStreak) || 0,
    doneToday: asBool(r.doneToday, false),
  };
}

export function toHabitRows(rawList: unknown): HabitRow[] {
  if (!Array.isArray(rawList)) return [];
  const out: HabitRow[] = [];
  for (const raw of rawList) {
    const row = toHabitRow(raw);
    if (row) out.push(row);
  }
  return sortTasks(out);
}

/**
 * Arah habit: "positive" = kebiasaan baik (ditekan = sukses),
 * "negative" = kebiasaan buruk (ditekan = gagal/tergoda).
 *
 * Backend mengizinkan keduanya sekaligus (habit netral yang bisa naik atau
 * turun). Untuk UI ponsel satu tombol utama lebih jelas, jadi yang dipilih
 * adalah `positive` kalau keduanya aktif — sama dengan default
 * `body.get("isPositive", True)` di `POST /api/habits`.
 */
export function habitDirection(row: HabitRow): "positive" | "negative" {
  return row.isNegative && !row.isPositive ? "negative" : "positive";
}

/** Streak yang ditampilkan: sesuai arah habit, bukan gabungan keduanya. */
export function habitStreak(row: HabitRow): number {
  return habitDirection(row) === "negative" ? row.negativeStreak : row.positiveStreak;
}

export interface HabitProgress {
  done: number;
  total: number;
  percent: number;
}

export function habitsProgress(rows: readonly HabitRow[]): HabitProgress {
  const done = rows.filter((r) => r.doneToday).length;
  return { done, total: rows.length, percent: percentOf(done, rows.length) };
}

/**
 * Payload untuk `POST /api/habits` dan `/api/habits/:id/update`.
 *
 * Field-nya persis yang dibaca handler backend (`api_server.py:2302` dst):
 * `title`, `icon`, `difficulty`, `isPositive`, `isNegative`, `notes`,
 * `folderId`. Mengirim nama lain akan diabaikan diam-diam oleh backend —
 * perubahan terlihat tersimpan padahal tidak.
 */
export interface HabitDraft {
  title: string;
  icon: string;
  difficulty: Difficulty;
  isPositive: boolean;
  isNegative: boolean;
  notes: string;
  folderId?: string | null;
}

export function emptyHabitDraft(): HabitDraft {
  return {
    title: "",
    icon: "⚔️",
    difficulty: "medium",
    isPositive: true,
    isNegative: false,
    notes: "",
  };
}

export function draftFromHabit(row: HabitRow): HabitDraft {
  return {
    title: row.title,
    icon: row.icon,
    difficulty: row.difficulty,
    isPositive: row.isPositive,
    isNegative: row.isNegative,
    notes: row.notes,
    folderId: row.folderId,
  };
}

/** Judul kosong tidak boleh dikirim: backend menjawab 400 `{"error":"empty"}`. */
export function draftError(draft: HabitDraft): "empty-title" | null {
  return draft.title.trim() === "" ? "empty-title" : null;
}

export function habitPayload(draft: HabitDraft): Record<string, unknown> {
  return {
    title: draft.title.trim(),
    icon: draft.icon,
    difficulty: draft.difficulty,
    isPositive: draft.isPositive,
    isNegative: draft.isNegative,
    notes: draft.notes,
    ...(draft.folderId === undefined ? {} : { folderId: draft.folderId }),
  };
}

/**
 * Optimistic update: apa yang berubah di cache sebelum server menjawab.
 *
 * `doneToday` dibalik dan streak bergerak satu langkah. Ini yang membuat
 * layar terasa instan di jaringan lambat; kalau server menolak, cache
 * ditimpa ulang oleh hasil refresh.
 */
export function applyHabitComplete(row: HabitRow, positive: boolean): HabitRow {
  if (positive) {
    return {
      ...row,
      doneToday: !row.doneToday,
      positiveStreak: row.doneToday
        ? Math.max(0, row.positiveStreak - 1)
        : row.positiveStreak + 1,
    };
  }
  return {
    ...row,
    doneToday: false,
    negativeStreak: row.negativeStreak + 1,
  };
}
