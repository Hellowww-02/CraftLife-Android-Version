/**
 * M08 wave 2 — model layar SportTrack.
 *
 * Sumber bentuk data: `life_api.py::map_sport` (baris) dan
 * `GET /api/sport` -> `{"ok": true, "sportLogs": [...]}`.
 *
 * Dua hal yang membedakan sport dari Habits/Dailies dan mudah salah:
 *
 *  1. `difficulty` dan `intensity` adalah SATU nilai dengan dua nama. Backend
 *     menerima `difficulty` (easy/medium/hard/epic) dan, kalau tidak ada,
 *     menerjemahkan `intensity` (light/moderate/vigorous). Mengirim keduanya
 *     dengan nilai yang bertentangan akan membuat yang tersimpan tidak sesuai
 *     pilihan pengguna. Di sini hanya `difficulty` yang dikirim.
 *  2. "Selesai" dan "Reps" adalah dua aksi berbeda dengan arti berbeda:
 *     tombol selesai memberi poin sport, reps menggerakkan RANK aktivitas.
 *     Keduanya punya endpoint sendiri (`/complete` dan `/reps`).
 */

import { percentOf, toTaskBase, type Difficulty, type TaskBase } from "../tasks/model";

export interface SportRow extends TaskBase {
  sportType: string;
  sportName: string;
  durationMinutes: number;
  caloriesBurned: number;
  sportPointsReward: number;
  streak: number;
  done: boolean;
  totalReps: number;
  date: string;
}

export function toSportRow(raw: unknown): SportRow | null {
  const base = toTaskBase(raw, "🏃");
  if (!base) return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    ...base,
    // `sportName` adalah nama aktivitas; `title` di TaskBase diisi dari field
    // `title` yang TIDAK ada di payload sport. Disamakan di sini supaya
    // komponen baris bisa dipakai ulang.
    title: typeof r.sportName === "string" && r.sportName !== "" ? r.sportName : base.title,
    sportName: typeof r.sportName === "string" ? r.sportName : "",
    sportType: typeof r.sportType === "string" && r.sportType !== "" ? r.sportType : "other",
    durationMinutes: Math.round(num(r.durationMinutes)),
    caloriesBurned: Math.round(num(r.caloriesBurned)),
    sportPointsReward: Math.round(num(r.sportPointsReward)),
    streak: Math.round(num(r.streak)),
    done: r.done === true,
    totalReps: Math.round(num(r.totalReps)),
    date: typeof r.date === "string" ? r.date.slice(0, 10) : "",
  };
}

export function toSportRows(rawList: unknown): SportRow[] {
  if (!Array.isArray(rawList)) return [];
  const out: SportRow[] = [];
  for (const raw of rawList) {
    const row = toSportRow(raw);
    if (row) out.push(row);
  }
  // Aktivitas yang sudah selesai hari ini di atas: itu yang paling sering
  // dicari, dan di layar sempit menggulir ke bawah untuk menemukannya mahal.
  return out.sort((a, b) => {
    if (a.done !== b.done) return a.done ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

/** Kunci `db.SPORT_TYPES` -> kunci i18n `sport_type_*` yang sudah ada. */
export const SPORT_TYPES: readonly string[] = [
  "running",
  "gym",
  "cycling",
  "swimming",
  "yoga",
  "football",
  "calisthenics",
  "martial_arts",
  "badminton",
  "other",
] as const;

export const SPORT_TYPE_ICON: Record<string, string> = {
  running: "🏃",
  gym: "🏋️",
  cycling: "🚴",
  swimming: "🏊",
  yoga: "🧘",
  football: "⚽",
  calisthenics: "💪",
  martial_arts: "🥋",
  badminton: "🏸",
  other: "🏅",
};

export function sportTypeLabelKey(sportType: string): string {
  return SPORT_TYPES.includes(sportType) ? `sport_type_${sportType}` : "sport_type_other";
}

export interface SportProgress {
  done: number;
  total: number;
  percent: number;
  caloriesToday: number;
  minutesToday: number;
}

/**
 * "Hari ini" dihitung dari baris yang `done`-nya true — backend sudah
 * menyetel `done_today` per tanggal server, jadi ponsel tidak perlu (dan tidak
 * boleh) memutuskan sendiri hari apa sekarang.
 */
export function sportProgress(rows: readonly SportRow[]): SportProgress {
  const doneRows = rows.filter((r) => r.done);
  return {
    done: doneRows.length,
    total: rows.length,
    percent: percentOf(doneRows.length, rows.length),
    caloriesToday: doneRows.reduce((sum, r) => sum + r.caloriesBurned, 0),
    minutesToday: doneRows.reduce((sum, r) => sum + r.durationMinutes, 0),
  };
}

export function applySportComplete(row: SportRow): SportRow {
  return { ...row, done: !row.done };
}

export interface SportDraft {
  sportName: string;
  sportType: string;
  icon: string;
  difficulty: Difficulty;
  durationMinutes: number;
  caloriesBurned: number;
  notes: string;
}

export function emptySportDraft(): SportDraft {
  return {
    sportName: "",
    sportType: "running",
    icon: "🏃",
    difficulty: "medium",
    durationMinutes: 30,
    caloriesBurned: 0,
    notes: "",
  };
}

export function draftError(draft: SportDraft): "empty-name" | "bad-duration" | null {
  if (draft.sportName.trim() === "") return "empty-name";
  if (!Number.isFinite(draft.durationMinutes) || draft.durationMinutes <= 0) return "bad-duration";
  return null;
}

/**
 * Payload `POST /api/sport`.
 *
 * Hanya `difficulty` yang dikirim, bukan `intensity` — lihat komentar di atas.
 * `complete` sengaja tidak ikut: membuat sekaligus menyelesaikan adalah dua
 * aksi, dan menggabungkannya membuat satu ketukan diam-diam memberi poin.
 */
export function sportPayload(draft: SportDraft): Record<string, unknown> {
  return {
    sportName: draft.sportName.trim(),
    sportType: draft.sportType,
    icon: draft.icon || SPORT_TYPE_ICON[draft.sportType] || "🏅",
    difficulty: draft.difficulty,
    durationMinutes: Math.round(draft.durationMinutes),
    caloriesBurned: Math.max(0, Math.round(draft.caloriesBurned)),
    notes: draft.notes,
  };
}

/** Payload `POST /api/sport/:id/reps`. */
export function repsPayload(reps: number, sets: number): Record<string, unknown> {
  return {
    reps: Math.max(0, Math.round(reps)),
    sets: Math.max(1, Math.round(sets)),
  };
}
