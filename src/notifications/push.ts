/**
 * M10 — registrasi token push (FCM) lewat Supabase.
 *
 * Alurnya: ponsel meminta token perangkat ke sistem (expo-notifications),
 * token dikirim ke server desktop (`POST /api/cloud/push-token`), server
 * mencatatnya di tabel Supabase `device_push_tokens`, dan Edge Function
 * `send-push` memanggil FCM saat ada notifikasi sosial. Supabase adalah
 * "kantor pos"-nya; FCM kurir yang boleh membangunkan aplikasi tertutup.
 *
 * Token perangkat hanya lahir bila aplikasi punya `google-services.json`
 * dari Firebase Console pemilik proyek. Bila file itu belum ada, fungsi
 * ini berhenti diam-diam dan mengembalikan false — aplikasi tetap jalan,
 * hanya push jarak jauh yang belum aktif. Tidak ada kredensial Firebase
 * yang disimpan di kode ini.
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { AppData } from "../data/appData";

export async function registerPushToken(app: AppData): Promise<boolean> {
  try {
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) {
      const asked = await Notifications.requestPermissionsAsync();
      if (!asked.granted) return false;
    }
    const deviceToken = await Notifications.getDevicePushTokenAsync();
    const token =
      typeof deviceToken.data === "string" ? deviceToken.data : "";
    if (!token) return false;
    await app.api.post("/api/cloud/push-token", {
      token,
      platform: Platform.OS === "ios" ? "ios" : "android",
      deviceName: "CraftLife Android",
    });
    return true;
  } catch {
    // google-services.json belum ada / bukan build native / server mati:
    // push memang belum bisa aktif, dan itu bukan error yang perlu
    // ditakut-takuti ke pengguna.
    return false;
  }
}

export async function heartbeatPresence(app: AppData): Promise<void> {
  try {
    await app.api.post("/api/cloud/presence", {
      status: "online",
      deviceName: "CraftLife Android",
    });
  } catch {
    // Presence adalah "nice to have": gagal diam-diam lebih baik daripada
    // mengganggu layar sosial dengan error.
  }
}
