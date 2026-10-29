/**
 * M08 — protokol tulis untuk layar task.
 *
 * Ini jawaban atas pertanyaan "apa yang terjadi kalau pengguna menekan tombol
 * selesaikan di dalam kereta tanpa sinyal?". Urutannya:
 *
 *   1. Cache ponsel diubah SEGERA, jadi UI bereaksi dalam milidetik.
 *   2. Perubahan dikirim ke server.
 *   3. Kalau koneksi gagal  -> perubahan DIANTREKAN di outbox (akan dikirim
 *      saat online). Data tidak hilang. Ini P6 dan P1 sekaligus.
 *   4. Kalau server MENOLAK -> cache dikembalikan seperti semula, dan
 *      pengguna diberi tahu. Perubahan yang ditolak server tidak boleh
 *      diantrekan: ia akan gagal lagi selamanya dan membuat badge pending
 *      yang tidak pernah hilang.
 *
 * Tanpa langkah 4 layar terlihat berhasil padahal server tidak menyimpan apa
 * pun — itu persis "fitur palsu" yang dilarang brief.
 */

import type { Repository } from "./repository";
import { errorMessage, isNetworkFailure, type ApiCalls } from "./httpApi";
import { liveApi } from "./httpApi";

export type WriteOutcome =
  | { kind: "synced" }
  | { kind: "queued"; reason: string }
  | { kind: "failed"; reason: string };

export interface TaskWrite {
  /** Rute backend, mis. `/api/habits/12/complete`. */
  path: string;
  body: Record<string, unknown>;
  /** Kunci `entity_type` yang sama dengan yang dipakai cache dan outbox. */
  entityType: string;
  entityId: string;
  /** Bentuk baris setelah aksi. `null` = baris dihapus. */
  nextPayload: unknown | null;
  /** Bentuk baris sebelum aksi. `null` = sebelumnya tidak ada. */
  previousPayload: unknown | null;
}

export interface WriteDeps {
  api: ApiCalls;
  repo: Repository;
}

export async function writeTask(
  deps: WriteDeps,
  write: TaskWrite,
): Promise<WriteOutcome> {
  const { api, repo } = deps;

  // 1. Optimistic: cache lebih dulu.
  if (write.nextPayload === null) {
    await repo.evict(write.entityType, write.entityId);
  } else {
    await repo.cacheOnly(write.entityType, write.entityId, write.nextPayload);
  }

  // 2. Kirim ke server.
  try {
    await api.post(write.path, write.body);
    return { kind: "synced" };
  } catch (error) {
    // 3. Jaringan gagal: antrekan. `repo.upsert`/`repo.remove` menulis cache
    //    lagi (idempoten) lalu menambahkan baris outbox.
    if (isNetworkFailure(error)) {
      if (write.nextPayload === null) {
        await repo.remove(write.entityType, write.entityId);
      } else {
        await repo.upsert(write.entityType, write.entityId, write.nextPayload);
      }
      return { kind: "queued", reason: errorMessage(error) };
    }

    // 4. Server menolak: kembalikan cache, laporkan.
    await repo.rollback(write.entityType, write.entityId, write.previousPayload);
    return { kind: "failed", reason: errorMessage(error) };
  }
}

export interface LoadResult<T> {
  rows: T[];
  isEmpty: boolean;
  /** false = penyegaran dari server gagal; layar tetap menampilkan cache. */
  online: boolean;
  error: string | null;
}

/**
 * Baca layar: cache dulu (instan, dan tetap bekerja tanpa jaringan), lalu
 * coba segarkan dari server.
 *
 * Kegagalan refresh TIDAK membuat layar kosong atau error penuh — data cache
 * tetap ditampilkan, dan `online: false` memberi tahu UI untuk memasang
 * penanda offline. Menampilkan layar error saat sebenarnya ada data valid di
 * ponsel adalah regresi terhadap P1.
 */
export async function loadEntity<T>(
  repo: Repository,
  entityType: string,
): Promise<LoadResult<T>> {
  const cached = await repo.read<T>(entityType);
  let online = true;
  let error: string | null = null;
  try {
    await repo.refresh(entityType);
  } catch (err) {
    online = false;
    error = errorMessage(err);
  }
  const rows = online ? (await repo.read<T>(entityType)).rows : cached.rows;
  return { rows, isEmpty: rows.length === 0, online, error };
}

/**
 * Muat satu objek JSON dari server tanpa menyentuh cache.
 * Untuk data yang tidak di-outbox (dashboard summary, /api/me, katalog).
 */
export async function loadRemote<T>(api: ApiCalls = liveApi, path: string): Promise<{
  data: T | null;
  error: string | null;
  online: boolean;
}> {
  try {
    const data = await api.get<T>(path);
    return { data: data ?? null, error: null, online: true };
  } catch (err) {
    return { data: null, error: errorMessage(err), online: !isNetworkFailure(err) };
  }
}
