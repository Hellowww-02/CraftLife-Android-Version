/**
 * M15b — router cloud: bentuk respons harus sama dengan api_server.py.
 * Fixture payload = baris DB (snake_case) seperti yang disinkronkan desktop.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({
  getItemAsync: async (): Promise<string | null> => null,
  setItemAsync: async (): Promise<void> => {},
  deleteItemAsync: async (): Promise<void> => {},
}));

import {
  handleCloudRequest,
  mapDaily,
  mapHabit,
  mapTodo,
} from "../src/cloud/backend";
import { setCloudSession } from "../src/cloud/supabase";

const UUID = "11111111-2222-3333-4444-555555555555";

describe("mapper = kontrak api_server.py", () => {
  it("mapHabit: snake_case -> bentuk layar (camelCase)", () => {
    const out = mapHabit(
      {
        id: 7,
        name: "Olahraga",
        notes: "pagi",
        folder_id: 3,
        difficulty: "HARD",
        positive: 1,
        negative: 0,
        streak: 4,
        fail_streak: 1,
        created_at: "2026-11-01",
        icon: "💪",
        done_today: 1,
        sort_order: 2,
      },
      UUID,
    );
    expect(out).toMatchObject({
      id: UUID,
      title: "Olahraga",
      notes: "pagi",
      folderId: "3",
      difficulty: "hard",
      isPositive: true,
      isNegative: false,
      positiveStreak: 4,
      negativeStreak: 1,
      icon: "💪",
      doneToday: true,
      sortOrder: 2,
    });
  });

  it("mapHabit: difficulty tidak sah jatuh ke medium, streak TIDAK fallback ke counter", () => {
    const out = mapHabit({ name: "x", streak: 0, counter_up: 99, difficulty: "legend" }, UUID);
    expect(out.difficulty).toBe("medium");
    expect(out.positiveStreak).toBe(0);
  });

  it("mapDaily: freeze & repeat", () => {
    const out = mapDaily(
      { name: "Baca", streak: 2, done_today: 0, freeze_slots: 1, repeat_days: "1,3", last_done: "2026-11-01" },
      UUID,
    );
    expect(out).toMatchObject({
      streak: 2,
      isCompletedToday: false,
      isFrozen: true,
      repeatDays: [1, 3],
      lastCompletedDate: "2026-11-01",
    });
  });

  it("mapTodo: done -> isCompleted", () => {
    const out = mapTodo({ name: "Beli", priority: "easy", done: 1, due_date: "2026-12-01" }, UUID);
    expect(out).toMatchObject({ difficulty: "easy", isCompleted: true, dueDate: "2026-12-01" });
  });
});

describe("router cloud", () => {
  beforeEach(() => {
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "https://contoh.supabase.co");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_test");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    setCloudSession(null, null);
  });

  it("GET /api/habits -> {ok, habits:[...]} dari sync_entities", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(String(url)).toContain("/rest/v1/sync_entities");
      return new Response(JSON.stringify([{ entity_uuid: UUID, payload: { name: "A", streak: 1 } }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));
    const res = await handleCloudRequest("/api/habits");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.habits).toHaveLength(1);
    expect(body.habits[0].title).toBe("A");
  });

  it("POST aksi memanggil RPC yang tepat", async () => {
    const calls: Array<[string, unknown]> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([String(url), init?.body ? JSON.parse(String(init.body)) : null]);
      return new Response(JSON.stringify({ ok: true, leveled_up: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));
    await handleCloudRequest(`/api/habits/${UUID}/complete`, { method: "POST" });
    expect(calls[0]![0]).toContain("/rest/v1/rpc/m15_complete_habit");
    expect(calls[0]![1]).toMatchObject({ p_uuid: UUID, p_direction: "up" });

    await handleCloudRequest(`/api/habits/${UUID}/fail`, { method: "POST" });
    expect(calls[1]![1]).toMatchObject({ p_direction: "down" });

    await handleCloudRequest(`/api/dailies/${UUID}/fail`, { method: "POST" });
    expect(calls[2]![0]).toContain("m15_fail_daily");
  });

  it("endpoint yang belum pindah menjawab cloud_pending — jujur, bukan palsu", async () => {
    const res = await handleCloudRequest("/api/music/library");
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe("cloud_pending:/api/music/library");
  });

  it("tanpa konfigurasi Supabase, error jelas", async () => {
    vi.unstubAllEnvs();
    vi.stubGlobal("fetch", vi.fn());
    const res = await handleCloudRequest("/api/habits");
    const body = await res.json();
    expect(String(body.error)).toContain("cloud_error");
  });
});
