/**
 * M08 wave 2 — model layar Health & Food.
 *
 * Sumber bentuk data: `life_api.py::_healthfood_day`, dipakai oleh
 * `GET /api/healthfood/day?date=YYYY-MM-DD`. Satu endpoint ini mengembalikan
 * seluruh paket satu hari (nutrisi, target, air, catatan makanan, log
 * kesehatan), jadi layar hanya butuh satu permintaan — penting di jaringan
 * ponsel yang mahal.
 *
 * Catatan tanggal: parameter `date` dikirim dari jam SERVER
 * (`serverClock.dateKey()`), bukan jam perangkat. Backend juga memotong
 * tanggal masa depan ke hari ini (`_parse_day`), jadi mengirim tanggal hasil
 * jam perangkat yang meleset akan silently menampilkan hari yang salah.
 */

import { percentOf } from "../tasks/model";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_TYPES: readonly MealType[] = ["breakfast", "lunch", "dinner", "snack"] as const;

export const MEAL_LABEL_KEY: Record<MealType, string> = {
  breakfast: "food_meal_breakfast",
  lunch: "food_meal_lunch",
  dinner: "food_meal_dinner",
  snack: "food_meal_snack",
};

export function toMealType(raw: unknown): MealType {
  return typeof raw === "string" && (MEAL_TYPES as readonly string[]).includes(raw)
    ? (raw as MealType)
    : "snack";
}

export interface FoodLogRow {
  id: string;
  name: string;
  icon: string;
  serving: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealType: MealType;
  notes: string;
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

export function toFoodLogRow(raw: unknown): FoodLogRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = r.id === undefined || r.id === null ? "" : String(r.id);
  if (!id) return null;
  return {
    id,
    name: typeof r.name === "string" ? r.name : "",
    icon: typeof r.icon === "string" && r.icon !== "" ? r.icon : "🍽️",
    serving: num(r.serving, 1),
    calories: Math.round(num(r.calories)),
    protein: num(r.protein),
    carbs: num(r.carbs),
    fat: num(r.fat),
    mealType: toMealType(r.mealType),
    notes: typeof r.notes === "string" ? r.notes : "",
  };
}

export interface NutritionValues {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function toNutrition(raw: unknown): NutritionValues {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    calories: Math.round(num(r.calories)),
    protein: Math.round(num(r.protein) * 10) / 10,
    carbs: Math.round(num(r.carbs) * 10) / 10,
    fat: Math.round(num(r.fat) * 10) / 10,
  };
}

export interface NutritionBar {
  labelKey: string;
  value: number;
  goal: number;
  percent: number;
}

/**
 * Empat bar nutrisi vs target.
 *
 * Persentase DIBATASI 100 untuk lebar bar (bar yang lebih panjang dari
 * wadahnya merusak tata letak), tetapi angka yang ditampilkan tetap nilai
 * sebenarnya — pengguna harus tahu kalau ia melewati target, bukan melihat
 * "2000/2000" padahal sudah 2600.
 */
export function nutritionBars(
  values: NutritionValues,
  goals: NutritionValues,
): NutritionBar[] {
  const rows: Array<[string, number, number]> = [
    ["food_calories_label", values.calories, Math.round(goals.calories)],
    ["food_protein_label", values.protein, goals.protein],
    ["food_carbs_label", values.carbs, goals.carbs],
    ["food_fat_label", values.fat, goals.fat],
  ];
  return rows.map(([labelKey, value, goal]) => ({
    labelKey,
    value,
    goal,
    percent: percentOf(value, goal),
  }));
}

export interface WaterLogEntry {
  id: string;
  amountMl: number;
  time: string;
}

export interface WaterState {
  totalMl: number;
  goalMl: number;
  percent: number;
  logs: WaterLogEntry[];
  /** true saat target terlampaui — dipakai menonaktifkan ajakan "tambah lagi". */
  goalReached: boolean;
}

