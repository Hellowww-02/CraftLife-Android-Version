/**
 * M08 wave 3 — model layar Reminders.
 *
 * Sumber bentuk data: `life_api.py::map_reminder` dan `GET /api/reminders`.
 *
 * Dua aturan yang mudah dilanggar:
 *
 *  1. **Waktu dibandingkan memakai jam SERVER, bukan jam ponsel.** Semua fungsi
 *     di sini menerima `serverNow` sebagai parameter; kalau null (jam server
 *     belum pernah diterima) hasilnya "tidak tahu", bukan tebakan. Pengingat
 *     yang salah waktu jauh lebih buruk daripada daftar tanpa penanda.
 *  2. **Pengulangan tidak dihitung di klien.** Backend punya
 *     `get_next_reminder_datetime` sebagai satu-satunya sumber kebenaran; kalau
 *     ponsel menghitung sendiri, pengingat tahunan bisa bergeser sehari dan
 *     tidak akan pernah cocok lagi. Klien hanya menampilkan `repeat` dan
 *     `repeatUntil`, lalu membaca hasil dari server setelah `/trigger`.
 */

export type RepeatType = "none" | "daily" | "weekly" | "yearly" | "custom";

export const REPEAT_TYPES: readonly RepeatType[] = [
  "none",
  "daily",
  "weekly",
  "yearly",
  "custom",
] as const;

export const REPEAT_LABEL_KEY: Record<RepeatType, string> = {
  none: "reminders_repeat_none",
  daily: "reminders_repeat_daily",
  weekly: "reminders_repeat_weekly",
  yearly: "reminders_repeat_yearly",
  custom: "reminders_repeat_custom",
};

export interface ReminderRow {
  id: string;
  title: string;
  description: string;
  /** "YYYY-MM-DD HH:MM:SS" waktu server. */
  datetime: string;
  time: string;
  repeat: RepeatType;
  repeatDays: string;
  repeatUntil: string;
  isActive: boolean;
  triggered: boolean;
  sound: string;
  sourceRef: string;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toRepeat(value: unknown): RepeatType {
  return typeof value === "string" && (REPEAT_TYPES as readonly string[]).includes(value)
    ? (value as RepeatType)
    : "none";
}

export function toReminderRow(raw: unknown): ReminderRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = r.id === undefined || r.id === null ? "" : String(r.id);
  if (!id) return null;
  const datetime = str(r.datetime);
  return {
    id,
    title: str(r.title),
    description: str(r.description),
    datetime,
    // `time` dari backend sudah "HH:MM"; kalau kosong, ambil dari datetime.
    time: str(r.time) || datetime.slice(11, 16),
    repeat: toRepeat(r.repeat),
    repeatDays: str(r.repeatDays),
    repeatUntil: str(r.repeatUntil),
    isActive: r.isActive !== false,
    triggered: r.triggered === true,
    sound: str(r.sound, "default") || "default",
    sourceRef: str(r.sourceRef),
  };
}

export function toReminderRows(rawList: unknown): ReminderRow[] {
  if (!Array.isArray(rawList)) return [];
  const out: ReminderRow[] = [];
  for (const raw of rawList) {
    const row = toReminderRow(raw);
    if (row) out.push(row);
  }
  return sortReminders(out);
}

/**
 * Urutan: yang masih akan berbunyi dulu (berdasarkan waktunya), lalu yang
 * sudah lewat, lalu yang nonaktif. Daftar pengingat dibaca untuk menjawab
 * "apa yang berikutnya?", jadi yang terdekat harus di atas.
 */
