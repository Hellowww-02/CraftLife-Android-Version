/**
 * M08 wave 3 — model layar Pomodoro.
 *
 * Sumber data:
 *   • `GET /api/pomodoro` -> `{ok, pomodoroSessions: [...]}` via `map_pomo`
 *   • `POST /api/pomodoro/complete {durationMinutes, label}` -> hasil
 *     `gain_xp_gold(...)` + `session_minutes` (`database.py:13038` menghitung
 *     1 XP/menit dan 1 Gold/5 menit, minimal 2).
 *
 * Yang perlu diketahui soal waktu: penghitung mundur di sini memakai
 * **selisih waktu**, bukan jumlah tick. `setInterval` di ponsel tidak dijamin
 * tepat 1 detik — bisa melambat saat layar mati atau CPU sibuk — jadi kalau
 * penghitung mengandalkan tick, sesi 25 menit bisa selesai dalam 27 menit
 * nyata. Dengan menyimpan `endsAt`, sisa waktu selalu benar walau tick-nya
 * telat.
 *
 * Fase ISTIRAHAT murni di sisi klien: backend tidak punya konsep istirahat
 * (tidak ada kolom atau endpoint untuk itu), jadi ia tidak dicatat dan tidak
 * disinkronkan. Yang dicatat hanya sesi fokus.
 */

export interface PomodoroSession {
  id: string;
  durationMinutes: number;
  completedAt: string;
  xpEarned: number;
  goldEarned: number;
  label: string;
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function toPomodoroSession(raw: unknown): PomodoroSession | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = r.id === undefined || r.id === null ? "" : String(r.id);
  if (!id) return null;
  return {
    id,
    durationMinutes: Math.round(num(r.durationMinutes)),
    completedAt: str(r.completedAt).slice(0, 16).replace("T", " "),
    xpEarned: Math.round(num(r.xpEarned)),
    goldEarned: Math.round(num(r.goldEarned)),
    label: str(r.label),
  };
}

export function toPomodoroSessions(rawList: unknown): PomodoroSession[] {
  if (!Array.isArray(rawList)) return [];
  const out: PomodoroSession[] = [];
  for (const raw of rawList) {
    const row = toPomodoroSession(raw);
    if (row) out.push(row);
  }
  // Terbaru dulu: riwayat dibaca untuk "kapan terakhir aku fokus?".
  return out.sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));
}

export interface PomodoroStats {
  sessions: number;
  minutes: number;
  xp: number;
  gold: number;
}

export function pomodoroStats(rows: readonly PomodoroSession[]): PomodoroStats {
  let minutes = 0;
  let xp = 0;
  let gold = 0;
  for (const row of rows) {
    minutes += row.durationMinutes;
    xp += row.xpEarned;
    gold += row.goldEarned;
  }
  return { sessions: rows.length, minutes, xp, gold };
}

/** Sesi yang `completedAt`-nya jatuh pada `ymd` (dibandingkan sebagai prefix). */
export function sessionsOn(rows: readonly PomodoroSession[], ymd: string): PomodoroSession[] {
  return rows.filter((row) => row.completedAt.slice(0, 10) === ymd);
}

/** Perkiraan XP/Gold untuk durasi tertentu, memakai rumus backend. */
export function estimateReward(minutes: number): { xp: number; gold: number } {
  const mins = Math.max(1, Math.round(minutes));
  return { xp: Math.max(1, mins * 1), gold: Math.max(2, Math.floor(mins / 5)) };
}

// ── Durasi baku ─────────────────────────────────────────────────────────────

export const FOCUS_PRESETS_MIN: readonly number[] = [15, 25, 45, 60] as const;
export const BREAK_MIN = 5;

// ── Mesin penghitung (murni, bisa dites tanpa timer nyata) ──────────────────

export type TimerPhase = "idle" | "focus" | "break" | "paused";

export interface TimerState {
  phase: TimerPhase;
  /** Panjang fase berjalan, dalam milidetik. */
  totalMs: number;
  /** Kapan fase berjalan berakhir; hanya berarti saat phase === "focus"|"break". */
  endsAt: number | null;
  /** Sisa saat dijeda, dalam milidetik. */
  pausedRemainingMs: number;
  /** Durasi fokus yang dipilih pengguna, dalam menit. */
  focusMinutes: number;
  label: string;
}

