/**
 * M07 — kebijakan sync, bebas dari modul native.
 *
 * Berkas ini sengaja tidak mengimpor apa pun dari expo. Kalau `syncService.ts`
 * mengambil konstanta atau tipe dari berkas yang menyentuh `expo-battery`,
 * seluruh aturan drain ikut menyeret `react-native` dan tidak bisa diuji di
 * luar emulator. Memisahkannya murah dan membuat batasnya jelas.
 */

/** Batas baterai di bawahnya drain ditunda, kecuali sedang mengisi daya. */
export const LOW_BATTERY_THRESHOLD = 0.2;

export interface SyncProbe {
  isOnline(): Promise<boolean>;
  isLowPowerMode(): Promise<boolean>;
  /** 0..1, atau null kalau perangkat tidak melaporkan tingkat baterai. */
  batteryLevel(): Promise<number | null>;
  isCharging(): Promise<boolean>;
}

export type SyncBlocked = "offline" | "low_power" | "low_battery" | null;
