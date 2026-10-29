/**
 * M07 — sesi Supabase Auth dengan aturan K17.
 *
 * K17: kredensial disimpan di Expo SecureStore (Android Keystore), dan
 * **access token hanya hidup di memori**. Alasannya: SecureStore memang
 * terenkripsi, tapi access token dipakai pada setiap permintaan dan berumur
 * pendek. Menyimpannya di disk menambah jendela pencurian tanpa menambah
 * keamanan yang berarti — yang perlu bertahan lintas restart hanyalah refresh
 * token.
 *
 * Jadi pembagiannya:
 *   refresh token -> SecureStore (terenkripsi, tahan restart)
 *   access token  -> variabel modul (hilang saat proses mati, diambil ulang)
 */

import * as SecureStore from "expo-secure-store";

const REFRESH_KEY = "craftlife.refresh_token";
const USER_KEY = "craftlife.session_user";

/** Hanya di memori. Sengaja tidak pernah ditulis ke SecureStore. */
let accessTokenInMemory: string | null = null;

export interface SessionUser {
  id: string;
  email: string | null;
}

export function getAccessToken(): string | null {
  return accessTokenInMemory;
}

export function setAccessToken(token: string | null): void {
  accessTokenInMemory = token;
}

/** Access token sengaja TIDAK ikut disimpan — hanya refresh token. */
export async function persistSession(
  refreshToken: string | null,
  user: SessionUser | null,
): Promise<void> {
  if (refreshToken && user) {
    await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  } else {
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    accessTokenInMemory = null;
  }
}

export async function loadPersistedRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_KEY);
  } catch {
    return null;
  }
}

export async function loadPersistedUser(): Promise<SessionUser | null> {
  try {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionUser>;
    if (typeof parsed.id !== "string") return null;
    return { id: parsed.id, email: parsed.email ?? null };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  accessTokenInMemory = null;
  try {
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  } catch {
    // Gagal menghapus di Keystore tidak boleh membuat logout macet; token di
    // memori sudah dibuang, dan itu yang dipakai untuk otorisasi.
  }
}

/**
 * Tes perlu memastikan access token tidak pernah bocor ke penyimpanan.
 * Fungsi ini mengekspos isi memori tanpa memberi akses tulis.
 */
export function __peekAccessTokenForTests(): string | null {
  return accessTokenInMemory;
}
