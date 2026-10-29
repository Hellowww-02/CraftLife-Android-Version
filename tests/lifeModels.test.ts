/**
 * M08 wave 2 — tes model Sport / Food / Health / Economy / paket harian.
 *
 * Fokus tes ini bukan "fungsi mengembalikan sesuatu", tapi aturan backend yang
 * kalau dilanggar akan MENYIMPAN DATA SALAH tanpa error apa pun:
 *
 *  • sport harus mengirim `difficulty`, bukan `intensity`;
 *  • health harus TIDAK mengirim `waterMl` / `netCalories` (dihitung server);
 *  • economy mengirim nominal dalam mata uang pengguna, dan menampilkan IDR
 *    lewat `formatMoney` — bukan sebaliknya;
 *  • log makanan wajib menyertakan makro, karena backend membuat makanan
 *    kustom dari angka itu.
 */

import { describe, expect, it } from "vitest";

import {
  draftAmount,
  draftError as txDraftError,
  emptyTxDraft,
  filterByPeriod,
  groupByDate,
  money,
  shiftYmd,
  toTxRows,
  txPayload,
  txTotals,
  type TxDraft,
} from "../src/features/economy/model";
import {
  addWaterPayload,
  draftError as foodDraftError,
  emptyFoodLogDraft,
  foodLogPayload,
  groupFoodLogs,
  nutritionBars,
  toFoodLogRow,
  toWaterState,
  type FoodLogRow,
} from "../src/features/food/model";

/**
 * Pembantu tes: `toFoodLogRow` mengembalikan null untuk baris tanpa id, dan
 * tes di bawah memang menguji baris yang SAH. Melempar di sini lebih baik
 * daripada `as FoodLogRow`, karena kalau suatu hari parser berhenti mengenali
 * bentuk ini, tesnya gagal keras alih-alih diam-diam menguji null.
 */
function logRow(raw: Record<string, unknown>): FoodLogRow {
  const row = toFoodLogRow(raw);
  if (!row) throw new Error(`baris uji tidak dikenali parser: ${JSON.stringify(raw)}`);
  return row;
}
import {
  draftError as healthDraftError,
  draftFromLog,
  healthBars,
  healthPayload,
  MOODS,
  parseOptionalNumber,
  toHealthLog,
} from "../src/features/health/model";
import { DAY_PACKAGE_PATH, parseDayPackage } from "../src/features/healthfood/dayPackage";
import {
  draftError as sportDraftError,
  emptySportDraft,
  repsPayload,
  sportPayload,
  sportProgress,
  sportTypeLabelKey,
  toSportRows,
} from "../src/features/sport/model";

// ── Sport ───────────────────────────────────────────────────────────────────

