/**
 * M08 — model Dashboard, Profile, dan Settings.
 *
 * Yang dijaga di sini: layar ringkasan tidak boleh MENGARANG angka. Payload
 * yang hilang sebagian harus menghasilkan nol atau `null` yang jujur, bukan
 * NaN yang merender jadi "NaN" di layar, dan bukan nilai default yang
 * terlihat seperti data sungguhan.
 */

import { describe, expect, it } from "vitest";

import {
  toCalorieInfo,
  toDashboardStats,
  toHealthSummary,
  toInsightLines,
  toRankInfo,
  toRecentLog,
  toTodayProgress,
  toUserSummary,
} from "../src/features/dashboard/model";
import {
  draftError,
  emptyProfileDraft,
  profileBars,
  profileHeader,
  profilePayload,
  profileStats,
  toClassOptions,
  toTitleOptions,
} from "../src/features/profile/model";
import {
  FONT_SCALE_OPTIONS,
  isFontScale,
  languageOptions,
  nearestFontScale,
  SETTINGS_SECTIONS,
  settingsPayload,
  themeOptions,
  toAboutState,
  toAppearanceState,
} from "../src/features/settings/model";
import { translate } from "../src/i18n";
import { themeKeys } from "../src/theme/tokens";

describe("toUserSummary", () => {
  it("payload lengkap dipetakan apa adanya", () => {
    const user = toUserSummary({
      id: "7",
      displayName: "Rani",
      avatarEmoji: "🧙",
      level: 4,
      xp: 120,
      xpToNextLevel: 600,
      hp: 40,
      maxHp: 50,
      mp: 10,
      maxMp: 30,
      gold: 1500,
      longestStreak: 12,
      currency: "IDR",
      selectedTitle: "Penjelajah",
    })!;
    expect(user.displayName).toBe("Rani");
    expect(user.xpToNextLevel).toBe(600);
    expect(user.gold).toBe(1500);
  });

  it("tanpa id menghasilkan null, bukan pengguna hantu", () => {
    expect(toUserSummary({})).toBeNull();
    expect(toUserSummary(null)).toBeNull();
  });

  it("xpToNextLevel yang hilang dihitung dengan rumus backend (level*150)", () => {
    const user = toUserSummary({ id: "1", level: 3, xp: 10 })!;
    expect(user.xpToNextLevel).toBe(450);
  });

  it("maxHp 0 tidak dibiarkan — akan jadi pembagian nol", () => {
    const user = toUserSummary({ id: "1", maxHp: 0, maxMp: 0, level: 0 })!;
    expect(user.maxHp).toBeGreaterThan(0);
    expect(user.maxMp).toBeGreaterThan(0);
    expect(user.level).toBe(1);
  });

  it("angka rusak jadi 0, bukan NaN", () => {
    const user = toUserSummary({ id: "1", xp: "banyak", gold: null })!;
    expect(user.xp).toBe(0);
    expect(user.gold).toBe(0);
    expect(Number.isNaN(user.xp)).toBe(false);
  });
});

describe("toRankInfo", () => {
  it("persentase dihitung dari score/maxScore", () => {
    const rank = toRankInfo({ rank: 2, icon: "🥈", nameKey: "rank_ksatria", descKey: "rank_desc_ksatria", score: 50, maxScore: 200 })!;
    expect(rank.percent).toBe(25);
    expect(rank.nameKey).toBe("rank_ksatria");
  });

  it("maxScore 0 tidak menghasilkan NaN", () => {
    const rank = toRankInfo({ score: 5, maxScore: 0 })!;
    expect(Number.isNaN(rank.percent)).toBe(false);
    expect(rank.percent).toBeGreaterThanOrEqual(0);
  });

  it("payload kosong menghasilkan null", () => {
    expect(toRankInfo(undefined)).toBeNull();
  });
});

