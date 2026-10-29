/**
 * M08 wave 3 — model layar Supplies (stok barang).
 *
 * Sumber bentuk data: `life_api.py::map_supply` dan `GET /api/supplies`
 * (yang mengembalikan `{ok, items, categories}`).
 *
 * ATURAN HARGA — sama persis dengan Economy, dan sama mudahnya salah:
 *   • `map_supply` mengirim `price` sebagai IDR apa adanya.
 *   • MENAMPILKAN lewat `formatMoney(priceIdr, currency)`.
 *   • MENYIMPAN mengirim angka dalam mata uang pengguna; `_to_idr` di
 *     `life_api.py` yang mengonversinya.
 * Stok (`stock`, `minStock`) dan kuantitas transaksi TIDAK ikut aturan ini —
 * keduanya jumlah barang, bukan uang.
 */

export interface SupplyRow {
  id: string;
  name: string;
  category: string;
  unit: string;
  stock: number;
  minStock: number;
  /** IDR, apa adanya dari database. */
  priceIdr: number;
  location: string;
  notes: string;
}

export interface SupplyCategory {
  name: string;
  count: number;
  /** IDR. */
  valueIdr: number;
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function toSupplyRow(raw: unknown): SupplyRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = r.id === undefined || r.id === null ? "" : String(r.id);
  if (!id) return null;
  return {
    id,
    name: str(r.name),
    category: str(r.category),
    unit: str(r.unit, "pcs") || "pcs",
    stock: num(r.stock),
    minStock: num(r.minStock),
    priceIdr: num(r.price),
    location: str(r.location),
    notes: str(r.notes),
  };
}

