/**
 * M08 — jalur HTTP Android + klasifikasi error.
 *
 * Dua hal yang dilakukan file ini, dan keduanya penting untuk offline-first:
 *
 * 1. Membungkus `apiGet`/`apiPost` dari `@craftlife/core` supaya React Native
 *    memakai adapter platform (base URL + token dari SecureStore), bukan
 *    `window.location` yang tidak ada di ponsel.
 *
 * 2. MEMBEDAKAN "jaringan putus" dari "server menolak".
 *    Ini bukan detail kosmetik. Kalau keduanya dianggap sama, sebuah typo yang
 *    ditolak server akan diantrekan ulang selamanya (pengguna melihat badge
 *    pending yang tidak pernah hilang), dan sebaliknya perubahan offline bisa
 *    dibuang karena dianggap ditolak. P6: jangan pernah kehilangan data.
 *
 *    Pembedanya: `fetch` menolak dengan `TypeError` saat koneksi gagal,
 *    sedangkan `@craftlife/core` melempar `Error` biasa untuk respons non-2xx.
 */

import { apiGet, apiPost } from "@craftlife/core";

export interface ApiCalls {
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
}

export const liveApi: ApiCalls = {
  get: <T,>(path: string) => apiGet<T>(path),
  post: <T,>(path: string, body?: unknown) => apiPost<T>(path, body),
};

/** Pesan khas kegagalan koneksi di React Native / Node / browser. */
const NETWORK_HINTS = [
  "network request failed",
  "failed to fetch",
  "networkerror",
  "econnrefused",
  "enotfound",
  "econnreset",
  "etimedout",
  "the internet connection appears to be offline",
] as const;

/**
 * true = koneksi yang gagal (layak dicoba ulang / diantrekan).
 * false = server menjawab dan menolak (percuma diulang apa adanya).
 */
export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lowered = message.toLowerCase();
  return NETWORK_HINTS.some((hint) => lowered.includes(hint));
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error ?? "unknown");
}

/**
 * Rute daftar per tipe entitas.
 *
 * Kuncinya harus sama dengan `entity_type` yang dipakai outbox dan cache, dan
 * namanya mengikuti backend: habits/dailies dipakai apa adanya, sedangkan
 * todos dibaca dari field `quests` karena `_api_daily_reset` mengemas tabel
 * `todos` ke dalam key itu (`api_server.py:709`).
 */
export const ENTITY_LIST_ROUTES: Record<
  string,
  { path: string; field: string }
> = {
  habits: { path: "/api/habits", field: "habits" },
  dailies: { path: "/api/dailies", field: "dailies" },
  todos: { path: "/api/todos", field: "quests" },
  // M08 wave 2. Nama field-nya mengikuti backend: sport dikemas sebagai
  // `sportLogs` dan economy sebagai `transactions` (`life_api.py:827,909`).
  sport: { path: "/api/sport", field: "sportLogs" },
  economy: { path: "/api/economy", field: "transactions" },
  // M08 wave 3. Nama field-nya lagi-lagi mengikuti backend, bukan tebakan:
  // supplies dikemas sebagai `items` (`life_api.py:955`), pomodoro sebagai
  // `pomodoroSessions` (`:932`).
  supplies: { path: "/api/supplies", field: "items" },
  notes: { path: "/api/notes", field: "notes" },
  reminders: { path: "/api/reminders", field: "reminders" },
  pomodoro: { path: "/api/pomodoro", field: "pomodoroSessions" },
};

export function isListableEntity(entityType: string): boolean {
  return Object.prototype.hasOwnProperty.call(ENTITY_LIST_ROUTES, entityType);
}

/**
 * `RemoteSource` yang berbicara dengan API desktop yang sudah ada.
 *
 * Batas yang jujur: endpoint daftar backend mengembalikan SELURUH baris, bukan
 * perubahan sejak watermark. Jadi `since` diterima tapi tidak dipakai, dan
 * `watermark` dikembalikan null supaya tidak ada yang mengira refresh ini
 * bersifat incremental. Untuk ukuran data satu pengguna (puluhan sampai
 * ratusan baris) ini murah; kalau nanti backend menyediakan endpoint delta,
 * hanya file ini yang berubah.
 */
export function httpRemoteSource(api: ApiCalls = liveApi) {
  return {
    async list(
      _localUserId: number,
      entityType: string,
      _since: string | null,
    ): Promise<{
      rows: Array<{
        entityLocalId: string;
        payload: unknown;
        serverUpdatedAt: string | null;
      }>;
      watermark: string | null;
    }> {
      const route = ENTITY_LIST_ROUTES[entityType];
      if (!route) {
        throw new Error(`entity type tidak punya rute daftar: ${entityType}`);
      }
      const data = (await api.get<Record<string, unknown>>(route.path)) ?? {};
      const list = data[route.field];
      if (!Array.isArray(list)) return { rows: [], watermark: null };
      const rows: Array<{
        entityLocalId: string;
        payload: unknown;
        serverUpdatedAt: string | null;
      }> = [];
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const id = (item as Record<string, unknown>).id;
        if (id === undefined || id === null) continue;
        rows.push({ entityLocalId: String(id), payload: item, serverUpdatedAt: null });
      }
      return { rows, watermark: null };
    },
  };
}