export function toWaterState(raw: unknown): WaterState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const totalMl = Math.round(num(r.totalMl));
  const goalMl = Math.max(1, Math.round(num(r.goalMl, 2500)));
  const logs: WaterLogEntry[] = [];
  if (Array.isArray(r.logs)) {
    for (const item of r.logs) {
      if (!item || typeof item !== "object") continue;
      const w = item as Record<string, unknown>;
      const id = w.id === undefined || w.id === null ? "" : String(w.id);
      if (!id) continue;
      logs.push({
        id,
        amountMl: Math.round(num(w.amountMl)),
        time: typeof w.time === "string" ? w.time : "",
      });
    }
  }
  return {
    totalMl,
    goalMl,
    percent: percentOf(totalMl, goalMl),
    logs,
    goalReached: totalMl >= goalMl,
  };
}

/** Tiga takaran cepat, sama dengan tombol desktop (250/500/1000 ml). */
export const WATER_QUICK_AMOUNTS: readonly number[] = [250, 500, 1000] as const;

export function addWaterPayload(amountMl: number, logDate: string | null): Record<string, unknown> {
  const payload: Record<string, unknown> = { amountMl: Math.max(1, Math.round(amountMl)) };
  // `logDate` hanya dikirim kalau jam server tersedia. Tanpa itu backend
  // memakai `date.today()` miliknya sendiri — dan itu justru benar, karena
  // backend adalah sumber kebenaran tanggal. Mengirim tanggal tebakan perangkat
  // lebih berbahaya daripada tidak mengirim sama sekali.
  if (logDate) payload.logDate = logDate;
  return payload;
}

export interface FoodLogGroup {
  mealType: MealType;
  labelKey: string;
  rows: FoodLogRow[];
  calories: number;
}

export function groupFoodLogs(rows: readonly FoodLogRow[]): FoodLogGroup[] {
  const out: FoodLogGroup[] = [];
  for (const meal of MEAL_TYPES) {
    const list = rows.filter((r) => r.mealType === meal);
    if (list.length === 0) continue;
    out.push({
      mealType: meal,
      labelKey: MEAL_LABEL_KEY[meal],
      rows: list,
      calories: list.reduce((sum, r) => sum + r.calories, 0),
    });
  }
  return out;
}

export interface FoodLogDraft {
  name: string;
  icon: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  portion: number;
  mealType: MealType;
  notes: string;
}

export function emptyFoodLogDraft(): FoodLogDraft {
  return {
    name: "",
    icon: "🍽️",
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    portion: 1,
    mealType: "snack",
    notes: "",
  };
}

export function draftError(draft: FoodLogDraft): "empty-name" | null {
  return draft.name.trim() === "" ? "empty-name" : null;
}

/**
 * Payload `POST /api/food/log`.
 *
 * Backend menerima nama bebas: kalau tidak ada `foodId`, ia mencari makanan
 * default dengan nama itu, dan kalau tetap tidak ada, ia MEMBUAT makanan
 * kustom dari kalori/protein/karbo/lemak yang dikirim. Jadi keempat angka itu
 * wajib ikut, bukan opsional — tanpa itu makanan baru tersimpan dengan 0 kcal.
 */
export function foodLogPayload(
  draft: FoodLogDraft,
  logDate: string | null,
): Record<string, unknown> {
  return {
    foodName: draft.name.trim(),
    icon: draft.icon || "🍽️",
    calories: Math.max(0, Math.round(draft.calories)),
    protein: Math.max(0, draft.protein),
    carbs: Math.max(0, draft.carbs),
    fat: Math.max(0, draft.fat),
    portion: Math.max(0.1, draft.portion),
    mealType: draft.mealType,
    notes: draft.notes,
    ...(logDate ? { date: logDate } : {}),
  };
}

/** Kalori bersih = masuk - terbakar. Backend menghitungnya, layar menampilkannya. */
export function netCalories(eaten: number, burned: number): number {
  return Math.round(eaten) - Math.round(burned);
}
