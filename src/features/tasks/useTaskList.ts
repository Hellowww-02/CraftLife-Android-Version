/**
 * M08 — hook bersama untuk layar yang membaca daftar dari cache.
 *
 * Semua layar Wave 1 butuh siklus yang sama: muat cache -> coba segarkan dari
 * server -> tampilkan apa pun yang ada, plus penanda kalau jaringannya gagal.
 * Kalau tiap layar menulis siklus ini sendiri, perbedaannya kecil tapi
 * mematikan (satu layar lupa menampilkan penanda offline, layar lain menampilkan
 * spinner selamanya). Jadi ditulis sekali di sini.
 *
 * `parse` HARUS fungsi tingkat modul (stabil antar-render). Kalau dibuat
 * inline di dalam komponen, ia jadi objek baru tiap render dan efek akan
 * berjalan ulang tanpa henti.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { loadPersistedUser } from "../../auth/session";
import { getAppData, resolveLocalUserId, type AppData } from "../../data/appData";
import { errorMessage, isNetworkFailure } from "../../data/httpApi";
import { loadEntity } from "../../data/taskActions";

type Mode = "initial" | "pull" | "silent";

export interface TaskListState<T> {
  rows: T[];
  loading: boolean;
  refreshing: boolean;
  online: boolean;
  error: string | null;
  /** null = jam server belum pernah diterima. Layar tidak boleh menebak. */
  dateKey: string | null;
  app: AppData | null;
  /** Baca ulang dari cache saja. Dipakai setelah sebuah tulisan berhasil. */
  reload: () => Promise<void>;
  /** Tarik-untuk-menyegarkan: cache lalu jaringan. */
  refresh: () => Promise<void>;
}

export function useTaskList<T>(
  entityType: string,
  parse: (raw: unknown[]) => T[],
): TaskListState<T> {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [app, setApp] = useState<AppData | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (mode: Mode) => {
      if (mode === "initial") setLoading(true);
      if (mode === "pull") setRefreshing(true);
      try {
        const userId = await resolveLocalUserId(undefined, loadPersistedUser);
        const data = await getAppData(userId);
        // Jam server disegarkan lebih dulu: tanpa base, `dateKey()` null dan
        // layar tidak bisa memutuskan "hari ini".
        await data.clock.refresh();
        const result = await loadEntity<unknown>(data.repo, entityType);
        if (!mounted.current) return;
        setApp(data);
        setRows(parse(result.rows as unknown[]));
        setOnline(result.online);
        setError(result.error);
        setDateKey(data.clock.dateKey());
      } catch (err) {
        if (!mounted.current) return;
        setError(errorMessage(err));
        setOnline(!isNetworkFailure(err));
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [entityType, parse],
  );

  useEffect(() => {
    void run("initial");
  }, [run]);

  const reload = useCallback(() => run("silent"), [run]);
  const refresh = useCallback(() => run("pull"), [run]);

  return { rows, loading, refreshing, online, error, dateKey, app, reload, refresh };
}
