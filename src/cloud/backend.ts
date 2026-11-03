/**
 * M15b — router backend cloud: bentuk respons SAMA dengan `api_server.py`.
 *
 * Mapper di bawah disalin dari `api_server.py` (_map_habit L…, _map_daily,
 * _map_todo) — JANGAN "dirapikan": kontrak layar Android membaca bentuk ini.
 * Sumber data = `sync_entities` (payload jsonb yang sama dengan yang
 * disinkronkan desktop) + RPC aturan M15 (m15_complete_* dst.).
 *
 * Integrasi: `installCloudFetchShim()` membungkus global fetch; URL yang
 * diawali `cloud://api` diarahkan ke sini (lihat adapter.ts — saat mode
 * cloud, apiBase() mengembalikan sentinel itu).
 */

import {
  cloudAccessToken,
  cloudConfig,
  hasCloudSession,
  restGet,
  rpc,
  setCloudSession,
} from "./supabase";

// ── Mapper (sumber: api_server.py) ─────────────────────────────────────────

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function int(v: unknown): number {
  return typeof v === "number" ? v : parseInt(str(v) || "0", 10) || 0;
}
function bool(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

const DIFFS = new Set(["trivial", "easy", "medium", "hard", "epic"]);

export function mapHabit(h: Row, entityUuid: string): Row {
  const diff = DIFFS.has(str(h.difficulty).toLowerCase()) ? str(h.difficulty).toLowerCase() : "medium";
  return {
    id: entityUuid,
    title: str(h.name),
    notes: str(h.notes),
    folderId: h.folder_id ? str(h.folder_id) : null,
    difficulty: diff,
    isPositive: bool(h.positive ?? 1),
    isNegative: bool(h.negative ?? 0),
    positiveStreak: int(h.streak),
    negativeStreak: int(h.fail_streak),
    history: [],
    createdAt: str(h.created_at),
    icon: str(h.icon) || "⚔️",
    doneToday: bool(h.done_today),
    sortOrder: int(h.sort_order),
  };
}

function parseRepeat(v: unknown): number[] {
  // padanan _parse_repeat: "1,3,5" -> [1,3,5]; kosong -> setiap hari [0..6]
  const s = str(v).trim();
  if (!s) return [0, 1, 2, 3, 4, 5, 6];
  return s.split(",").map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
}

export function mapDaily(d: Row, entityUuid: string): Row {
  const diff = DIFFS.has(str(d.difficulty).toLowerCase()) ? str(d.difficulty).toLowerCase() : "medium";
  return {
    id: entityUuid,
    title: str(d.name),
    notes: str(d.notes),
    folderId: d.folder_id ? str(d.folder_id) : null,
    difficulty: diff,
    streak: int(d.streak),
    isCompletedToday: bool(d.done_today),
    repeatDays: parseRepeat(d.repeat_days),
    lastCompletedDate: d.last_done ?? null,
    isFrozen: int(d.freeze_slots) > 0,
    createdAt: str(d.created_at),
    icon: str(d.icon) || "📅",
    sortOrder: int(d.sort_order),
  };
}

export function mapTodo(t: Row, entityUuid: string): Row {
  const prio = DIFFS.has(str(t.priority).toLowerCase()) ? str(t.priority).toLowerCase() : "medium";
  return {
    id: entityUuid,
    title: str(t.name),
    notes: str(t.notes),
    folderId: t.folder_id ? str(t.folder_id) : null,
    difficulty: prio,
    dueDate: t.due_date ?? null,
    isCompleted: bool(t.done),
    completedAt: null,
    createdAt: str(t.created_at),
    icon: str(t.icon) || "📜",
    sortOrder: int(t.sort_order),
  };
}

interface SyncEntityRow {
  entity_uuid: string;
  payload: Row;
}

async function listEntities(table: string, mapper: (p: Row, uuid: string) => Row): Promise<Row[]> {
  const rows = await restGet<SyncEntityRow[]>(
    `sync_entities?select=entity_uuid,payload&table_name=eq.${table}&deleted_at=is.null&order=server_updated_at.desc`,
  );
  return rows.map((r) => mapper(r.payload ?? {}, r.entity_uuid));
}

// ── Router ─────────────────────────────────────────────────────────────────

export async function handleCloudRequest(path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  try {
    if (path === "/api/clock") {
      return json({ ok: true, now: new Date().toISOString(), serverDate: new Date().toISOString().slice(0, 10) });
    }

    if (path === "/api/me") {
      if (!hasCloudSession()) return json({ ok: false, error: "unauthorized" }, 401);
      const cfg = cloudConfig();
      const res = await fetch(`${cfg!.url}/auth/v1/user`, {
        headers: { apikey: cfg!.anonKey, Authorization: `Bearer ${cloudAccessToken()}` },
      });
      if (!res.ok) return json({ ok: false, error: "unauthorized" }, 401);
      const u = (await res.json()) as { id?: string; email?: string };
      return json({ ok: true, user: { id: String(u.id ?? ""), username: u.email ?? "", displayName: u.email ?? "" } });
    }

    // Daftar entitas tracker (bentuk: {ok, <entitas>: [...]} — kontrak api_server)
    const listMatch = /^\/api\/(habits|dailies|todos)$/.exec(path);
    if (listMatch && method === "GET") {
      const kind = listMatch[1]!;
      const table = kind === "todos" ? "todos" : kind;
      const mapper = kind === "habits" ? mapHabit : kind === "dailies" ? mapDaily : mapTodo;
      const items = await listEntities(table, mapper);
      return json({ ok: true, [kind === "todos" ? "todos" : kind]: items });
    }

    // Aksi aturan M15: /api/<entity>/<uuid>/<aksi>
    const action = /^\/api\/(habits|dailies|todos|sport)\/([0-9a-fA-F-]{36})\/(\w+)$/.exec(path);
    if (action && method === "POST") {
      const [, entity, uuid, act] = action;
      const fn =
        entity === "habits" && act === "complete" ? "m15_complete_habit"
        : entity === "habits" && act === "fail" ? "m15_complete_habit"
        : entity === "dailies" && act === "complete" ? "m15_complete_daily"
        : entity === "dailies" && act === "fail" ? "m15_fail_daily"
        : entity === "dailies" && act === "freeze" ? "m15_add_freeze_to_daily"
        : entity === "todos" && act === "complete" ? "m15_complete_todo"
        : entity === "sport" && act === "complete" ? "m15_complete_sport_activity"
        : null;
      if (!fn) return json({ ok: false, error: `cloud_pending:${path}` }, 501);
      const args: Record<string, unknown> = { p_uuid: uuid };
      if (fn === "m15_complete_habit") args.p_direction = act === "fail" ? "down" : "up";
      const result = await rpc<Row>(fn, args);
      return json(result);
    }

    if (path === "/api/pomodoro/complete" && method === "POST") {
      const body = (init?.body ? JSON.parse(String(init.body)) : {}) as { minutes?: number; taskName?: string };
      const result = await rpc<Row>("m15_complete_pomodoro", {
        p_minutes: int(body.minutes),
        p_task_name: str(body.taskName),
      });
      return json(result);
    }

    // Belum dipindah ke cloud — JUJUR, bukan palsu.
    return json({ ok: false, error: `cloud_pending:${path}` }, 501);
  } catch (e) {
    return json({ ok: false, error: `cloud_error:${str(e).slice(0, 120)}` }, 502);
  }
}

// ── Shim fetch global ──────────────────────────────────────────────────────

const CLOUD_PREFIX = "cloud://api";

let installed = false;

export function installCloudFetchShim(): void {
  if (installed) return;
  installed = true;
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (url.startsWith(CLOUD_PREFIX)) {
      return handleCloudRequest(url.slice(CLOUD_PREFIX.length), init);
    }
    return originalFetch(input as RequestInfo, init);
  };
}

/** Untuk tes. */
export function __resetCloudShimForTests(): void {
  installed = false;
}
