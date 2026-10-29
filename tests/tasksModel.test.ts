/**
 * M08 — model Habits / Dailies / Quests.
 *
 * Yang paling penting di sini adalah tes JADWAL HARIAN. Backend menyimpan
 * repeat_days sebagai 0=Senin..6=Minggu tetapi mengirimkannya ke klien dalam
 * konvensi JavaScript 0=Minggu..6=Sabtu. Salah satu langkah konversi dan
 * seluruh rutinitas pengguna bergeser satu hari — dan karena streak dihitung
 * dari "jatuh tempo hari ini", bug itu memutus streak yang sebenarnya hidup.
 */

import { describe, expect, it } from "vitest";

import {
  applyDailyComplete,
  dailyPayload,
  dailiesForToday,
  dailiesProgress,
  draftError as dailyDraftError,
  emptyDailyDraft,
  isDueToday,
  isEveryDay,
  toDailyRow,
  toDailyRows,
} from "../src/features/dailies/model";
import {
  applyHabitComplete,
  draftFromHabit,
  habitDirection,
  habitPayload,
  habitStreak,
  habitsProgress,
  toHabitRow,
  toHabitRows,
} from "../src/features/habits/model";
import {
  applyQuestComplete,
  groupQuests,
  questBucket,
  questPayload,
  questsProgress,
  toQuestRow,
  toQuestRows,
} from "../src/features/quests/model";
import {
  addDaysToYmd,
  normalizeYmd,
  percentOf,
  sortTasks,
  toDifficulty,
  weekdayFromYmd,
} from "../src/features/tasks/model";

// 2026-10-13 adalah hari Selasa (getDay() = 2, weekday Python = 1).
const TUESDAY = "2026-10-13";

describe("weekdayFromYmd — konvensi JS getDay", () => {
  it("2026-10-13 adalah Selasa = 2", () => {
    expect(weekdayFromYmd(TUESDAY)).toBe(2);
  });

  it("Minggu = 0, bukan 7", () => {
    // 2026-10-11 adalah Minggu.
    expect(weekdayFromYmd("2026-10-11")).toBe(0);
  });

  it("Sabtu = 6", () => {
    // 2026-10-17 adalah Sabtu.
    expect(weekdayFromYmd("2026-10-17")).toBe(6);
  });

  it("masukan rusak menghasilkan null, bukan tanggal epoch", () => {
    expect(weekdayFromYmd(null)).toBeNull();
    expect(weekdayFromYmd("")).toBeNull();
    expect(weekdayFromYmd("13/10/2026")).toBeNull();
    expect(weekdayFromYmd("bukan tanggal")).toBeNull();
  });
});

describe("normalizeYmd", () => {
  it("menerima tanggal sah dan menormalkan nol di depan", () => {
    expect(normalizeYmd("2026-10-13")).toBe("2026-10-13");
    expect(normalizeYmd(" 2026-1-5 ")).toBe("2026-01-05");
  });

  it("menolak tanggal yang tidak ada di kalender", () => {
    // Regex saja akan meloloskan ini; Date menggelindingkannya ke 3 Maret.
    expect(normalizeYmd("2026-02-31")).toBeNull();
    expect(normalizeYmd("2026-13-01")).toBeNull();
    expect(normalizeYmd("2026-00-10")).toBeNull();
  });

  it("menolak bentuk yang salah", () => {
    expect(normalizeYmd("13-10-2026")).toBeNull();
    expect(normalizeYmd("2026/10/13")).toBeNull();
  });
});

