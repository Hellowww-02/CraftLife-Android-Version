/**
 * M08 wave 2 — parser paket "satu hari" dari `GET /api/healthfood/day`.
 *
 * Satu endpoint ini dipakai DUA layar (Food dan Health) karena backend
 * memang mengirim keduanya sekaligus: `life_api.py::_healthfood_day`
 * mengembalikan nutrisi + air + log makanan DAN `healthLog` + `healthGoals`
 * dalam satu respons. Memanggil endpoint dua kali dari dua layar hanya
 * menggandakan trafik tanpa menambah data.
 *
 * File ini sengaja terpisah dari `food/model.ts` dan `health/model.ts`:
 * kalau diletakkan di salah satunya, layar yang lain harus mengimpor dari
 * fitur tetangganya.
 *
 * Semua parser di sini TIDAK boleh melempar: respons yang cacat harus
 * menghasilkan nilai nol yang wajar, bukan layar crash.
 */

import {
  toFoodLogRow,
  toNutrition,
  toWaterState,
  type FoodLogRow,
  type NutritionValues,
  type WaterState,
} from "../food/model";
import {
  toHealthGoals,
  toHealthLog,
  type HealthGoals,
  type HealthLog,
} from "../health/model";

export interface DayPackage {
  /** Tanggal menurut SERVER, bukan menurut jam perangkat. */
  date: string;
  isToday: boolean;
  nutrition: NutritionValues;
  goals: NutritionValues;
  water: WaterState;
  foodLogs: FoodLogRow[];
  healthLog: HealthLog;
  healthGoals: HealthGoals;
  /** Kalori yang terbakar dari aktivitas sport hari itu. */
  caloriesBurned: number;
  /** Sudah dihitung backend; layar hanya menampilkannya. */
  netCalories: number;
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

export function parseDayPackage(raw: unknown): DayPackage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const date = typeof r.date === "string" && r.date !== "" ? r.date.slice(0, 10) : "";
  const foodLogs: FoodLogRow[] = [];
  if (Array.isArray(r.foodLogs)) {
    for (const item of r.foodLogs) {
      const row = toFoodLogRow(item);
      if (row) foodLogs.push(row);
    }
  }
  return {
    date,
    // `isToday` dipercaya dari backend; kalau tidak dikirim, bandingkan
    // dengan tanggal respons itu sendiri (bukan jam perangkat).
    isToday: typeof r.isToday === "boolean" ? r.isToday : true,
    nutrition: toNutrition(r.nutrition),
    goals: toNutrition(r.goals),
    water: toWaterState(r.water),
    foodLogs,
    healthLog: toHealthLog(r.healthLog, date),
    healthGoals: toHealthGoals(r.healthGoals),
    caloriesBurned: Math.round(num(r.caloriesBurned)),
    netCalories: Math.round(num(r.netCalories)),
  };
}

/** Rute tunggal untuk paket harian. Backend memakai `date.today()` bila kosong. */
export const DAY_PACKAGE_PATH = "/api/healthfood/day";