export function sortReminders(rows: readonly ReminderRow[]): ReminderRow[] {
  return [...rows].sort((a, b) => {
    const rank = (r: ReminderRow) => (r.isActive ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.datetime !== b.datetime) return a.datetime < b.datetime ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Ubah "YYYY-MM-DD HH:MM:SS" menjadi Date.
 *
 * Diperlakukan sebagai waktu LOKAL, karena backend menyimpan
 * `datetime.now()` server dan ponsel dianggap berada di zona waktu yang sama
 * (satu pengguna, satu perangkat utama). Menganggapnya UTC akan menggeser
 * semua pengingat sebanyak selisih zona — untuk WIB, 7 jam.
 */
export function reminderDate(datetime: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(datetime);
  if (!m) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? 0),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatReminderWhen(datetime: string): string {
  const d = reminderDate(datetime);
  if (!d) return datetime.slice(0, 16).replace("T", " ");
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type ReminderState = "upcoming" | "due" | "done" | "off";

/**
 * Status sebuah pengingat.
 *
 * `serverNow === null` → semua yang aktif dianggap "upcoming". Ini pilihan
 * sadar: menandai "sudah lewat" tanpa tahu jam server bisa menyembunyikan
 * pengingat yang sebenarnya masih akan datang.
 */
export function reminderState(row: ReminderRow, serverNow: Date | null): ReminderState {
  if (!row.isActive) return "off";
  if (row.triggered) return "done";
  const when = reminderDate(row.datetime);
  if (!when || serverNow === null) return "upcoming";
  return when.getTime() <= serverNow.getTime() ? "due" : "upcoming";
}

/** Selisih dalam menit; negatif berarti sudah lewat. null bila tak bisa dihitung. */
export function minutesUntil(datetime: string, serverNow: Date | null): number | null {
  const when = reminderDate(datetime);
  if (!when || serverNow === null) return null;
  return Math.round((when.getTime() - serverNow.getTime()) / 60000);
}

/** "3 hari lagi" / "2 jam lagi" / "lewat 15 menit" — memakai kunci i18n yang ada. */
export function relativeLabelKey(minutes: number | null): string {
  if (minutes === null) return "mobile_reminder_time_unknown";
  const abs = Math.abs(minutes);
  if (abs < 60) return minutes < 0 ? "mobile_reminder_ago_minutes" : "mobile_reminder_in_minutes";
  if (abs < 60 * 24) return minutes < 0 ? "mobile_reminder_ago_hours" : "mobile_reminder_in_hours";
  return minutes < 0 ? "mobile_reminder_ago_days" : "mobile_reminder_in_days";
}

export function relativeParts(minutes: number | null): { value: number; unitMinutes: number } {
  if (minutes === null) return { value: 0, unitMinutes: 1 };
  const abs = Math.abs(minutes);
  if (abs < 60) return { value: abs, unitMinutes: 1 };
  if (abs < 60 * 24) return { value: Math.round(abs / 60), unitMinutes: 60 };
  return { value: Math.round(abs / (60 * 24)), unitMinutes: 60 * 24 };
}

export function dueRows(rows: readonly ReminderRow[], serverNow: Date | null): ReminderRow[] {
  return rows.filter((row) => reminderState(row, serverNow) === "due");
}

export function countsByState(
  rows: readonly ReminderRow[],
  serverNow: Date | null,
): Record<ReminderState, number> {
  const out: Record<ReminderState, number> = { upcoming: 0, due: 0, done: 0, off: 0 };
  for (const row of rows) out[reminderState(row, serverNow)] += 1;
  return out;
}

// ── Draf ────────────────────────────────────────────────────────────────────

export interface ReminderDraft {
  id: string | null;
  title: string;
  description: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" */
  time: string;
  repeat: RepeatType;
  repeatDays: string;
}

export function emptyReminderDraft(date: string, time = "08:00"): ReminderDraft {
  return {
    id: null,
    title: "",
    description: "",
    date,
    time,
    repeat: "none",
    repeatDays: "",
  };
}

export function draftFromRow(row: ReminderRow): ReminderDraft {
  const when = reminderDate(row.datetime);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    date: when
      ? `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`
      : row.datetime.slice(0, 10),
    time: /^\d{2}:\d{2}$/.test(row.time) ? row.time : "08:00",
    repeat: row.repeat,
    repeatDays: row.repeatDays,
  };
}

export function draftError(draft: ReminderDraft): "empty-title" | "bad-date" | "bad-time" | null {
  if (draft.title.trim() === "") return "empty-title";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return "bad-date";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) return "bad-time";
  return null;
}

/** "YYYY-MM-DD HH:MM:SS" — format yang dibaca `life_api.py` (panjang 19). */
export function draftDatetime(draft: ReminderDraft): string {
  return `${draft.date} ${draft.time}:00`;
}

/**
 * Payload `POST /api/reminders`.
 *
 * `soundFile` tidak pernah dikirim: nada kustom harus diunggah lebih dulu dan
 * itu fitur terpisah. `soundType` tetap "default" supaya backend tidak
 * menunggu berkas yang tidak ada.
 */
export function reminderCreatePayload(draft: ReminderDraft): Record<string, unknown> {
  return {
    title: draft.title.trim(),
    description: draft.description,
    reminderDatetime: draftDatetime(draft),
    soundType: "default",
    repeat: draft.repeat,
    ...(draft.repeat === "custom" ? { repeatDays: draft.repeatDays } : {}),
  };
}

/**
 * Payload `POST /api/reminders/:id/update`.
 *
 * `repeat`, `repeatDays`, dan `soundType` SELALU ikut di sini — berbeda dari
 * create — karena layar edit memang menampilkan dan membiarkan pengguna
 * mengubah keduanya. Backend memperlakukan field yang absen sebagai "jangan
 * ubah", jadi mengirimnya adalah cara mengatakan "ini nilai barunya".
 */
export function reminderUpdatePayload(draft: ReminderDraft): Record<string, unknown> {
  return {
    title: draft.title.trim(),
    description: draft.description,
    reminderDatetime: draftDatetime(draft),
    soundType: "default",
    repeat: draft.repeat,
    repeatDays: draft.repeat === "custom" ? draft.repeatDays : "",
  };
}

/**
 * Hari untuk pengulangan kustom.
 *
 * Backend menyimpan `repeat_days` sebagai string bebas dan
 * `get_next_reminder_datetime` yang menafsirkannya. Klien memakai format
 * "0,1,2" (0=Senin) agar cocok dengan `is_due_on` di `database.py`, yang
 * memakai konvensi Senin=0.
 */
/**
 * Indeks 0..6 = Senin..Minggu, mengikuti `is_due_on` di `database.py`.
 *
 * Label memakai varian `_short` karena hanya varian itu yang LENGKAP di
 * katalog: nama panjang hanya ada untuk Senin, Kamis, dan Minggu
 * (`day_mon`, `day_thu`, `day_sun`). Memakai nama panjang untuk sisanya
 * akan menampilkan kunci mentah di layar.
 */
export const WEEKDAY_LABEL_KEY: readonly string[] = [
  "day_mon_short",
  "day_tue_short",
  "day_wed_short",
  "day_thu_short",
  "day_fri_short",
  "day_sat_short",
  "day_sun_short",
] as const;

export function parseRepeatDays(value: string): number[] {
  return value
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    .sort((a, b) => a - b);
}

export function toggleRepeatDay(value: string, day: number): string {
  const set = new Set(parseRepeatDays(value));
  if (set.has(day)) set.delete(day);
  else set.add(day);
  return [...set].sort((a, b) => a - b).join(",");
}