describe("toTodayProgress", () => {
  it("tiga baris: habits, dailies, quests", () => {
    const rows = toTodayProgress({
      habitsDoneToday: 2,
      habitsTotal: 4,
      dailiesDoneToday: 1,
      dailiesTotal: 1,
      todosDone: 0,
      todosTotal: 0,
    });
    expect(rows.map((r) => r.labelKey)).toEqual(["dashboard_habits", "dashboard_dailies", "dashboard_quests"]);
    expect(rows.map((r) => r.percent)).toEqual([50, 100, 0]);
  });

  it("stats kosong menghasilkan tiga baris nol, bukan array kosong", () => {
    const rows = toTodayProgress(undefined);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.total === 0 && r.percent === 0)).toBe(true);
  });
});

describe("toHealthSummary", () => {
  it("tanpa satu pun hari tercatat menghasilkan null", () => {
    // Kartu berisi rata-rata 0 semua hanya menambah kebisingan.
    expect(toHealthSummary({ avg_steps: 0, avg_sleep: 0, days_recorded: 0 })).toBeNull();
  });

  it("dengan data, rata-rata dibulatkan satu desimal", () => {
    const h = toHealthSummary({ avg_steps: 8123.6, avg_sleep: 7.44, avg_water: 2.05, days_recorded: 9 })!;
    expect(h.avgSteps).toBe(8124);
    expect(h.avgSleep).toBe(7.4);
    expect(h.daysRecorded).toBe(9);
  });
});

describe("toCalorieInfo", () => {
  it("goal 0 tidak menghasilkan Infinity", () => {
    const c = toCalorieInfo({ caloriesToday: 500, calorieGoal: 0 });
    expect(Number.isFinite(c.percent)).toBe(true);
    expect(c.percent).toBeLessThanOrEqual(100);
  });
});

describe("toInsightLines", () => {
  it("has_data false menghasilkan tidak ada baris", () => {
    expect(toInsightLines({ has_data: false, longest_streak: 99 })).toEqual([]);
  });

  it("hanya insight yang punya nilai yang muncul", () => {
    const lines = toInsightLines({
      has_data: true,
      top_weekday: "Selasa",
      top_weekday_count: 8,
      best_day: "2026-09-01",
      best_day_count: 11,
      longest_streak: 0,
      focus_minutes: 0,
      active_streaks: 3,
    });
    expect(lines.map((l) => l.key)).toEqual(["insights_top_day", "insights_best_day", "insights_active"]);
  });

  it("kunci insight yang dipakai benar-benar ada di katalog i18n", () => {
    const lines = toInsightLines({
      has_data: true,
      top_weekday: "Selasa",
      top_weekday_count: 8,
      best_day: "2026-09-01",
      best_day_count: 11,
      longest_streak: 5,
      focus_minutes: 90,
      active_streaks: 2,
    });
    for (const line of lines) {
      expect(translate(line.key, "id"), `kunci tidak ada: ${line.key}`).not.toBe(line.key);
    }
  });
});

describe("toRecentLog", () => {
  it("bukan array menghasilkan kosong", () => {
    expect(toRecentLog(undefined)).toEqual([]);
  });

  it("entri tanpa detail tetap muncul", () => {
    const rows = toRecentLog([{ ts: "09:12", action: "habit_complete" }, null, "x"]);
    expect(rows).toEqual([{ time: "09:12", action: "habit_complete", detail: "" }]);
  });
});

