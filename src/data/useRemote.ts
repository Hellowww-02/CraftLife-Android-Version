/**
 * M08 wave 2 — hook untuk data ringkasan yang BUKAN daftar entitas.
 *
 * Health & Food dan Health logs dimuat dari satu endpoint agregat
 * (`/api/healthfood/day?date=…`) yang isinya ringkasan satu hari, bukan baris
 * yang bisa di-outbox. Jadi `useTaskList` (berbasis cache SQLite) tidak cocok.
 *
 * Yang dilakukan hook ini supaya layar tetap berguna tanpa jaringan:
 *
 *   • respons terakhir yang BERHASIL diingat di memori per path, jadi membuka
 *     ulang layar saat offline masih menampilkan data terakhir, bukan layar
 *     error kosong;
 *   • kegagalan jaringan TIDAK menghapus data yang sudah ada — hanya menandai
 *     `online: false` supaya UI memasang penanda offline.
 *
 * Batas yang jujur: ingatan ini per-proses. Setelah aplikasi ditutup dan
 * dibuka lagi tanpa jaringan, layar akan menampilkan state kosong — karena
 * memang tidak ada data lokal untuk ditampilkan, dan mengarang angka lebih
 * buruk daripada mengakui kosong.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { loadPersistedUser } from "../auth/session";
import { getAppData, resolveLocalUserId, type AppData } from "./appData";
import { errorMessage, isNetworkFailure } from "./httpApi";
import { loadRemote } from "./taskActions";

const lastGood = new Map<string, unknown>();

/** Hanya untuk tes: buang ingatan data terakhir. */
export function __clearLastGoodForTests(): void {
  lastGood.clear();
}

type Mode = "initial" | "pull" | "silent";

export interface RemoteState<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  online: boolean;
  error: string | null;
  dateKey: string | null;
  app: AppData | null;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useRemote<T>(
  path: string,
  parse: (raw: unknown) => T | null,
): RemoteState<T> {
  const [data, setData] = useState<T | null>(null);
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
        const store = await getAppData(userId);
        await store.clock.refresh();
        const result = await loadRemote<unknown>(store.api, path);
        if (!mounted.current) return;
        setApp(store);
        setDateKey(store.clock.dateKey());
        if (result.data !== null) {
          const parsed = parse(result.data);
          if (parsed !== null) {
            lastGood.set(path, result.data);
            setData(parsed);
          }
        } else {
          // Gagal: pakai data terakhir yang masih diingat, kalau ada.
          const cached = lastGood.get(path);
          if (cached !== undefined) {
            const parsed = parse(cached);
            if (parsed !== null) setData(parsed);
          }
        }
        setOnline(result.online);
        setError(result.error);
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
    [parse, path],
  );

  useEffect(() => {
    void run("initial");
  }, [run]);

  const reload = useCallback(() => run("silent"), [run]);
  const refresh = useCallback(() => run("pull"), [run]);

  return { data, loading, refreshing, online, error, dateKey, app, reload, refresh };
}
