/**
 * Alamat server yang bisa diubah saat runtime — "satu APK untuk semua orang".
 *
 * Sebelumnya `EXPO_PUBLIC_API_BASE` dibakar ke bundle saat build, sehingga
 * setiap pengguna butuh APK dengan alamatnya sendiri (bukan produk, tapi
 * prototype). Sekarang alamat disimpan di SecureStore dan DIBACA setiap kali
 * permintaan dikirim (`apiBase: () => getServerAddress()` di adapter), jadi
 * satu APK bisa dipakai siapa pun: cukup isi alamat server di Settings.
 *
 * Urutan nilai: override pengguna (SecureStore) → alamat bawaan build
 * (`EXPO_PUBLIC_API_BASE`). Fungsi murni `normalizeServerAddress` dipisah
 * supaya bisa diuji tanpa SecureStore.
 */

import * as SecureStore from "expo-secure-store";

const STORAGE_KEY = "craftlife_api_base";

/** Alamat bawaan dari build (mis. http://10.0.2.2:8765 untuk emulator). */
let defaultBase = "";
/** Nilai yang dipilih penguna; null = masih memakai bawaan. */
let override: string | null = null;

/**
 * Normalisasi & validasi alamat server.
 * Mengembalikan alamat bersih (tanpa trailing slash) atau null bila tidak sah.
 */
export function normalizeServerAddress(raw: string): string | null {
  const value = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s/]+(?::\d{1,5})?(?:\/[^\s]*)?$/i.test(value)) return null;
  return value;
}

/** Dipanggil sekali saat aplikasi dimulai (setelah `configureApiAdapter`). */
export function initServerAddress(fallback: string): void {
  defaultBase = fallback.replace(/\/+$/, "");
  // Dibaca asinkron; sampai selesai, `getServerAddress()` memakai bawaan —
  // permintaan pertama praktis selalu terjadi setelah pembacaan ini selesai.
  void SecureStore.getItemAsync(STORAGE_KEY).then((saved) => {
    if (saved && override === null) override = saved;
  });
}

/** Alamat yang dipakai SEKARANG untuk setiap permintaan. */
export function getServerAddress(): string {
  return override ?? defaultBase;
}

/** Alamat bawaan build (untuk tombol "kembalikan"). */
export function getDefaultServerAddress(): string {
  return defaultBase;
}

/** Simpan pilihan penguna. Mengembalikan false bila format tidak sah. */
export async function setServerAddress(raw: string): Promise<boolean> {
  const normalized = normalizeServerAddress(raw);
  if (!normalized) return false;
  override = normalized;
  await SecureStore.setItemAsync(STORAGE_KEY, normalized);
  return true;
}

/** Kembalikan ke alamat bawaan build. */
export async function clearServerAddress(): Promise<void> {
  override = null;
  await SecureStore.deleteItemAsync(STORAGE_KEY);
}

/** Tes koneksi sederhana: GET {alamat}/api/clock harus menjawab. */
export async function testServerAddress(raw: string, timeoutMs = 5000): Promise<boolean> {
  const normalized = normalizeServerAddress(raw);
  if (!normalized) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${normalized}/api/clock`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}
