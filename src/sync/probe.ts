/**
 * M07 — probe perangkat nyata.
 *
 * Satu-satunya berkas sync yang menyentuh modul native. Dipisahkan supaya
 * `syncService.ts` tetap bisa diuji; lihat catatan di `policy.ts`.
 */

import * as Battery from "expo-battery";
import * as Network from "expo-network";

import type { SyncProbe } from "./policy";

export const deviceProbe: SyncProbe = {
  async isOnline() {
    const state = await Network.getNetworkStateAsync();
    // `isInternetReachable` bisa null saat belum dipastikan; dianggap offline
    // lebih aman daripada mengirim ke jaringan yang tidak ada.
    return state.isConnected === true && state.isInternetReachable !== false;
  },
  async isLowPowerMode() {
    return Battery.isLowPowerModeEnabledAsync();
  },
  async batteryLevel() {
    const level = await Battery.getBatteryLevelAsync();
    // API mengembalikan -1 saat tidak tersedia. Diteruskan apa adanya itu akan
    // terbaca "baterai 0%" dan mematikan sinkronisasi selamanya.
    return level < 0 ? null : level;
  },
  async isCharging() {
    const state = await Battery.getBatteryStateAsync();
    return state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;
  },
};
