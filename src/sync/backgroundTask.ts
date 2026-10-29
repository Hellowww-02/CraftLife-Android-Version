/**
 * M07 — drain di latar lewat WorkManager.
 *
 * `expo-background-fetch` di Android diterjemahkan ke WorkManager. Yang penting
 * ada di sini adalah CONSTRAINT-nya: pekerjaan hanya dijalankan saat jaringan
 * tersedia dan perangkat tidak dalam mode hemat baterai. Tanpa itu, OS akan
 * membatalkan tugasnya dan sinkronisasi jadi tidak bisa diprediksi.
 *
 * Tugas ini TIDAK memutuskan sendiri apakah boleh mengirim — `SyncService`
 * tetap memeriksa probe sebelum drain. Constraint di sini hanya mencegah OS
 * membangunkan aplikasi tanpa alasan.
 */

import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

export const SYNC_TASK_NAME = "craftlife-sync-drain";

/**
 * Didefinisikan di lingkup module, bukan di dalam komponen.
 *
 * Ini syarat expo-task-manager: tugas harus terdaftar sebelum aplikasi sempat
 * membangunkannya di latar, dan pendaftaran di dalam komponen berarti tugas
 * tidak ada sampai layar itu dibuka.
 */
export function defineSyncTask(runDrain: () => Promise<void>): void {
  TaskManager.defineTask(SYNC_TASK_NAME, async () => {
    try {
      await runDrain();
      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch {
      // Mengembalikan Failed membuat WorkManager memakai backoff-nya sendiri.
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

/** Interval minimum yang diizinkan Android untuk background fetch: 15 menit. */
export const MIN_BACKGROUND_INTERVAL_MS = 15 * 60 * 1000;

export async function registerBackgroundSync(intervalMs = MIN_BACKGROUND_INTERVAL_MS): Promise<void> {
  const registered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK_NAME);
  if (registered) return;
  await BackgroundFetch.registerTaskAsync(SYNC_TASK_NAME, {
    // Android menolak interval di bawah 15 menit; memaksa nilai lebih kecil
    // membuat pendaftaran gagal senyap.
    minimumInterval: Math.max(MIN_BACKGROUND_INTERVAL_MS, intervalMs) / 1000,
    stopOnTerminate: false,
    startOnBoot: true,
  });
}

export async function unregisterBackgroundSync(): Promise<void> {
  const registered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK_NAME);
  if (registered) await BackgroundFetch.unregisterTaskAsync(SYNC_TASK_NAME);
}
