/**
 * M15b — saklar "Sumber data": cloud (Supabase langsung) vs desktop (API PC).
 *
 * Disimpan lokal (SecureStore), sama seperti alamat server. Mode cloud =
 * HP berdiri sendiri tanpa PC; mode desktop = perilaku lama (IP lokal).
 */

import * as SecureStore from "expo-secure-store";

export type DataMode = "desktop" | "cloud";

const KEY = "craftlife_data_mode";

let mode: DataMode = "desktop";

export async function loadDataMode(): Promise<DataMode> {
  const saved = await SecureStore.getItemAsync(KEY);
  if (saved === "cloud" || saved === "desktop") mode = saved;
  return mode;
}

export function getDataMode(): DataMode {
  return mode;
}

export async function setDataMode(next: DataMode): Promise<void> {
  mode = next;
  await SecureStore.setItemAsync(KEY, next);
}
