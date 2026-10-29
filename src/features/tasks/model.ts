/**
 * M08 — model bersama untuk Habits, Dailies, dan Quests.
 *
 * File ini sengaja TIDAK mengimpor react-native. Semua yang bisa dihitung
 * tanpa piksel dihitung di sini, supaya bisa diuji dengan vitest biasa.
 * (Pelajaran M07: satu saja impor modul native di file yang dites membuat
 * seluruh file tes gagal dimuat, bukan cuma satu tes.)
 *
 * Bentuk baris mengikuti persis yang dikirim backend:
 *   api_server.py `_map_habit` / `_map_daily` / `_map_todo`.
 * Tidak ada field yang dikarang. Kalau backend menambah field, tambahkan di
 * sini dulu — jangan dibaca langsung dari payload mentah di layar.
 */

export type Difficulty = "trivial" | "easy" | "medium" | "hard" | "epic";

export const DIFFICULTIES: readonly Difficulty[] = [
  "trivial",
  "easy",
  "medium",
  "hard",
  "epic",
] as const;

export interface DifficultyMeta {
  value: Difficulty;
  /** Kunci i18n yang SUDAH ada di translations.py. */
  labelKey: string;
  /** Urutan untuk tampilan; juga dipakai menyortir chip. */
  weight: number;
}

/**
 * Kunci label diambil dari katalog yang sudah ada (`task_difficulty_*`), bukan
 * dibuat baru — P2: satu sumber kebenaran.
 */
export const DIFFICULTY_META: Record<Difficulty, DifficultyMeta> = {
  trivial: { value: "trivial", labelKey: "task_difficulty_trivial", weight: 1 },
  easy: { value: "easy", labelKey: "task_difficulty_easy", weight: 2 },
  medium: { value: "medium", labelKey: "task_difficulty_medium", weight: 3 },
  hard: { value: "hard", labelKey: "task_difficulty_hard", weight: 4 },
  epic: { value: "epic", labelKey: "task_difficulty_epic", weight: 5 },
};

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === "string" && (DIFFICULTIES as readonly string[]).includes(value);
}

/**
 * Backend sudah menormalkan difficulty, tapi cache ponsel bisa berisi baris
 * lama dari versi sebelumnya. Nilai tak dikenal -> "medium" (sama dengan
 * fallback `_map_habit`), bukan melempar dan membuat layar kosong.
 */
export function toDifficulty(raw: unknown): Difficulty {
  return isDifficulty(raw) ? raw : "medium";
}

export interface TaskBase {
  id: string;
  title: string;
  notes: string;
  folderId: string | null;
  difficulty: Difficulty;
  icon: string;
  sortOrder: number;
  createdAt: string;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asInt(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Ubah payload mentah (dari cache atau dari API) jadi baris bertipe.
 *
 * Mengembalikan null kalau `id` tidak ada: baris tanpa identitas tidak bisa
 * di-update maupun dihapus, jadi lebih baik tidak ditampilkan sama sekali
 * daripada muncul sebagai kartu yang tombolnya tidak berfungsi.
 */
export function toTaskBase(raw: unknown, defaultIcon: string): TaskBase | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = r.id === undefined || r.id === null ? "" : String(r.id);
  if (!id) return null;
  return {
    id,
    title: asString(r.title).trim(),
    notes: asString(r.notes),
    folderId: r.folderId === null || r.folderId === undefined ? null : String(r.folderId),
    difficulty: toDifficulty(r.difficulty),
    icon: asString(r.icon, defaultIcon) || defaultIcon,
    sortOrder: asInt(r.sortOrder),
    createdAt: asString(r.createdAt),
  };
}

/**
 * Urutan tampilan: `sortOrder` dulu (itu urutan yang pengguna susun sendiri di
 * desktop lewat drag & drop), lalu judul sebagai pemecah seri supaya hasilnya
 * stabil antar-render. Tanpa pemecah seri, dua baris ber-sortOrder sama bisa
 * bertukar tempat setiap kali daftar disusun ulang.
 */
export function sortTasks<T extends TaskBase>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Hari dalam seminggu dari `YYYY-MM-DD`, memakai konvensi JS `getDay()`
 * (0 = Minggu .. 6 = Sabtu).
 *
 * Konvensi ini bukan pilihan bebas: `api_server.py::_repeat_to_db` menyimpan
 * repeat_days ke DB sebagai 0=Senin..6=Minggu, lalu `_parse_repeat`
 * mengembalikannya ke API sebagai `(db + 1) % 7` — yaitu konvensi JS. Jadi
 * `row.repeatDays` yang diterima ponsel SUDAH dalam 0=Minggu. Memakai
 * `weekday()` Python di sini akan menggeser jadwal satu hari.
 *
 * `Date.UTC` dipakai supaya hasil tidak berubah karena zona waktu perangkat.
 */
export function weekdayFromYmd(ymd: string | null | undefined): number | null {
  if (typeof ymd !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCDay();
}

/** Bandingkan dua `YYYY-MM-DD`. String null dianggap paling jauh di masa depan. */
export function compareYmd(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/** Persentase 0..100 sebagai bilangan bulat. total 0 -> 0, bukan NaN. */
export function percentOf(done: number, total: number): number {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

/**
 * Terima tanggal yang diketik pengguna dan kembalikan `YYYY-MM-DD` yang sah,
 * atau null kalau tidak bisa dipakai.
 *
 * Diperiksa sungguhan, bukan cuma bentuknya: `2026-02-31` lolos regex tapi
 * bukan tanggal nyata, dan backend akan menyimpannya apa adanya lalu
 * mengacaukan pengurutan tenggat. React Native tidak punya pemilih tanggal
 * bawaan, jadi layar memakai kolom teks — artinya validasi ada di sini.
 */
export function normalizeYmd(input: string): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Date UTC menolak overflow dengan menggelinding ke bulan berikutnya, jadi
  // tanggal yang kembali berbeda dari yang diminta berarti tidak sah.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Geser tanggal `YYYY-MM-DD` sejumlah hari. null kalau masukannya tidak sah. */
export function addDaysToYmd(ymd: string, days: number): string | null {
  const base = normalizeYmd(ymd);
  if (!base) return null;
  const [y, m, d] = base.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
