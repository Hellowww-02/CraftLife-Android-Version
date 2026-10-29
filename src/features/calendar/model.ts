/**
 * M08 wave 3 — model layar Calendar.
 *
 * Sumber data:
 *   • `GET /api/calendar`  -> `{ok, calendarNotes: [{date, note}]}`
 *   • `GET /api/holidays?year=N` -> `{ok, year, holidays: [{date, nameId, nameEn, type}]}`
 *     (backend mengirim TIGA tahun sekaligus: N-1, N, N+1)
 *   • `POST /api/calendar/note {date, note}` — **catatan kosong berarti hapus**
 *     (`life_api.py:1665`), jadi "simpan kosong" dan "hapus" memang satu jalur.
 *
 * Catatan kalender TIDAK punya id — kuncinya tanggal. Karena itu ia tidak
 * masuk cache entitas (yang menuntut `id` per baris) dan layarnya memakai
 * `useRemote`.
 *
 * Minggu dimulai SENIN. Ini bukan selera: `database.py::is_due_on` memakai
 * konvensi 0=Senin, dan kalender Indonesia pun Senin di kiri.
 */

export interface CalendarNote {
  date: string;
  note: string;
}

export interface Holiday {
  date: string;
  nameId: string;
  nameEn: string;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function toCalendarNotes(rawList: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(rawList)) return map;
  for (const raw of rawList) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const date = str(r.date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    map.set(date, str(r.note));
  }
  return map;
}

export function toHolidays(rawList: unknown, lang: "id" | "en"): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(rawList)) return map;
  for (const raw of rawList) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const date = str(r.date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const name = lang === "id" ? str(r.nameId) || str(r.nameEn) : str(r.nameEn) || str(r.nameId);
    if (name !== "") map.set(date, name);
  }
  return map;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toYmd(year: number, month1: number, day: number): string {
  return `${year}-${pad2(month1)}-${pad2(day)}`;
}

export interface MonthCell {
  ymd: string;
  day: number;
  /** false untuk kotak abu-abu milik bulan sebelum/sesudahnya. */
  inMonth: boolean;
  isToday: boolean;
  /** 0=Senin .. 6=Minggu. */
  weekday: number;
}

/**
 * Kotak-kotak satu bulan, selalu 6 baris × 7 kolom (42 kotak).
 *
 * Panjang tetap dipilih supaya tinggi kisi tidak berubah-ubah saat berpindah
 * bulan — kisi yang "melompat" setinggi satu baris tiap bulan terasa rusak
 * walau secara teknis benar.
 */
export function monthCells(year: number, month1: number, todayYmd: string | null): MonthCell[] {
  const first = new Date(year, month1 - 1, 1);
  // getDay(): 0=Minggu. Digeser supaya Senin=0.
  const leading = (first.getDay() + 6) % 7;
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(year, month1 - 1, 1 - leading + i);
    const ymd = toYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());
    cells.push({
      ymd,
      day: d.getDate(),
      inMonth: d.getMonth() === month1 - 1,
      isToday: todayYmd !== null && ymd === todayYmd,
      weekday: (d.getDay() + 6) % 7,
    });
  }
  return cells;
}

/** Judul bulan, mis. 2026-10 -> Oktober. Memakai kunci i18n `month_*` yang ada. */
export function monthLabelKey(month1: number): string {
  // Katalog memakai `month_01`..`month_12` (dua digit), bukan `month_jan`.
  const n = Math.min(12, Math.max(1, Math.round(month1)));
  return `month_${pad2(n)}`;
}

export function shiftMonth(year: number, month1: number, delta: number): { year: number; month1: number } {
  const total = year * 12 + (month1 - 1) + delta;
  const y = Math.floor(total / 12);
  return { year: y, month1: (total % 12) + 1 };
}

export interface DayDetail {
  ymd: string;
  note: string;
  holiday: string | null;
  isToday: boolean;
}

export function dayDetail(
  ymd: string,
  notes: ReadonlyMap<string, string>,
  holidays: ReadonlyMap<string, string>,
  todayYmd: string | null,
): DayDetail {
  return {
    ymd,
    note: notes.get(ymd) ?? "",
    holiday: holidays.get(ymd) ?? null,
    isToday: todayYmd !== null && ymd === todayYmd,
  };
}

export function monthHasNotes(cells: readonly MonthCell[], notes: ReadonlyMap<string, string>): Set<string> {
  const out = new Set<string>();
  for (const cell of cells) {
    const note = notes.get(cell.ymd);
    if (note !== undefined && note.trim() !== "") out.add(cell.ymd);
  }
  return out;
}

export function monthHolidays(
  cells: readonly MonthCell[],
  holidays: ReadonlyMap<string, string>,
): Array<{ ymd: string; name: string }> {
  const out: Array<{ ymd: string; name: string }> = [];
  for (const cell of cells) {
    if (!cell.inMonth) continue;
    const name = holidays.get(cell.ymd);
    if (name) out.push({ ymd: cell.ymd, name });
  }
  return out;
}

/**
 * Payload `POST /api/calendar/note`.
 *
 * Catatan yang hanya spasi dikirim sebagai string kosong — dan itu memang
 * berarti "hapus", persis seperti perilaku desktop. Membiarkan spasi terkirim
 * akan menyisakan catatan tak terlihat yang tidak bisa dibersihkan.
 */
export function calendarNotePayload(ymd: string, note: string): Record<string, unknown> {
  return { date: ymd, note: note.trim() };
}

// ── Parser respons ──────────────────────────────────────────────────────────

/** `GET /api/calendar` -> `{ok, calendarNotes: [...]}` */
export function parseCalendarPayload(raw: unknown): Map<string, string> | null {
  if (!raw || typeof raw !== "object") return null;
  return toCalendarNotes((raw as Record<string, unknown>).calendarNotes);
}

/** `GET /api/holidays` -> `{ok, year, holidays: [...]}` */
export function parseHolidaysPayload(
  raw: unknown,
  lang: "id" | "en",
): Map<string, string> | null {
  if (!raw || typeof raw !== "object") return null;
  return toHolidays((raw as Record<string, unknown>).holidays, lang);
}

export const CALENDAR_PATH = "/api/calendar";

/**
 * Kepala kolom kisi, Senin di kiri.
 *
 * Memakai varian `_short` karena hanya varian itu yang lengkap di katalog
 * (nama panjang hanya ada untuk Senin, Kamis, dan Minggu).
 */
export const WEEKDAY_HEADER_KEYS: readonly string[] = [
  "day_mon_short",
  "day_tue_short",
  "day_wed_short",
  "day_thu_short",
  "day_fri_short",
  "day_sat_short",
  "day_sun_short",
] as const;