describe("Profile", () => {
  const user = toUserSummary({
    id: "1",
    displayName: "Rani",
    avatarEmoji: "🧙",
    level: 4,
    xp: 300,
    xpToNextLevel: 600,
    hp: 25,
    maxHp: 50,
    mp: 30,
    maxMp: 30,
    gold: 900,
    longestStreak: 7,
    selectedTitle: "Penjelajah",
  })!;

  it("tiga bar progres: XP, HP, MP", () => {
    const bars = profileBars(user);
    expect(bars.map((b) => b.labelKey)).toEqual(["dashboard_xp", "dashboard_hp", "dashboard_mp"]);
    expect(bars.map((b) => b.percent)).toEqual([50, 50, 100]);
  });

  it("header membawa gelar terpilih", () => {
    expect(profileHeader(user)).toEqual({
      displayName: "Rani",
      avatarEmoji: "🧙",
      level: 4,
      title: "Penjelajah",
    });
  });

  it("statistik memakai label katalog yang ada", () => {
    for (const stat of profileStats(user)) {
      expect(translate(stat.labelKey, "id")).not.toBe(stat.labelKey);
    }
  });

  it("gelar tanpa kunci dilewati", () => {
    const options = toTitleOptions(
      [
        { key: "penjelajah", label: "Penjelajah" },
        { label: "tanpa kunci" },
        { key: "ksatria", name: "Ksatria" },
      ],
      "ksatria",
    );
    expect(options.map((o) => o.key)).toEqual(["penjelajah", "ksatria"]);
    expect(options.map((o) => o.selected)).toEqual([false, true]);
  });

  it("class tanpa kunci dilewati", () => {
    expect(toClassOptions([{ name: "tanpa kunci" }, { key: "mage", name: "Mage", icon: "🧙" }], "mage")).toEqual([
      { key: "mage", name: "Mage", icon: "🧙", bonus: "", selected: true },
    ]);
  });

  it("nama tampilan kosong ditolak sebelum dikirim", () => {
    const draft = { ...emptyProfileDraft(user), displayName: "   " };
    expect(draftError(draft)).toBe("empty-name");
    expect(profilePayload({ ...draft, displayName: " Rani " }).displayName).toBe("Rani");
  });
});

describe("Settings", () => {
  it("12 tema ditawarkan dan labelnya bukan string kosong", () => {
    const options = themeOptions("modern_dark");
    expect(options).toHaveLength(themeKeys.length);
    expect(options.every((o) => o.label.length > 0)).toBe(true);
    expect(options.filter((o) => o.selected).map((o) => o.key)).toEqual(["modern_dark"]);
  });

  it("dua bahasa, dan yang aktif ditandai", () => {
    const options = languageOptions("en");
    expect(options.map((o) => o.key)).toEqual(["id", "en"]);
    expect(options.map((o) => o.selected)).toEqual([false, true]);
    for (const option of options) expect(translate(option.labelKey, "id")).not.toBe(option.labelKey);
  });

  it("skala font tak dikenal dibulatkan ke pilihan terdekat", () => {
    expect(isFontScale(100)).toBe(true);
    expect(isFontScale(107)).toBe(false);
    expect(nearestFontScale(107)).toBe(100);
    expect(nearestFontScale(124)).toBe(130);
    expect(nearestFontScale("aneh")).toBe(100);
    expect(FONT_SCALE_OPTIONS.every((v) => nearestFontScale(v) === v)).toBe(true);
  });

  it("tema yang tidak dikenal jatuh ke default", () => {
    expect(toAppearanceState({ theme: "tema_yang_dihapus" }).themeKey).toBe("modern_dark");
    expect(toAppearanceState({ theme: "sakura" }).themeKey).toBe("sakura");
  });

  it("bahasa selain en dianggap id", () => {
    expect(toAppearanceState({ language: "en" }).language).toBe("en");
    expect(toAppearanceState({ language: "jv" }).language).toBe("id");
    expect(toAppearanceState(undefined).language).toBe("id");
  });

  it("payload hanya memuat field yang dibaca handler /api/settings", () => {
    // fontScale & highContrast TIDAK dibaca handler itu; mengirimnya akan
    // memberi kesan tersimpan padahal tidak.
    const payload = settingsPayload({ themeKey: "sakura", language: "en" });
    expect(payload).toEqual({ theme: "sakura", language: "en" });
    expect(settingsPayload({})).toEqual({});
  });

  it("empat bagian dengan label yang ada di katalog", () => {
    expect(SETTINGS_SECTIONS.map((s) => s.key)).toEqual(["appearance", "account", "sync", "about"]);
    for (const section of SETTINGS_SECTIONS) {
      expect(translate(section.labelKey, "id"), `label tidak ada: ${section.labelKey}`).not.toBe(section.labelKey);
    }
  });

  it("versi memakai kunci berformat {version}", () => {
    const about = toAboutState("1.7.4");
    expect(about.versionLabelKey).toBe("update_version");
    expect(translate(about.versionLabelKey, "id", { version: about.version })).toContain("1.7.4");
  });
});