export function initialTimerState(focusMinutes = 25): TimerState {
  return {
    phase: "idle",
    totalMs: focusMinutes * 60000,
    endsAt: null,
    pausedRemainingMs: focusMinutes * 60000,
    focusMinutes,
    label: "",
  };
}

export function startFocus(state: TimerState, nowMs: number): TimerState {
  return {
    ...state,
    phase: "focus",
    totalMs: state.focusMinutes * 60000,
    endsAt: nowMs + state.focusMinutes * 60000,
    pausedRemainingMs: state.focusMinutes * 60000,
  };
}

export function pause(state: TimerState, nowMs: number): TimerState {
  if (state.phase !== "focus" && state.phase !== "break") return state;
  const remaining = state.endsAt === null ? 0 : Math.max(0, state.endsAt - nowMs);
  return { ...state, phase: "paused", endsAt: null, pausedRemainingMs: remaining };
}

export function resume(state: TimerState, nowMs: number): TimerState {
  if (state.phase !== "paused") return state;
  // Fase asal tidak disimpan terpisah; istirahat hanya bisa dijeda dari
  // "break", dan itu ditandai dengan totalMs yang lebih pendek dari fokus.
  const wasBreak = state.totalMs <= BREAK_MIN * 60000;
  return { ...state, phase: wasBreak ? "break" : "focus", endsAt: nowMs + state.pausedRemainingMs };
}

export function startBreak(state: TimerState, nowMs: number): TimerState {
  return {
    ...state,
    phase: "break",
    totalMs: BREAK_MIN * 60000,
    endsAt: nowMs + BREAK_MIN * 60000,
    pausedRemainingMs: BREAK_MIN * 60000,
  };
}

export function reset(state: TimerState): TimerState {
  return initialTimerState(state.focusMinutes);
}

export function setFocusMinutes(state: TimerState, minutes: number): TimerState {
  // Tidak boleh mengubah durasi di tengah sesi yang sedang berjalan: itu akan
  // membuat XP yang dicatat tidak cocok dengan waktu yang benar-benar dipakai.
  if (state.phase === "focus" || state.phase === "break") return state;
  const mins = Math.max(1, Math.round(minutes));
  return { ...initialTimerState(mins), label: state.label };
}

export function setLabel(state: TimerState, label: string): TimerState {
  return { ...state, label };
}

/** Sisa milidetik. 0 berarti selesai. Tidak pernah negatif. */
export function remainingMs(state: TimerState, nowMs: number): number {
  if (state.phase === "paused") return Math.max(0, state.pausedRemainingMs);
  if (state.endsAt === null) return Math.max(0, state.totalMs);
  return Math.max(0, state.endsAt - nowMs);
}

export function isFinished(state: TimerState, nowMs: number): boolean {
  return (state.phase === "focus" || state.phase === "break") && remainingMs(state, nowMs) === 0;
}

/** Persentase 0..100 untuk cincin/ bar progres. */
export function progressPercent(state: TimerState, nowMs: number): number {
  if (state.totalMs <= 0) return 0;
  const done = state.totalMs - remainingMs(state, nowMs);
  return Math.max(0, Math.min(100, Math.round((done / state.totalMs) * 100)));
}

/** "25:00" — format yang dipakai jam fokus. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Payload `POST /api/pomodoro/complete`.
 *
 * `durationMinutes` diambil dari durasi yang DIPILIH, bukan dari sisa waktu:
 * kalau pengguna berhenti 30 detik lebih awal lalu tetap menekan selesai, yang
 * dicatat adalah sesi penuh yang ia jalani. Backend juga membulatkan ke menit.
 */
export function completePayload(state: TimerState): Record<string, unknown> {
  return {
    durationMinutes: Math.max(1, Math.round(state.focusMinutes)),
    label: state.label.trim(),
  };
}

/** Baca hasil server; field-nya snake_case karena berasal dari `gain_xp_gold`. */
export function readReward(raw: unknown): { xp: number; gold: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const result = (r.result && typeof r.result === "object" ? r.result : r) as Record<string, unknown>;
  const xp = num(result.xp_gained, Number.NaN);
  const gold = num(result.gold_gained, Number.NaN);
  if (Number.isNaN(xp) && Number.isNaN(gold)) return null;
  return { xp: Number.isNaN(xp) ? 0 : xp, gold: Number.isNaN(gold) ? 0 : gold };
}