describe("sport/model", () => {
  const row = {
    id: 11,
    sportName: "Lari pagi",
    sportType: "running",
    icon: "🏃",
    difficulty: "hard",
    durationMinutes: 30,
    caloriesBurned: 260,
    done: true,
    totalReps: 40,
    date: "2026-10-13T00:00:00",
  };

  it("baris tanpa id dibuang, bukan dijadikan baris hantu", () => {
    const rows = toSportRows([row, { sportName: "Tanpa id" }, null]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("11");
  });

  it("title diambil dari sportName karena payload sport tidak punya field title", () => {
    const rows = toSportRows([row]);
    expect(rows[0]?.title).toBe("Lari pagi");
  });

  it("yang sudah selesai diurutkan ke atas", () => {
    const rows = toSportRows([
      { ...row, id: 1, sportName: "Belum", done: false },
      { ...row, id: 2, sportName: "Sudah", done: true },
    ]);
    expect(rows.map((r) => r.sportName)).toEqual(["Sudah", "Belum"]);
  });

  it("progres hanya menghitung aktivitas yang selesai", () => {
    const rows = toSportRows([
      row,
      { ...row, id: 12, sportName: "Renang", done: false, caloriesBurned: 400, durationMinutes: 45 },
    ]);
    expect(sportProgress(rows)).toEqual({
      done: 1,
      total: 2,
      percent: 50,
      caloriesToday: 260,
      minutesToday: 30,
    });
  });

  it("sportType tak dikenal jatuh ke kunci i18n 'other', bukan kunci kosong", () => {
    expect(sportTypeLabelKey("quidditch")).toBe("sport_type_other");
    expect(sportTypeLabelKey("running")).toBe("sport_type_running");
  });

  it("payload mengirim difficulty dan TIDAK mengirim intensity", () => {
    const draft = { ...emptySportDraft(), sportName: "Gym", difficulty: "hard" as const };
    const payload = sportPayload(draft);
    expect(payload.difficulty).toBe("hard");
    // Backend menerjemahkan `intensity` HANYA kalau `difficulty` absen;
    // mengirim keduanya membuka peluang nilai yang tersimpan berbeda.
    expect("intensity" in payload).toBe(false);
    // `complete` juga tidak ikut: membuat sekaligus menyelesaikan adalah dua
    // aksi, dan menggabungkannya memberi poin dari satu ketukan.
    expect("complete" in payload).toBe(false);
  });

  it("nama kosong dan durasi nol ditolak sebelum dikirim", () => {
    expect(sportDraftError(emptySportDraft())).toBe("empty-name");
    expect(
      sportDraftError({ ...emptySportDraft(), sportName: "Yoga", durationMinutes: 0 }),
    ).toBe("bad-duration");
    expect(sportDraftError({ ...emptySportDraft(), sportName: "Yoga", durationMinutes: 20 })).toBeNull();
  });

  it("reps minimal 0 dan set minimal 1", () => {
    expect(repsPayload(12, 3)).toEqual({ reps: 12, sets: 3 });
    expect(repsPayload(-4, 0)).toEqual({ reps: 0, sets: 1 });
  });
});

// ── Food ────────────────────────────────────────────────────────────────────

describe("food/model", () => {
  it("log makanan tanpa id dibuang", () => {
    expect(toFoodLogRow({ name: "Nasi", calories: 200 })).toBeNull();
    expect(toFoodLogRow({ id: "5", name: "Nasi", calories: 200 })?.name).toBe("Nasi");
  });

  it("persentase bar dibatasi 100 tetapi angkanya tetap nilai sebenarnya", () => {
    const bars = nutritionBars(
      { calories: 2600, protein: 60, carbs: 300, fat: 80 },
      { calories: 2000, protein: 50, carbs: 250, fat: 70 },
    );
    const calories = bars[0];
    expect(calories?.percent).toBe(100);
    expect(calories?.value).toBe(2600);
    expect(calories?.goal).toBe(2000);
  });

  it("target 0 tidak menghasilkan NaN", () => {
    const bars = nutritionBars(
      { calories: 100, protein: 0, carbs: 0, fat: 0 },
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
    expect(bars.every((b) => b.percent === 0)).toBe(true);
  });

  it("air: target tercapai ditandai, dan goal 0 tidak membuat bagi-nol", () => {
    const state = toWaterState({ totalMl: 2600, goalMl: 2500, logs: [{ id: "1", amountMl: 2600, time: "08:00" }] });
    expect(state.goalReached).toBe(true);
    expect(state.percent).toBe(100);
    const zero = toWaterState({ totalMl: 0, goalMl: 0 });
    expect(zero.goalMl).toBe(1);
    expect(zero.percent).toBe(0);
  });

  it("payload air tidak mengirim tanggal kalau jam server belum ada", () => {
    expect(addWaterPayload(250, null)).toEqual({ amountMl: 250 });
    expect(addWaterPayload(250, "2026-10-13")).toEqual({ amountMl: 250, logDate: "2026-10-13" });
  });

  it("payload log makanan selalu menyertakan makro", () => {
    const draft = { ...emptyFoodLogDraft(), name: "Sup buntut", calories: 320, protein: 22, carbs: 18, fat: 14 };
    const payload = foodLogPayload(draft, "2026-10-13");
    expect(payload).toMatchObject({
      foodName: "Sup buntut",
      calories: 320,
      protein: 22,
      carbs: 18,
      fat: 14,
      mealType: "snack",
      date: "2026-10-13",
    });
    // Tanpa keempat angka ini backend membuat makanan kustom berkalori 0.
    expect(foodDraftError(draft)).toBeNull();
    expect(foodDraftError(emptyFoodLogDraft())).toBe("empty-name");
  });

  it("log dikelompokkan per jenis makan, meal kosong tidak muncul", () => {
    const groups = groupFoodLogs([
      logRow({ id: "1", name: "Roti", mealType: "breakfast", calories: 100 }),
      logRow({ id: "2", name: "Nasi", mealType: "lunch", calories: 500 }),
    ]);
    expect(groups.map((g) => g.mealType)).toEqual(["breakfast", "lunch"]);
    expect(groups[1]?.calories).toBe(500);
  });
});

// ── Health ──────────────────────────────────────────────────────────────────

describe("health/model", () => {
  const log = toHealthLog(
    { steps: 8200, sleepHours: 7.25, weightKg: 68.4, heartRate: 62, mood: "tired", notes: "Capek" },
    "2026-10-13",
  );

  it("berat dan detak jantung boleh null, dan itu BUKAN nol", () => {
    expect(log.weightKg).toBe(68.4);
    // Tidur dibulatkan ke 1 desimal (parity tampilan desktop).
    expect(log.sleepHours).toBe(7.3);
    const empty = toHealthLog({ steps: 100 }, "2026-10-13");
    expect(empty.weightKg).toBeNull();
    expect(empty.heartRate).toBeNull();
    // Mood tak dikenal jatuh ke nilai aman, bukan undefined.
    expect(toHealthLog({ mood: "murka" }, "2026-10-13").mood).toBe("good");
    expect(MOODS).toContain("stressed");
  });

  it("payload health TIDAK mengirim waterMl dan netCalories", () => {
    const payload = healthPayload(draftFromLog(log), "2026-10-13");
    expect("waterMl" in payload).toBe(false);
    expect("netCalories" in payload).toBe(false);
    expect(payload).toMatchObject({ logDate: "2026-10-13", steps: 8200, sleepHours: 7.3, mood: "tired" });
    // Berat kosong dikirim sebagai string kosong, bukan 0: backend membedakan
    // "tidak ditimbang" dari "timbangannya nol".
    expect(healthPayload({ ...draftFromLog(log), weightKg: null }, null).weightKg).toBe("");
  });

  it("tidur di luar 0-24 ditolak, langkah negatif ditolak", () => {
    expect(healthDraftError({ ...draftFromLog(log), sleepHours: 30 })).toBe("bad-sleep");
    expect(healthDraftError({ ...draftFromLog(log), steps: -1 })).toBe("bad-steps");
    expect(healthDraftError(draftFromLog(log))).toBeNull();
  });

  it("kosong berarti null, bukan nol", () => {
    expect(parseOptionalNumber("")).toBeNull();
    expect(parseOptionalNumber("68,4")).toBe(68.4);
    expect(parseOptionalNumber("-3")).toBeNull();
  });

  it("bar langkah dan tidur memakai target dari server", () => {
    const bars = healthBars(log, { dailySteps: 10000, dailySleepHours: 8 });
    expect(bars.map((b) => b.labelKey)).toEqual(["health_steps", "health_sleep"]);
    expect(bars[0]?.detail).toBe("8200 / 10000");
    expect(bars[1]?.detail).toBe("7.3 / 8h");
  });
});

// ── Paket harian ────────────────────────────────────────────────────────────

describe("healthfood/dayPackage", () => {
  it("rutenya endpoint agregat, tanpa parameter tanggal", () => {
    // Backend memakai `date.today()` sendiri bila `?date` tidak dikirim — itu
    // justru benar, karena server adalah sumber kebenaran tanggal.
    expect(DAY_PACKAGE_PATH).toBe("/api/healthfood/day");
  });

  it("satu respons dipakai dua layar: nutrisi DAN log kesehatan", () => {
    const pkg = parseDayPackage({
      date: "2026-10-13",
      isToday: true,
      nutrition: { calories: 1500, protein: 55, carbs: 200, fat: 50 },
      goals: { calories: 2000, protein: 60, carbs: 250, fat: 70 },
      water: { totalMl: 1200, goalMl: 2500, logs: [] },
      foodLogs: [{ id: "1", name: "Nasi", calories: 500, mealType: "lunch" }],
      healthLog: { steps: 4000, sleepHours: 6, mood: "good" },
      healthGoals: { dailySteps: 8000, dailySleepHours: 7 },
      caloriesBurned: 300,
      netCalories: 1200,
    });
    expect(pkg?.date).toBe("2026-10-13");
    expect(pkg?.nutrition.calories).toBe(1500);
    expect(pkg?.water.totalMl).toBe(1200);
    expect(pkg?.foodLogs).toHaveLength(1);
    expect(pkg?.healthLog.steps).toBe(4000);
    expect(pkg?.healthGoals.dailySteps).toBe(8000);
    expect(pkg?.caloriesBurned).toBe(300);
    expect(pkg?.netCalories).toBe(1200);
  });

  it("respons bukan objek menghasilkan null, bukan layar crash", () => {
    expect(parseDayPackage(null)).toBeNull();
    expect(parseDayPackage("ops")).toBeNull();
  });

  it("paket cacat tetap menghasilkan angka nol yang wajar", () => {
    const pkg = parseDayPackage({});
    expect(pkg?.nutrition.calories).toBe(0);
    expect(pkg?.water.goalMl).toBe(2500);
    expect(pkg?.healthGoals.dailySteps).toBe(10000);
    expect(pkg?.foodLogs).toEqual([]);
  });
});

// ── Economy ─────────────────────────────────────────────────────────────────

describe("economy/model", () => {
  const tx = (over: Record<string, unknown> = {}) => ({
    id: "1",
    type: "expense",
    name: "Kopi",
    category: "food",
    amount: 25000,
    date: "2026-10-13",
    notes: "",
    icon: "☕",
    ...over,
  });

  it("baris tanpa id dibuang; type tak dikenal dianggap expense", () => {
    expect(toTxRows([tx(), { name: "Tanpa id" }])).toHaveLength(1);
    expect(toTxRows([tx({ type: "grant" })])[0]?.type).toBe("expense");
  });

  it("urut terbaru dulu, dan tanggal sama dipecah dengan id menurun", () => {
    const rows = toTxRows([
      tx({ id: "1", date: "2026-10-01" }),
      tx({ id: "2", date: "2026-10-13" }),
      tx({ id: "3", date: "2026-10-13" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["3", "2", "1"]);
  });

  it("total memisahkan pemasukan dan pengeluaran", () => {
    const totals = txTotals(toTxRows([tx({ type: "income", amount: 500000 }), tx({ amount: 25000 })]));
    expect(totals).toEqual({ incomeIdr: 500000, expenseIdr: 25000, netIdr: 475000 });
  });

  it("tampilan lewat formatMoney: IDR mentah dikonversi ke mata uang pengguna", () => {
    expect(money(2500000, "IDR")).toBe("Rp 2,500,000");
    // Kurs bawaan core: USD = 17800. 2.500.000 IDR = 140,45 USD -> dibulatkan.
    expect(money(2500000, "USD")).toBe("$ 140");
  });

  it("nominal ditulis dalam mata uang pengguna, BUKAN IDR", () => {
    const draft: TxDraft = { ...emptyTxDraft(), name: "Kopi", amountInput: "25000", type: "expense" };
    const payload = txPayload(draft);
    // Angka yang dikirim adalah yang diketik; `_to_idr` di server yang
    // mengonversinya. Mengirim IDR di sini akan melipatgandakan nominal.
    expect(payload.amount).toBe(25000);
    expect(payload).toMatchObject({ name: "Kopi", type: "expense", category: "other" });
    // Tanggal tidak dikirim kalau belum dipilih — server memakai hari ini.
    expect("date" in payload).toBe(false);
  });

  it("parser uang menerima gaya EN dan ID", () => {
    expect(draftAmount({ ...emptyTxDraft(), amountInput: "1,234.56" })).toBe(1234.56);
    expect(draftAmount({ ...emptyTxDraft(), amountInput: "1.234.567,89" })).toBe(1234567.89);
    expect(draftAmount({ ...emptyTxDraft(), amountInput: "" })).toBeNull();
  });

  it("nama kosong dan nominal nol ditolak", () => {
    expect(txDraftError(emptyTxDraft())).toBe("empty-name");
    expect(txDraftError({ ...emptyTxDraft(), name: "Kopi", amountInput: "0" })).toBe("bad-amount");
    expect(txDraftError({ ...emptyTxDraft(), name: "Kopi", amountInput: "-5" })).toBe("bad-amount");
    expect(txDraftError({ ...emptyTxDraft(), name: "Kopi", amountInput: "25000" })).toBeNull();
  });

  it("tanggal digeser menurut kalender, bukan 30 hari = 1 bulan", () => {
    expect(shiftYmd("2026-10-13", -6)).toBe("2026-10-07");
    expect(shiftYmd("2026-03-02", -1)).toBe("2026-03-01");
    expect(shiftYmd("bukan-tanggal", -1)).toBeNull();
  });

  it("rentang hari menyaring dari tanggal SERVER; tanpa jam server = tampilkan semua", () => {
    const rows = toTxRows([
      tx({ id: "1", date: "2026-10-01" }),
      tx({ id: "2", date: "2026-10-10" }),
      tx({ id: "3", date: "2026-10-13" }),
    ]);
    expect(filterByPeriod(rows, "7", "2026-10-13").map((r) => r.id)).toEqual(["3", "2"]);
    // Menyaring dengan tanggal tebakan perangkat bisa menyembunyikan uang dari
    // tampilan, jadi tanpa tanggal server semuanya ditampilkan.
    expect(filterByPeriod(rows, "7", null)).toHaveLength(3);
    expect(filterByPeriod(rows, "all", "2026-10-13")).toHaveLength(3);
  });

  it("dikelompokkan per tanggal dengan subtotal bersih", () => {
    const groups = groupByDate(
      toTxRows([
        tx({ id: "1", date: "2026-10-13", type: "income", amount: 100000 }),
        tx({ id: "2", date: "2026-10-13", amount: 30000 }),
        tx({ id: "3", date: "2026-10-12", amount: 5000 }),
      ]),
    );
    expect(groups.map((g) => g.date)).toEqual(["2026-10-13", "2026-10-12"]);
    expect(groups[0]?.netIdr).toBe(70000);
    expect(groups[1]?.netIdr).toBe(-5000);
  });
});
