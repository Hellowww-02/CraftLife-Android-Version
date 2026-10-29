/**
 * M08 — perakitan lapisan data aplikasi.
 *
 * Satu tempat yang membuka database, menyusun cache + outbox + repository, dan
 * memegang jam server. Layar tidak boleh merakit sendiri: kalau tiap layar
 * membuka koneksi SQLite sendiri, skema akan dieksekusi berkali-kali dan
 * antrean sync bisa punya dua penulis yang tidak saling tahu.
 *
 * File ini TIDAK diuji unit karena mengimpor `expo-sqlite` (modul native).
 * Logika yang bisa diuji sudah dipisah ke `identity.ts`, `repository.ts`,
 * `httpApi.ts`, dan `taskActions.ts`.
 */

import * as SQLite from "expo-sqlite";

import { SCHEMA_SQL } from "../db/schema";
import { Outbox } from "../sync/outbox";
import { DB_NAME, SqliteOutboxStore } from "../sync/sqliteStore";
import { EntityCache, Watermarks } from "./cache";
import { liveApi, httpRemoteSource, type ApiCalls } from "./httpApi";
import { ANONYMOUS_LOCAL_USER_ID, localUserIdFrom } from "./identity";
import { Repository } from "./repository";
import { ServerClock } from "./serverClock";

interface Stores {
  db: SQLite.SQLiteDatabase;
  cache: EntityCache;
  watermarks: Watermarks;
  outbox: Outbox;
  clock: ServerClock;
  api: ApiCalls;
}

export interface AppData extends Stores {
  localUserId: number;
  repo: Repository;
}

let storesPromise: Promise<Stores> | null = null;
const repos = new Map<number, Repository>();

async function openStores(): Promise<Stores> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  const outboxStore = await SqliteOutboxStore.fromDatabase(db, SCHEMA_SQL);
  return {
    db,
    cache: new EntityCache(db),
    watermarks: new Watermarks(db),
    outbox: new Outbox(outboxStore),
    clock: new ServerClock(),
    api: liveApi,
  };
}

export async function getAppData(
  localUserId: number = ANONYMOUS_LOCAL_USER_ID,
): Promise<AppData> {
  const stores = storesPromise ?? (storesPromise = openStores());
  const s = await stores;
  let repo = repos.get(localUserId);
  if (!repo) {
    repo = new Repository({
      cache: s.cache,
      watermarks: s.watermarks,
      outbox: s.outbox,
      remote: httpRemoteSource(s.api),
      localUserId,
    });
    repos.set(localUserId, repo);
  }
  return { ...s, localUserId, repo };
}

let resolvedUserId: number | null = null;

/**
 * Tentukan `local_user_id` untuk sesi ini.
 *
 * Urutan: sesi yang tersimpan dulu (cepat, tanpa jaringan), lalu `/api/me`
 * kalau sesi tidak memberi id angka. Kalau keduanya gagal — misalnya aplikasi
 * baru dipasang dan belum login — hasilnya 0 (ruang anonim), bukan NaN.
 */
export async function resolveLocalUserId(
  api: ApiCalls = liveApi,
  loadSessionUser: () => Promise<{ id: string } | null>,
): Promise<number> {
  if (resolvedUserId !== null) return resolvedUserId;
  try {
    const fromSession = await loadSessionUser();
    const id = localUserIdFrom(fromSession?.id);
    if (id !== ANONYMOUS_LOCAL_USER_ID) {
      resolvedUserId = id;
      return id;
    }
  } catch {
    // sesi belum ada; lanjut ke /api/me
  }
  try {
    const me = await api.get<{ user?: { id?: unknown } }>("/api/me");
    const id = localUserIdFrom(me?.user?.id);
    resolvedUserId = id;
    return id;
  } catch {
    resolvedUserId = ANONYMOUS_LOCAL_USER_ID;
    return ANONYMOUS_LOCAL_USER_ID;
  }
}

/** Hanya untuk tes/perpindahan akun: buang ingatan id sesi. */
export function __resetAppDataForTests(): void {
  resolvedUserId = null;
  repos.clear();
}
