/**
 * M08 — model layar Dailies.
 *
 * Sumber bentuk data: `api_server.py::_map_daily`.
 *
 * Bagian yang paling mudah salah adalah hari pengulangan. Backend menyimpan
 * `repeat_days` sebagai "0=Senin..6=Minggu", tetapi `_parse_repeat`
 * mengirimkannya ke klien sebagai `(db + 1) % 7`, yaitu konvensi JavaScript
 * "0=Minggu..6=Sabtu". Jadi `row.repeatDays` yang sampai di ponsel SUDAH dalam
 * konvensi JS, dan pembandingnya harus hari dalam konvensi JS juga
 * (`weekdayFromYmd`), bukan `date.weekday()` Python.
 *
 * Tanggalnya wajib dari jam server (`serverClock.dateKey()`), bukan jam
 * perangkat — reset harian dan streak dihitung backend dari zona aplikasi.
 */

import {
  percentOf,
  sortTasks,
  toTaskBase,
  weekdayFromYmd,
  type Difficulty,
  type TaskBase,
} from "../tasks/model";

export interface DailyRow extends TaskBase {
  streak: number;
  isCompletedToday: boolean;
  /** Konvensi JS `getDay()`: 0 = Minggu .. 6 = Sabtu. Tujuh angka = tiap hari. */
  repeatDays: number[];
  lastCompletedDate: string | null;
  isFrozen: boolean;
}

export function toDailyRow(raw: unknown): DailyRow | null {
  const base = toTaskBase(raw, "📅");
  if (!base) return null;
  const r = raw as Record<string, unknown>;
  const repeat = Array.isArray(r.repeatDays)
    ? r.repeatDays
        .map((d) => Number(d))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [];
  return {
    ...base,
    streak: Number(r.streak) || 0,
    isCompletedToday: r.isCompletedToday === true,
    // `_parse_repeat` tidak pernah mengirim array kosong; kalau kosong (data
    // lama/rusak) dianggap tiap hari, sama seperti arti string kosong di DB.
    repeatDays: repeat.length > 0 ? [...new Set(repeat)].sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5, 6],
    lastCompletedDate:
      typeof r.lastCompletedDate === "string" && r.lastCompletedDate !== ""
        ? r.lastCompletedDate.slice(0, 10)
        : null,
    isFrozen: r.isFrozen === true,
  };
}

export function toDailyRows(rawList: unknown): DailyRow[] {
  if (!Array.isArray(rawList)) return [];
  const out: DailyRow[] = [];
  for (const raw of rawList) {
    const row = toDailyRow(raw);
    if (row) out.push(row);
  }
  return sortTasks(out);
}

export function isEveryDay(row: DailyRow): boolean {
  return row.repeatDays.length >= 7;
}

/**
 * Apakah daily ini terjadwal hari ini.
 *
 * `dateKey` null = jam server belum pernah diterima. Dalam keadaan itu
 * hasilnya false untuk daily terjadwal parsial dan true untuk daily tiap hari:
 * lebih baik menampilkan daily tiap hari (yang memang selalu jatuh tempo)
 * daripada menebak hari dan menampilkan rutinitas yang salah.
 */
export function isDueToday(row: DailyRow, dateKey: string | null): boolean {
  if (isEveryDay(row)) return true;
  const weekday = weekdayFromYmd(dateKey);
  if (weekday === null) return false;
  return row.repeatDays.includes(weekday);
}

/** Hanya daily yang jatuh tempo hari ini — ini yang dihitung sebagai progres. */
export function dailiesForToday(rows: readonly DailyRow[], dateKey: string | null): DailyRow[] {
  return rows.filter((r) => isDueToday(r, dateKey));
}

export interface DailyProgress {
  done: number;
  due: number;
  percent: number;
}

export function dailiesProgress(
  rows: readonly DailyRow[],
  dateKey: string | null,
): DailyProgress {
  const due = dailiesForToday(rows, dateKey);
  const done = due.filter((r) => r.isCompletedToday).length;
  return { done, due: due.length, percent: percentOf(done, due.length) };
}

/**
 * Optimistic update untuk tombol selesai.
 *
 * Daily yang dibekukan (`isFrozen`) tidak boleh bisa diselesaikan dari UI:
 * perisai freeze artinya streak dilindungi, dan menyelesaikan daily beku akan
 * mengacaukan logika streak di backend.
 */
export function applyDailyComplete(row: DailyRow): DailyRow {
  if (row.isFrozen) return row;
  return {
    ...row,
    isCompletedToday: !row.isCompletedToday,
    streak: row.isCompletedToday ? Math.max(0, row.streak - 1) : row.streak + 1,
  };
}

export interface DailyDraft {
  title: string;
  icon: string;
  difficulty: Difficulty;
  notes: string;
  repeatDays: number[];
  folderId?: string | null;
}

export function emptyDailyDraft(): DailyDraft {
  return {
    title: "",
    icon: "📅",
    difficulty: "medium",
    notes: "",
    repeatDays: [0, 1, 2, 3, 4, 5, 6],
  };
}

export function draftFromDaily(row: DailyRow): DailyDraft {
  return {
    title: row.title,
    icon: row.icon,
    difficulty: row.difficulty,
    notes: row.notes,
    repeatDays: [...row.repeatDays],
    folderId: row.folderId,
  };
}

export function draftError(draft: DailyDraft): "empty-title" | "no-days" | null {
  if (draft.title.trim() === "") return "empty-title";
  if (draft.repeatDays.length === 0) return "no-days";
  return null;
}

/**
 * Payload untuk `POST /api/dailies` / `/api/dailies/:id/update`.
 *
 * `repeatDays` dikirim dalam konvensi JS karena `_repeat_to_db` di backend
 * yang menerjemahkannya ke format DB.
 *
 * Catatan jujur soal `icon`: handler create membacanya, handler update TIDAK
 * (`api_server.py:2421` hanya title/difficulty/notes/repeatDays/folderId).
 * Field ini tetap dikirim supaya satu fungsi payload bisa dipakai keduanya;
 * mengganti ikon daily yang sudah ada belum didukung backend dan memang tidak
 * dipalsukan di UI (form edit tidak menampilkan pemilih ikon).
 */
export function dailyPayload(draft: DailyDraft): Record<string, unknown> {
  return {
    title: draft.title.trim(),
    icon: draft.icon,
    difficulty: draft.difficulty,
    notes: draft.notes,
    repeatDays: [...draft.repeatDays].sort((a, b) => a - b),
    ...(draft.folderId === undefined ? {} : { folderId: draft.folderId }),
  };
}
