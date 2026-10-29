/**
 * M08 — model layar Dashboard.
 *
 * Sumber bentuk data:
 *   `/api/dashboard/summary` -> `api_server.py::_dashboard_summary`
 *   `/api/me`                -> `api_server.py::_row_user`
 *
 * Dashboard ponsel BUKAN salinan DashboardPage PyQt. Desktop menampilkan
 * banyak kartu sekaligus karena layarnya lebar; di sini isinya diringkas jadi
 * tiga kelompok yang muat di satu guliran: hero (rank + level), progres hari
 * ini, dan ringkasan. Grafik korelasi tidur↔produktivitas sengaja tidak
 * digambar di ponsel — ia butuh lebar untuk terbaca, dan memaksanya berarti
 * kartu kecil dengan teks yang terpotong.
 */

import { percentOf } from "../tasks/model";

export interface UserSummary {
  id: string;
  displayName: string;
  avatarEmoji: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  gold: number;
  longestStreak: number;
  currency: string;
  selectedTitle: string;
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

export function toUserSummary(raw: unknown): UserSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  if (u.id === undefined || u.id === null) return null;
  return {
    id: String(u.id),
    displayName: str(u.displayName, str(u.username, "—")),
    avatarEmoji: str(u.avatarEmoji, str(u.avatar, "⚔️")),
    level: Math.max(1, Math.round(num(u.level, 1))),
    xp: Math.round(num(u.xp)),
    // Backend menghitung `xpToNextLevel = level * 150`. Kalau tidak ada,
    // dihitung ulang dengan rumus yang sama supaya bar XP tidak kosong.
    xpToNextLevel: Math.max(1, Math.round(num(u.xpToNextLevel, num(u.level, 1) * 150))),
    hp: Math.round(num(u.hp)),
    maxHp: Math.max(1, Math.round(num(u.maxHp, 50))),
    mp: Math.round(num(u.mp)),
    maxMp: Math.max(1, Math.round(num(u.maxMp, 30))),
    gold: Math.round(num(u.gold)),
    longestStreak: Math.round(num(u.longestStreak)),
    currency: str(u.currency, "IDR"),
    selectedTitle: str(u.selectedTitle),
  };
}

export interface RankInfo {
  rank: number;
  icon: string;
  /** Kunci i18n dari backend, mis. `rank_pemula`. */
  nameKey: string;
  descKey: string;
  score: number;
  maxScore: number;
  percent: number;
}

export function toRankInfo(raw: unknown): RankInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const maxScore = Math.max(1, Math.round(num(r.maxScore, 100)));
  const score = Math.round(num(r.score));
  return {
    rank: Math.round(num(r.rank)),
    icon: str(r.icon, "🥚"),
    nameKey: str(r.nameKey, "rank_pemula"),
    descKey: str(r.descKey, "rank_desc_pemula"),
    score,
    maxScore,
    percent: percentOf(score, maxScore),
  };
}

export interface TodayProgress {
  /** Kunci label, mis. `dashboard_habits`. */
  labelKey: string;
  done: number;
  total: number;
  percent: number;
}

export function toTodayProgress(raw: unknown): TodayProgress[] {
  // Bukan early-return untuk payload kosong: `toDashboardStats` dan
  // `toCalorieInfo` sudah memperlakukan masukan kosong sebagai `{}`, dan
  // layar Dashboard selalu merender bagian ini. Kalau fungsi ini kadang
  // mengembalikan tiga baris dan kadang nol, bagian "progres hari ini" akan
  // hilang-muncul tanpa sebab yang bisa dijelaskan.
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rows: TodayProgress[] = [
    {
      labelKey: "dashboard_habits",
      done: Math.round(num(s.habitsDoneToday)),
      total: Math.round(num(s.habitsTotal)),
      percent: 0,
    },
    {
      labelKey: "dashboard_dailies",
      done: Math.round(num(s.dailiesDoneToday)),
      total: Math.round(num(s.dailiesTotal)),
      percent: 0,
    },
    {
      labelKey: "dashboard_quests",
      done: Math.round(num(s.todosDone)),
      total: Math.round(num(s.todosTotal)),
      percent: 0,
    },
  ];
  for (const row of rows) row.percent = percentOf(row.done, row.total);
  return rows;
}

export interface DashboardStats {
  maxStreak: number;
  bossesKilled: number;
  totalTasksCompleted: number;
}

export function toDashboardStats(raw: unknown): DashboardStats {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    maxStreak: Math.round(num(s.maxStreak)),
    bossesKilled: Math.round(num(s.bossesKilled)),
    totalTasksCompleted: Math.round(num(s.totalTasksCompleted)),
  };
}

export interface CalorieInfo {
  today: number;
  goal: number;
  percent: number;
}

export function toCalorieInfo(raw: unknown): CalorieInfo {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const today = Math.round(num(s.caloriesToday));
  const goal = Math.max(1, Math.round(num(s.calorieGoal, 2000)));
  return { today, goal, percent: percentOf(today, goal) };
}

export interface HealthSummary {
  avgSteps: number;
  avgSleep: number;
  avgWater: number;
  daysRecorded: number;
}

export function toHealthSummary(raw: unknown): HealthSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const h = raw as Record<string, unknown>;
  const daysRecorded = Math.round(num(h.days_recorded));
  // Tanpa satu pun hari tercatat, angka rata-rata semua nol dan kartu hanya
  // menambah kebisingan. Lebih baik tidak ditampilkan.
  if (daysRecorded <= 0) return null;
  return {
    avgSteps: Math.round(num(h.avg_steps)),
    avgSleep: Math.round(num(h.avg_sleep) * 10) / 10,
    avgWater: Math.round(num(h.avg_water) * 10) / 10,
    daysRecorded,
  };
}

/**
 * Baris insight dari `db.get_insights`.
 *
 * Nilai katalognya memakai markdown (`**{day}**`) karena desktop merender HTML.
 * React Native tidak merender markdown, jadi `**` dibuang di sini — kalau
 * tidak, pengguna melihat tanda bintang mentah di tengah kalimat.
 */
export interface InsightLine {
  key: string;
  params: Record<string, string | number>;
}

export function toInsightLines(raw: unknown): InsightLine[] {
  if (!raw || typeof raw !== "object") return [];
  const i = raw as Record<string, unknown>;
  if (i.has_data !== true) return [];
  const out: InsightLine[] = [];
  if (typeof i.top_weekday === "string" && i.top_weekday !== "") {
    out.push({
      key: "insights_top_day",
      params: { day: i.top_weekday, n: Math.round(num(i.top_weekday_count)) },
    });
  }
  if (typeof i.best_day === "string" && i.best_day !== "") {
    out.push({
      key: "insights_best_day",
      params: { n: Math.round(num(i.best_day_count)), date: i.best_day },
    });
  }
  const longest = Math.round(num(i.longest_streak));
  if (longest > 0) out.push({ key: "insights_longest", params: { n: longest } });
  const focus = Math.round(num(i.focus_minutes));
  if (focus > 0) out.push({ key: "insights_focus", params: { n: focus } });
  const active = Math.round(num(i.active_streaks));
  if (active > 0) out.push({ key: "insights_active", params: { n: active } });
  return out;
}

export interface ActivityEntry {
  time: string;
  action: string;
  detail: string;
}

export function toRecentLog(raw: unknown): ActivityEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ActivityEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    out.push({
      time: str(e.ts),
      action: str(e.action),
      detail: str(e.detail),
    });
  }
  return out;
}
