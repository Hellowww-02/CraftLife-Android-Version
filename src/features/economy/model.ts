/**
 * M08 wave 2 — model layar Economy.
 *
 * Sumber bentuk data: `life_api.py::map_tx` dan `GET /api/economy`.
 *
 * ATURAN MATA UANG — bagian yang paling mudah salah, jadi ditulis panjang:
 *
 *   • Database SELALU menyimpan IDR. `map_tx` mengirim angka IDR apa adanya
 *     (tidak ada `convert_from_idr` di `life_api.py`).
 *   • Untuk MENAMPILKAN, angka IDR diberikan ke `formatMoney(amountIdr,
 *     currency)` — fungsi itu yang mengonversi ke mata uang pengguna. Jadi
 *     jangan mengonversi sendiri sebelumnya, atau konversinya terjadi dua kali.
 *   • Untuk MENYIMPAN, yang dikirim adalah angka yang DIKETIK pengguna dalam
 *     mata uang aktifnya; `life_api.py::_to_idr` yang mengubahnya ke IDR.
 *     Mengirim IDR mentah akan membuat nominal salah berlipat setiap kali
 *     mata uang pengguna bukan IDR.
 *
 * Semua uang lewat `formatMoney` dari `@craftlife/core` — wajib (P2, dan
 * disebut eksplisit di aturan M08 roadmap).
 */

import { formatMoney, parseMoneyInput } from "@craftlife/core";

export type TxType = "income" | "expense";

export interface TxRow {
  id: string;
  type: TxType;
  name: string;
  category: string;
  /** IDR, apa adanya dari database. */
  amountIdr: number;
  date: string;
  notes: string;
  icon: string;
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

export function toTxRow(raw: unknown): TxRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = r.id === undefined || r.id === null ? "" : String(r.id);
  if (!id) return null;
  return {
    id,
    type: r.type === "income" ? "income" : "expense",
    name: typeof r.name === "string" && r.name !== "" ? r.name : typeof r.category === "string" ? r.category : "",
    category: typeof r.category === "string" ? r.category : "",
    amountIdr: num(r.amount),
    date: typeof r.date === "string" && r.date !== "" ? r.date.slice(0, 10) : "",
    notes: typeof r.notes === "string" ? r.notes : "",
    icon: typeof r.icon === "string" && r.icon !== "" ? r.icon : "💰",
  };
}

export function toTxRows(rawList: unknown): TxRow[] {
  if (!Array.isArray(rawList)) return [];
  const out: TxRow[] = [];
  for (const raw of rawList) {
    const row = toTxRow(raw);
    if (row) out.push(row);
  }
  // Terbaru di atas. Tanggal sama -> id menurun, sebagai pemecah seri supaya
  // urutan stabil antar-render (id backend naik berurutan).
  return out.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return Number(b.id) - Number(a.id);
  });
}

export interface TxTotals {
  incomeIdr: number;
  expenseIdr: number;
  netIdr: number;
}

export function txTotals(rows: readonly TxRow[]): TxTotals {
  let incomeIdr = 0;
  let expenseIdr = 0;
  for (const row of rows) {
    if (row.type === "income") incomeIdr += row.amountIdr;
    else expenseIdr += row.amountIdr;
  }
  return { incomeIdr, expenseIdr, netIdr: incomeIdr - expenseIdr };
}

/** Format uang: satu-satunya jalan yang diizinkan (P2). */
export function money(amountIdr: number, currency: string): string {
  return formatMoney(amountIdr, currency);
}

export type PeriodKey = "7" | "30" | "90" | "all";

export const PERIOD_LABEL_KEY: Record<PeriodKey, string> = {
  "7": "economy_period_7d",
  "30": "economy_period_30d",
  "90": "economy_period_90d",
  all: "economy_filter_all",
};

/**
 * Saring transaksi menurut rentang hari, memakai tanggal SERVER.
 *
 * `todayKey` null (jam server belum tersedia) diperlakukan sebagai "all":
 * menyaring dengan tanggal tebakan perangkat bisa menyembunyikan transaksi
 * hari ini, dan kehilangan uang dari tampilan jauh lebih buruk daripada
 * menampilkan sedikit lebih banyak.
 */
export function filterByPeriod(
  rows: readonly TxRow[],
  period: PeriodKey,
  todayKey: string | null,
): TxRow[] {
  if (period === "all" || todayKey === null) return [...rows];
  const days = Number.parseInt(period, 10);
  if (!Number.isFinite(days)) return [...rows];
  const cutoff = shiftYmd(todayKey, -(days - 1));
  if (cutoff === null) return [...rows];
  return rows.filter((row) => row.date !== "" && row.date >= cutoff);
}

/** Geser `YYYY-MM-DD` sejumlah hari. null kalau masukannya tidak sah. */
export function shiftYmd(ymd: string, days: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export interface TxDateGroup {
  date: string;
  rows: TxRow[];
  netIdr: number;
}

export function groupByDate(rows: readonly TxRow[]): TxDateGroup[] {
  const map = new Map<string, TxRow[]>();
  for (const row of rows) {
    const key = row.date || "—";
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.entries()].map(([date, list]) => ({
    date,
    rows: list,
    netIdr: txTotals(list).netIdr,
  }));
}

/** Kategori cepat. Kuncinya memakai katalog `economy_icon_*` yang sudah ada. */
export const QUICK_CATEGORIES: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: "food", labelKey: "economy_icon_food" },
  { value: "transport", labelKey: "economy_icon_transport" },
  { value: "shopping", labelKey: "economy_icon_shopping" },
  { value: "health", labelKey: "economy_icon_health" },
  { value: "education", labelKey: "economy_icon_education" },
  { value: "entertainment", labelKey: "economy_icon_entertainment" },
  { value: "salary", labelKey: "economy_icon_salary" },
  { value: "other", labelKey: "economy_category_label" },
] as const;

export interface TxDraft {
  name: string;
  type: TxType;
  /** Dalam mata uang aktif pengguna — BUKAN IDR. Lihat komentar di atas. */
  amountInput: string;
  category: string;
  date: string | null;
  notes: string;
}

export function emptyTxDraft(): TxDraft {
  return {
    name: "",
    type: "expense",
    amountInput: "",
    category: "other",
    date: null,
    notes: "",
  };
}

/**
 * `parseMoneyInput` dari core yang dipakai, bukan `parseFloat` sendiri: ia
 * sudah menangani pemisah ribuan/desimal gaya EN ("1,234.56") maupun ID
 * ("1.234.567,89"). Menulis parser kedua di sini akan berbeda perilakunya
 * untuk salah satu dari keduanya.
 */
export function draftAmount(draft: TxDraft): number | null {
  return parseMoneyInput(draft.amountInput);
}

export function draftError(draft: TxDraft): "empty-name" | "bad-amount" | null {
  if (draft.name.trim() === "") return "empty-name";
  const amount = draftAmount(draft);
  if (amount === null || amount <= 0) return "bad-amount";
  return null;
}

/** Payload `POST /api/economy`. Nominal dikirim dalam mata uang pengguna. */
export function txPayload(draft: TxDraft): Record<string, unknown> {
  const amount = draftAmount(draft);
  return {
    name: draft.name.trim(),
    type: draft.type,
    amount: amount ?? 0,
    category: draft.category,
    ...(draft.date ? { date: draft.date } : {}),
    notes: draft.notes,
  };
}