export function toSupplyRows(rawList: unknown): SupplyRow[] {
  if (!Array.isArray(rawList)) return [];
  const out: SupplyRow[] = [];
  for (const raw of rawList) {
    const row = toSupplyRow(raw);
    if (row) out.push(row);
  }
  // Nama A–Z. Daftar stok dipakai untuk mencari barang, bukan untuk dibaca
  // berurutan waktu, jadi alfabetis lebih bisa diprediksi daripada "terbaru".
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function toSupplyCategories(rawList: unknown): SupplyCategory[] {
  if (!Array.isArray(rawList)) return [];
  const out: SupplyCategory[] = [];
  for (const raw of rawList) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = str(r.name);
    if (!name) continue;
    out.push({ name, count: Math.round(num(r.count)), valueIdr: num(r.value) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export type StockState = "out" | "low" | "ok";

/**
 * "Habis" dan "menipis" dibedakan karena aksinya berbeda: habis berarti harus
 * beli, menipis berarti mulai direncanakan. Menyatukannya membuat daftar
 * peringatan kehilangan urgensinya.
 *
 * `minStock <= 0` berarti pengguna sengaja tidak memasang batas, jadi barang
 * itu tidak pernah dianggap menipis — selama masih ada isinya.
 */
export function stockState(row: SupplyRow): StockState {
  if (row.stock <= 0) return "out";
  if (row.minStock > 0 && row.stock <= row.minStock) return "low";
  return "ok";
}

export function lowStockRows(rows: readonly SupplyRow[]): SupplyRow[] {
  return rows.filter((row) => stockState(row) !== "ok");
}

export interface SupplyTotals {
  items: number;
  outCount: number;
  lowCount: number;
  /** IDR: total nilai stok = Σ stock × price. */
  stockValueIdr: number;
}

export function supplyTotals(rows: readonly SupplyRow[]): SupplyTotals {
  let outCount = 0;
  let lowCount = 0;
  let stockValueIdr = 0;
  for (const row of rows) {
    const state = stockState(row);
    if (state === "out") outCount += 1;
    else if (state === "low") lowCount += 1;
    stockValueIdr += row.stock * row.priceIdr;
  }
  return { items: rows.length, outCount, lowCount, stockValueIdr };
}

/** Semua kategori yang muncul di data, untuk dipakai sebagai pilihan chip. */
export function categoryNames(rows: readonly SupplyRow[]): string[] {
  const set = new Set<string>();
  for (const row of rows) if (row.category !== "") set.add(row.category);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function filterSupplies(
  rows: readonly SupplyRow[],
  search: string,
  category: string | null,
  onlyLow: boolean,
): SupplyRow[] {
  const needle = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (category !== null && row.category !== category) return false;
    if (onlyLow && stockState(row) === "ok") return false;
    if (needle === "") return true;
    return (
      row.name.toLowerCase().includes(needle) ||
      row.location.toLowerCase().includes(needle) ||
      row.notes.toLowerCase().includes(needle)
    );
  });
}

// ── Draf tambah / ubah ──────────────────────────────────────────────────────

export interface SupplyDraft {
  id: string | null;
  name: string;
  category: string;
  unit: string;
  stock: number;
  minStock: number;
  /** Dalam mata uang pengguna, bukan IDR. */
  priceInput: string;
  location: string;
  notes: string;
}

export function emptySupplyDraft(): SupplyDraft {
  return {
    id: null,
    name: "",
    category: "",
    unit: "pcs",
    stock: 0,
    minStock: 0,
    priceInput: "",
    location: "",
    notes: "",
  };
}

export function draftFromRow(row: SupplyRow, priceText: string): SupplyDraft {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    stock: row.stock,
    minStock: row.minStock,
    priceInput: priceText,
    location: row.location,
    notes: row.notes,
  };
}

export function draftError(draft: SupplyDraft): "empty-name" | "bad-stock" | null {
  if (draft.name.trim() === "") return "empty-name";
  if (!Number.isFinite(draft.stock) || draft.stock < 0) return "bad-stock";
  if (!Number.isFinite(draft.minStock) || draft.minStock < 0) return "bad-stock";
  return null;
}

/**
 * Payload `POST /api/supplies` dan `POST /api/supplies/:id/update`.
 *
 * Backend menerima `minStock` atau `min_stock`; dipakai yang camelCase karena
 * itu yang dikirim web UI. `price` dibiarkan dalam mata uang pengguna.
 */
export function supplyPayload(draft: SupplyDraft, priceValue: number): Record<string, unknown> {
  return {
    name: draft.name.trim(),
    category: draft.category.trim(),
    unit: draft.unit.trim() || "pcs",
    stock: Math.max(0, draft.stock),
    minStock: Math.max(0, draft.minStock),
    price: priceValue,
    location: draft.location.trim(),
    notes: draft.notes,
  };
}

// ── Transaksi stok ──────────────────────────────────────────────────────────

export type TxKind = "in" | "out";

export interface SupplyTxDraft {
  row: SupplyRow;
  kind: TxKind;
  qty: number;
  note: string;
  /** Kalau true, backend sekaligus mencatat transaksi di Economy. */
  logEconomy: boolean;
  /** Dalam mata uang pengguna. */
  economyAmountInput: string;
  economyCategory: string;
}

export function txDraftFor(row: SupplyRow, kind: TxKind): SupplyTxDraft {
  return {
    row,
    kind,
    // Default jumlah = stok sekarang untuk "keluar" dan 1 untuk "masuk":
    // keduanya tebakan yang paling sering benar, dan tetap bisa diubah.
    qty: kind === "out" ? Math.max(1, row.stock) : 1,
    note: "",
    logEconomy: false,
    economyAmountInput: "",
    economyCategory: "Supplies",
  };
}

export function txError(draft: SupplyTxDraft): "bad-qty" | "over-stock" | null {
  if (!Number.isFinite(draft.qty) || draft.qty <= 0) return "bad-qty";
  // Stok negatif tidak punya arti fisik. Backend tidak menolaknya, jadi
  // penjaganya di sini.
  if (draft.kind === "out" && draft.row.stock - draft.qty < 0) return "over-stock";
  return null;
}

export function supplyTxPayload(draft: SupplyTxDraft, economyAmount: number): Record<string, unknown> {
  return {
    kind: draft.kind,
    qty: Math.max(0, draft.qty),
    note: draft.note,
    ...(draft.logEconomy
      ? { logEconomy: true, economyAmount, economyCategory: draft.economyCategory }
      : {}),
  };
}

/** Stok hasil sebuah transaksi, untuk optimistic update di cache. */
export function applyTx(row: SupplyRow, kind: TxKind, qty: number): SupplyRow {
  const next = kind === "in" ? row.stock + qty : row.stock - qty;
  return { ...row, stock: Math.max(0, Math.round(next * 1000) / 1000) };
}

export interface SupplyHistoryRow {
  id: string;
  itemId: string;
  itemName: string;
  kind: string;
  qty: number;
  note: string;
  createdAt: string;
}

export function toSupplyHistory(rawList: unknown): SupplyHistoryRow[] {
  if (!Array.isArray(rawList)) return [];
  const out: SupplyHistoryRow[] = [];
  for (const raw of rawList) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const id = r.id === undefined || r.id === null ? "" : String(r.id);
    if (!id) continue;
    out.push({
      id,
      itemId: r.itemId === undefined || r.itemId === null ? "" : String(r.itemId),
      itemName: str(r.itemName),
      kind: str(r.kind, "in"),
      qty: num(r.qty),
      note: str(r.note),
      createdAt: str(r.createdAt).slice(0, 16).replace("T", " "),
    });
  }
  return out;
}