describe("addDaysToYmd", () => {
  it("melewati batas bulan", () => {
    expect(addDaysToYmd("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("bisa mundur", () => {
    expect(addDaysToYmd("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("null kalau masukannya tidak sah", () => {
    expect(addDaysToYmd("2026-02-31", 1)).toBeNull();
  });
});

describe("percentOf", () => {
  it("total nol menghasilkan 0, bukan NaN", () => {
    expect(percentOf(0, 0)).toBe(0);
    expect(Number.isNaN(percentOf(3, 0))).toBe(false);
  });

  it("dibatasi 0..100", () => {
    expect(percentOf(5, 4)).toBe(100);
    expect(percentOf(-1, 4)).toBe(0);
  });
});

describe("toDifficulty", () => {
  it("nilai tak dikenal jatuh ke medium, sama seperti backend", () => {
    expect(toDifficulty("hard")).toBe("hard");
    expect(toDifficulty("nightmare")).toBe("medium");
    expect(toDifficulty(undefined)).toBe("medium");
    expect(toDifficulty(3)).toBe("medium");
  });
});

describe("sortTasks", () => {
  it("sortOrder dulu, lalu judul sebagai pemecah seri", () => {
    const rows = [
      { id: "1", title: "B", sortOrder: 2 },
      { id: "2", title: "A", sortOrder: 2 },
      { id: "3", title: "Z", sortOrder: 1 },
    ] as unknown as Parameters<typeof sortTasks>[0];
    expect(sortTasks(rows).map((r) => r.id)).toEqual(["3", "2", "1"]);
  });
});

describe("Habits", () => {
  const raw = {
    id: "12",
    title: " Minum air ",
    notes: "n",
    folderId: null,
    difficulty: "hard",
    isPositive: true,
    isNegative: false,
    positiveStreak: 4,
    negativeStreak: 0,
    history: [],
    createdAt: "2026-01-01",
    icon: "💧",
    doneToday: false,
    sortOrder: 1,
  };

  it("baris tanpa id dibuang, bukan ditampilkan tanpa identitas", () => {
    expect(toHabitRow({ title: "tanpa id" })).toBeNull();
    expect(toHabitRow(null)).toBeNull();
    expect(toHabitRows("bukan array")).toEqual([]);
  });

  it("judul dirapikan dan difficulty dinormalkan", () => {
    const row = toHabitRow(raw)!;
    expect(row.title).toBe("Minum air");
    expect(row.difficulty).toBe("hard");
    expect(row.icon).toBe("💧");
  });

  it("arah dan streak mengikuti jenis habit", () => {
    const good = toHabitRow(raw)!;
    expect(habitDirection(good)).toBe("positive");
    expect(habitStreak(good)).toBe(4);

    const bad = toHabitRow({ ...raw, isPositive: false, isNegative: true, positiveStreak: 9, negativeStreak: 2 })!;
    expect(habitDirection(bad)).toBe("negative");
    expect(habitStreak(bad)).toBe(2);
  });

  it("menyelesaikan habit baik menaikkan streak; membatalkan menurunkannya", () => {
    const row = toHabitRow(raw)!;
    const done = applyHabitComplete(row, true);
    expect(done.doneToday).toBe(true);
    expect(done.positiveStreak).toBe(5);

    const undone = applyHabitComplete(done, true);
    expect(undone.doneToday).toBe(false);
    expect(undone.positiveStreak).toBe(4);
  });

  it("streak tidak pernah negatif saat pembatalan berulang", () => {
    const row = applyHabitComplete(applyHabitComplete(toHabitRow(raw)!, true), true);
    expect(row.positiveStreak).toBeGreaterThanOrEqual(0);
    const again = applyHabitComplete(row, true);
    expect(again.positiveStreak).toBeGreaterThanOrEqual(0);
  });

  it("progres menghitung yang selesai hari ini", () => {
    const rows = toHabitRows([raw, { ...raw, id: "13", doneToday: true }, { ...raw, id: "14", doneToday: true }]);
    expect(habitsProgress(rows)).toEqual({ done: 2, total: 3, percent: 67 });
  });

  it("payload memakai nama field yang dibaca backend", () => {
    const draft = draftFromHabit(toHabitRow(raw)!);
    expect(habitPayload(draft)).toEqual({
      title: "Minum air",
      icon: "💧",
      difficulty: "hard",
      isPositive: true,
      isNegative: false,
      notes: "n",
      folderId: null,
    });
  });

  it("judul kosong ditolak sebelum dikirim", () => {
    const draft = draftFromHabit(toHabitRow(raw)!);
    expect(dailyDraftError({ ...emptyDailyDraft(), title: "  " })).toBe("empty-title");
    expect(habitPayload({ ...draft, title: "  " }).title).toBe("");
  });
});

describe("Dailies", () => {
  it("repeatDays kosong dianggap tiap hari", () => {
    const row = toDailyRow({ id: "1", title: "a", repeatDays: [] })!;
    expect(isEveryDay(row)).toBe(true);
    expect(isDueToday(row, TUESDAY)).toBe(true);
    // Bahkan tanpa jam server, daily tiap hari tetap jatuh tempo.
    expect(isDueToday(row, null)).toBe(true);
  });

  it("daily terjadwal memakai konvensi JS: 2 = Selasa", () => {
    const tuesdayOnly = toDailyRow({ id: "1", title: "a", repeatDays: [2] })!;
    expect(isDueToday(tuesdayOnly, TUESDAY)).toBe(true);
    // 2026-10-12 adalah Senin (getDay 1).
    expect(isDueToday(tuesdayOnly, "2026-10-12")).toBe(false);
  });

  it("KONVERSI SALAH akan membuat rutinitas bergeser satu hari", () => {
    // Backend menyimpan "1" (= Selasa dalam konvensi Python 0=Senin) dan
    // `_parse_repeat` mengirimkannya sebagai (1+1)%7 = 2. Jadi angka 2 di
    // ponsel HARUS berarti Selasa. Kalau kode memakai konvensi Python, 2 akan
    // dibaca sebagai Rabu dan daily ini hilang setiap Selasa.
    const row = toDailyRow({ id: "1", title: "a", repeatDays: [(1 + 1) % 7] })!;
    expect(row.repeatDays).toEqual([2]);
    expect(isDueToday(row, TUESDAY)).toBe(true);
    expect(isDueToday(row, "2026-10-14")).toBe(false); // Rabu
  });

  it("tanpa jam server, daily terjadwal parsial TIDAK ditebak", () => {
    const tuesdayOnly = toDailyRow({ id: "1", title: "a", repeatDays: [2] })!;
    expect(isDueToday(tuesdayOnly, null)).toBe(false);
  });

  it("daftar hari ini dan progresnya", () => {
    const rows = toDailyRows([
      { id: "1", title: "tiap hari", repeatDays: [], isCompletedToday: true },
      { id: "2", title: "selasa", repeatDays: [2] },
      { id: "3", title: "minggu", repeatDays: [0] },
    ]);
    // Urutan mengikuti sortTasks: sortOrder sama, jadi judul yang menentukan
    // ("selasa" < "tiap hari"), bukan urutan masukan.
    expect(dailiesForToday(rows, TUESDAY).map((r) => r.id)).toEqual(["2", "1"]);
    expect(dailiesProgress(rows, TUESDAY)).toEqual({ done: 1, due: 2, percent: 50 });
  });

  it("daily beku tidak bisa diselesaikan dari UI", () => {
    const frozen = toDailyRow({ id: "1", title: "a", repeatDays: [], isFrozen: true, streak: 3 })!;
    expect(applyDailyComplete(frozen)).toBe(frozen);
  });

  it("menyelesaikan menaikkan streak", () => {
    const row = toDailyRow({ id: "1", title: "a", repeatDays: [], streak: 3 })!;
    const done = applyDailyComplete(row);
    expect(done.isCompletedToday).toBe(true);
    expect(done.streak).toBe(4);
  });

  it("payload mengirim repeatDays konvensi JS dan tersortir", () => {
    const draft = { ...emptyDailyDraft(), title: "x", repeatDays: [5, 1, 3] };
    expect(dailyPayload(draft).repeatDays).toEqual([1, 3, 5]);
    expect(dailyDraftError(draft)).toBeNull();
    expect(dailyDraftError({ ...draft, repeatDays: [] })).toBe("no-days");
  });
});

describe("Quests", () => {
  it("payload memakai `difficulty`, bukan `priority`", () => {
    // Handler create hanya membaca body.get("difficulty"); mengirim `priority`
    // akan menyimpan quest sebagai "medium" apa pun pilihan pengguna.
    const payload = questPayload({
      title: "  x ",
      icon: "📜",
      difficulty: "epic",
      notes: "",
      dueDate: TUESDAY,
    });
    expect(payload.difficulty).toBe("epic");
    expect(payload.priority).toBeUndefined();
    expect(payload.title).toBe("x");
  });

  it("bucket menurut tenggat server", () => {
    const row = (dueDate: string | null, isCompleted = false) =>
      toQuestRow({ id: "1", title: "q", dueDate, isCompleted })!;
    expect(questBucket(row("2026-10-12"), TUESDAY)).toBe("overdue");
    expect(questBucket(row(TUESDAY), TUESDAY)).toBe("today");
    expect(questBucket(row("2026-10-14"), TUESDAY)).toBe("upcoming");
    expect(questBucket(row(null), TUESDAY)).toBe("someday");
    expect(questBucket(row("2026-10-12", true), TUESDAY)).toBe("done");
  });

  it("tanpa jam server, quest bertenggat tidak dituduh terlambat", () => {
    const row = toQuestRow({ id: "1", title: "q", dueDate: "2020-01-01" })!;
    expect(questBucket(row, null)).toBe("upcoming");
    expect(groupQuests([row], null).dateKeyAvailable).toBe(false);
  });

  it("grup kosong tidak muncul; di dalam grup urut tenggat", () => {
    const rows = toQuestRows([
      { id: "1", title: "a", dueDate: "2026-10-20" },
      { id: "2", title: "b", dueDate: "2026-10-14" },
      { id: "3", title: "c", dueDate: null },
      { id: "4", title: "d", dueDate: null, isCompleted: true },
    ]);
    const { groups } = groupQuests(rows, TUESDAY);
    expect(groups.map((g) => g.bucket)).toEqual(["upcoming", "someday", "done"]);
    expect(groups[0]!.rows.map((r) => r.id)).toEqual(["2", "1"]);
  });

  it("progres menghitung selesai dan terlambat", () => {
    const rows = toQuestRows([
      { id: "1", title: "a", dueDate: "2026-10-01" },
      { id: "2", title: "b", dueDate: TUESDAY, isCompleted: true },
    ]);
    expect(questsProgress(rows, TUESDAY)).toEqual({ done: 1, total: 2, percent: 50, overdue: 1 });
  });

  it("menyelesaikan membalik status", () => {
    const row = toQuestRow({ id: "1", title: "q" })!;
    expect(applyQuestComplete(row).isCompleted).toBe(true);
    expect(applyQuestComplete(applyQuestComplete(row)).isCompleted).toBe(false);
  });
});
