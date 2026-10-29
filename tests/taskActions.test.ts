/**
 * M08 — protokol tulis offline-first + transport sync.
 *
 * Skenario yang diuji di sini adalah alasan aplikasi ini ada: pengguna menekan
 * tombol di tempat tanpa sinyal. Empat hasil harus benar dan berbeda:
 *
 *   sukses   -> cache diperbarui, TIDAK ada baris outbox (sudah sampai server)
 *   offline  -> cache diperbarui DAN baris outbox dibuat (P6: data tidak hilang)
 *   ditolak  -> cache dikembalikan, TIDAK ada baris outbox (P5: tidak bohong)
 *   payload  -> payload rusak tidak dikirim sebagai `{}` yang akan menghapus
 *               field di server
 */

import { describe, expect, it } from "vitest";

import {
  ENTITY_LIST_ROUTES,
  errorMessage,
  httpRemoteSource,
  isListableEntity,
  isNetworkFailure,
  type ApiCalls,
} from "../src/data/httpApi";
import { localUserIdFrom, ANONYMOUS_LOCAL_USER_ID } from "../src/data/identity";
import { Repository, type CachePort, type CachedRow, type WatermarkPort } from "../src/data/repository";
import { loadEntity, loadRemote, writeTask } from "../src/data/taskActions";
import { MemoryOutboxStore } from "../src/sync/memoryStore";
import { Outbox, type OutboxRow } from "../src/sync/outbox";
import { apiTransport, pushRow, TRANSPORT_ENTITY_BASE } from "../src/sync/apiTransport";

const UID = 9;

// ── Test doubles ────────────────────────────────────────────────────────────

class MemoryCache implements CachePort {
  /** kunci "entityType:entityLocalId" -> baris, meniru PK gabungan SQLite. */
  readonly map = new Map<string, CachedRow & { entity_type: string }>();
  key(type: string, id: string) {
    return `${type}:${id}`;
  }
  async list(_uid: number, entityType: string): Promise<CachedRow[]> {
    return [...this.map.values()].filter((row) => row.entity_type === entityType);
  }
  async get(_uid: number, entityType: string, id: string): Promise<CachedRow | null> {
    const row = this.map.get(this.key(entityType, id));
    return row ? { entity_local_id: row.entity_local_id, payload: row.payload, server_updated_at: row.server_updated_at } : null;
  }
  async put(
    _uid: number,
    entityType: string,
    id: string,
    payload: unknown,
    serverUpdatedAt: string | null = null,
  ): Promise<void> {
    this.map.set(this.key(entityType, id), {
      entity_type: entityType,
      entity_local_id: id,
      payload: JSON.stringify(payload ?? {}),
      server_updated_at: serverUpdatedAt,
    });
  }
  async remove(_uid: number, entityType: string, id: string): Promise<void> {
    this.map.delete(this.key(entityType, id));
  }
}

class MemoryWatermarks implements WatermarkPort {
  private readonly map = new Map<string, string>();
  async get(_uid: number, entityType: string) {
    return this.map.get(entityType) ?? null;
  }
  async advance(_uid: number, entityType: string, value: string) {
    this.map.set(entityType, value);
  }
}

interface Recorder {
  posts: Array<{ path: string; body: unknown }>;
  gets: string[];
}

/** ApiCalls tiruan yang perilakunya bisa diatur per tes. */
function fakeApi(options: {
  postError?: unknown;
  getError?: unknown;
  list?: Record<string, unknown[]>;
}): ApiCalls & Recorder {
  const rec: Recorder = { posts: [], gets: [] };
  const list = options.list ?? {};
  return {
    posts: rec.posts,
    gets: rec.gets,
    async post<T = unknown>(path: string, body?: unknown): Promise<T> {
      rec.posts.push({ path, body });
      if (options.postError) throw options.postError;
      return { ok: true } as T;
    },
    async get<T = unknown>(path: string): Promise<T> {
      rec.gets.push(path);
      if (options.getError) throw options.getError;
      for (const [entityType, route] of Object.entries(ENTITY_LIST_ROUTES)) {
        if (route.path === path) return { [route.field]: list[entityType] ?? [] } as T;
      }
      return { ok: true } as T;
    },
  };
}

function makeRepo(cache: MemoryCache, outbox: Outbox) {
  return new Repository({
    cache,
    watermarks: new MemoryWatermarks(),
    outbox,
    remote: { async list() { return { rows: [], watermark: null }; } },
    localUserId: UID,
  });
}

// ── Klasifikasi error ───────────────────────────────────────────────────────

describe("isNetworkFailure — memisahkan koneksi putus dari penolakan server", () => {
  it("TypeError dari fetch adalah kegagalan jaringan", () => {
    expect(isNetworkFailure(new TypeError("Network request failed"))).toBe(true);
  });

  it("Error biasa dari respons non-2xx bukan kegagalan jaringan", () => {
    expect(isNetworkFailure(new Error("empty"))).toBe(false);
    expect(isNetworkFailure(new Error("HTTP 400"))).toBe(false);
  });

  it("pesan koneksi khas dikenali walau bukan TypeError", () => {
    expect(isNetworkFailure(new Error("ECONNREFUSED 10.0.2.2:8765"))).toBe(true);
    expect(isNetworkFailure(new Error("Failed to fetch"))).toBe(true);
  });

  it("errorMessage tidak pernah menghasilkan string kosong", () => {
    expect(errorMessage(new Error("x"))).toBe("x");
    expect(errorMessage(undefined)).toBe("unknown");
  });
});

describe("localUserIdFrom", () => {
  it("id angka dari API desktop dipakai apa adanya", () => {
    expect(localUserIdFrom("7")).toBe(7);
    expect(localUserIdFrom(7)).toBe(7);
  });

  it("UUID Supabase TIDAK dipaksa jadi angka", () => {
    // Number("1f0c…") = NaN. Kalau NaN dipakai sebagai kunci cache, semua
    // pengguna berbagi satu ruang cache.
    expect(localUserIdFrom("1f0c9a2e-6b1d-4d3a-9a55-abc")).toBe(ANONYMOUS_LOCAL_USER_ID);
    expect(Number.isNaN(localUserIdFrom("1f0c"))).toBe(false);
  });

  it("nilai aneh jatuh ke 0, bukan NaN", () => {
    expect(localUserIdFrom(null)).toBe(0);
    expect(localUserIdFrom("")).toBe(0);
    expect(localUserIdFrom("-3")).toBe(0);
    expect(localUserIdFrom("0")).toBe(0);
  });
});

// ── Protokol tulis ──────────────────────────────────────────────────────────

describe("writeTask", () => {
  const write = {
    path: "/api/habits/12/complete",
    body: { positive: true },
    entityType: "habits",
    entityId: "12",
    nextPayload: { id: "12", doneToday: true },
    previousPayload: { id: "12", doneToday: false },
  };

  it("sukses: cache diperbarui dan TIDAK ada yang diantrekan", async () => {
    const cache = new MemoryCache();
    const outbox = new Outbox(new MemoryOutboxStore());
    const api = fakeApi({});
    const repo = makeRepo(cache, outbox);

    const result = await writeTask({ api, repo }, write);

    expect(result.kind).toBe("synced");
    expect(api.posts).toEqual([{ path: write.path, body: write.body }]);
    expect(JSON.parse((await cache.get(UID, "habits", "12"))!.payload)).toEqual(write.nextPayload);
    expect(await outbox.pendingCount(UID)).toBe(0);
  });

  it("jaringan putus: cache diperbarui DAN perubahan diantrekan", async () => {
    const cache = new MemoryCache();
    const outbox = new Outbox(new MemoryOutboxStore());
    const api = fakeApi({ postError: new TypeError("Network request failed") });
    const repo = makeRepo(cache, outbox);

    const result = await writeTask({ api, repo }, write);

    expect(result.kind).toBe("queued");
    expect(await outbox.pendingCount(UID)).toBe(1);
    const rows = await outbox.drain(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.operation).toBe("upsert");
    expect(rows[0]!.entity_local_id).toBe("12");
  });

  it("server menolak: cache dikembalikan dan TIDAK diantrekan", async () => {
    const cache = new MemoryCache();
    const outbox = new Outbox(new MemoryOutboxStore());
    const api = fakeApi({ postError: new Error("empty") });
    const repo = makeRepo(cache, outbox);

    const result = await writeTask({ api, repo }, write);

    expect(result).toEqual({ kind: "failed", reason: "empty" });
    // Cache harus kembali ke keadaan sebelumnya, bukan tetap menampilkan
    // perubahan yang tidak pernah disimpan server.
    expect(JSON.parse((await cache.get(UID, "habits", "12"))!.payload)).toEqual(write.previousPayload);
    expect(await outbox.pendingCount(UID)).toBe(0);
  });

  it("hapus yang gagal karena jaringan diantrekan sebagai delete", async () => {
    const cache = new MemoryCache();
    const outbox = new Outbox(new MemoryOutboxStore());
    const api = fakeApi({ postError: new TypeError("Network request failed") });
    const repo = makeRepo(cache, outbox);
    await repo.cacheOnly("habits", "12", { id: "12" });

    await writeTask({ api, repo }, { ...write, path: "/api/habits/12/delete", body: {}, nextPayload: null });

    expect(await cache.get(UID, "habits", "12")).toBeNull();
    const rows = await outbox.drain(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.operation).toBe("delete");
  });

  it("hapus yang ditolak server memunculkan barisnya lagi", async () => {
    const cache = new MemoryCache();
    const outbox = new Outbox(new MemoryOutboxStore());
    const api = fakeApi({ postError: new Error("not_found") });
    const repo = makeRepo(cache, outbox);

    await writeTask({ api, repo }, { ...write, path: "/api/habits/12/delete", body: {}, nextPayload: null });

    expect(await cache.get(UID, "habits", "12")).not.toBeNull();
  });
});

// ── Baca layar ──────────────────────────────────────────────────────────────

describe("loadEntity", () => {
  it("kegagalan refresh tidak menghapus data cache", async () => {
    const cache = new MemoryCache();
    const outbox = new Outbox(new MemoryOutboxStore());
    const repo = new Repository({
      cache,
      watermarks: new MemoryWatermarks(),
      outbox,
      remote: {
        async list() {
          throw new TypeError("Network request failed");
        },
      },
      localUserId: UID,
    });
    await repo.cacheOnly("habits", "1", { id: "1", title: "tersimpan" });

    const result = await loadEntity<{ id: string }>(repo, "habits");

    expect(result.online).toBe(false);
    expect(result.rows.map((r) => r.id)).toEqual(["1"]);
    expect(result.isEmpty).toBe(false);
  });

  it("refresh sukses menampilkan data server", async () => {
    const cache = new MemoryCache();
    const outbox = new Outbox(new MemoryOutboxStore());
    const repo = new Repository({
      cache,
      watermarks: new MemoryWatermarks(),
      outbox,
      remote: {
        async list() {
          return {
            rows: [{ entityLocalId: "5", payload: { id: "5", title: "dari server" }, serverUpdatedAt: null }],
            watermark: null,
          };
        },
      },
      localUserId: UID,
    });

    const result = await loadEntity<{ id: string; title: string }>(repo, "habits");

    expect(result.online).toBe(true);
    expect(result.rows[0]!.title).toBe("dari server");
  });
});

describe("loadRemote", () => {
  it("menandai offline hanya untuk kegagalan jaringan", async () => {
    const offline = await loadRemote(fakeApi({ getError: new TypeError("Network request failed") }), "/api/me");
    expect(offline.online).toBe(false);
    expect(offline.data).toBeNull();

    const rejected = await loadRemote(fakeApi({ getError: new Error("unauthorized") }), "/api/me");
    expect(rejected.online).toBe(true);
    expect(rejected.error).toBe("unauthorized");
  });
});

// ── RemoteSource HTTP ───────────────────────────────────────────────────────

describe("httpRemoteSource", () => {
  it("todos dibaca dari field `quests`, bukan `todos`", async () => {
    // `_api_daily_reset` mengemas tabel todos ke dalam key "quests".
    const api = fakeApi({ list: { todos: [{ id: 1, title: "q" }] } });
    const result = await httpRemoteSource(api).list(UID, "todos", null);
    expect(api.gets).toEqual(["/api/todos"]);
    expect(result.rows).toEqual([{ entityLocalId: "1", payload: { id: 1, title: "q" }, serverUpdatedAt: null }]);
  });

  it("baris tanpa id dilewati", async () => {
    const api = fakeApi({ list: { habits: [{ title: "tanpa id" }, { id: 3 }] } });
    const result = await httpRemoteSource(api).list(UID, "habits", null);
    expect(result.rows.map((r) => r.entityLocalId)).toEqual(["3"]);
  });

  it("tipe entitas tanpa rute melempar, bukan mengembalikan kosong", async () => {
    expect(isListableEntity("habits")).toBe(true);
    expect(isListableEntity("musik")).toBe(false);
    await expect(httpRemoteSource(fakeApi({})).list(UID, "musik", null)).rejects.toThrow();
  });

  it("watermark null: refresh ini bukan incremental, dan itu dinyatakan", async () => {
    const result = await httpRemoteSource(fakeApi({})).list(UID, "habits", "2020-01-01");
    expect(result.watermark).toBeNull();
  });

  it("delapan rute upsert/delete terdaftar", () => {
    // Nama base HARUS sama dengan rute POST di backend. Untuk sport dan
    // economy, `/api/<entity>/<id>/update|delete` memang ada
    // (`life_api.py:1098,1420`), jadi pemetaan upsert/delete tetap sah.
    expect(TRANSPORT_ENTITY_BASE).toEqual({
      habits: "/api/habits",
      dailies: "/api/dailies",
      todos: "/api/todos",
      sport: "/api/sport",
      economy: "/api/economy",
      // Wave 3. `pomodoro` dan `calendar` SENGAJA tidak ada: pomodoro hanya
      // punya `/complete`, dan catatan kalender tidak punya id. Kalau
      // dimasukkan, outbox akan membangun rute yang tidak ada.
      supplies: "/api/supplies",
      notes: "/api/notes",
      reminders: "/api/reminders",
    });
  });

  it("rute daftar wave 3 memakai nama field backend yang benar", () => {
    // `supplies` dikemas sebagai `items` dan `pomodoro` sebagai
    // `pomodoroSessions`. Salah nama field = daftar kosong tanpa error.
    expect(ENTITY_LIST_ROUTES.supplies).toEqual({ path: "/api/supplies", field: "items" });
    expect(ENTITY_LIST_ROUTES.notes).toEqual({ path: "/api/notes", field: "notes" });
    expect(ENTITY_LIST_ROUTES.reminders).toEqual({ path: "/api/reminders", field: "reminders" });
    expect(ENTITY_LIST_ROUTES.pomodoro).toEqual({ path: "/api/pomodoro", field: "pomodoroSessions" });
    // Pomodoro boleh dibaca dari cache, tapi tidak punya jalur tulis balik.
    expect("pomodoro" in TRANSPORT_ENTITY_BASE).toBe(false);
    expect("calendar" in TRANSPORT_ENTITY_BASE).toBe(false);
  });

  it("rute daftar sport/economy memakai nama field backend yang benar", async () => {
    // Backend membungkus sport sebagai `sportLogs` dan economy sebagai
    // `transactions`, bukan `sport`/`economy`. Salah nama field di sini
    // menghasilkan daftar kosong TANPA error — bug yang tidak terlihat.
    expect(ENTITY_LIST_ROUTES.sport).toEqual({ path: "/api/sport", field: "sportLogs" });
    expect(ENTITY_LIST_ROUTES.economy).toEqual({ path: "/api/economy", field: "transactions" });

    // Respons ditulis dengan kunci literal, BUKAN lewat `fakeApi` yang
    // menurunkan nama field dari ENTITY_LIST_ROUTES itu sendiri. Kalau tidak
    // begitu, tesnya melingkar: salah nama field di dua tempat tetap hijau.
    const gets: string[] = [];
    const api: ApiCalls = {
      async get<T = unknown>(path: string): Promise<T> {
        gets.push(path);
        return { sportLogs: [{ id: "7", name: "Lari" }] } as T;
      },
      async post<T = unknown>(): Promise<T> {
        return { ok: true } as T;
      },
    };
    const result = await httpRemoteSource(api).list(UID, "sport", null);
    expect(gets).toEqual(["/api/sport"]);
    expect(result.rows).toEqual([
      { entityLocalId: "7", payload: { id: "7", name: "Lari" }, serverUpdatedAt: null },
    ]);
  });
});

// ── Transport sync ──────────────────────────────────────────────────────────

function outboxRow(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: 1,
    local_user_id: UID,
    entity_type: "habits",
    entity_local_id: "12",
    operation: "upsert",
    payload: JSON.stringify({ title: "x" }),
    status: "pending",
    retry_count: 0,
    next_retry_at: null,
    last_error: null,
    created_at: "2026-10-13 00:00:00",
    updated_at: "2026-10-13 00:00:00",
    ...overrides,
  };
}

describe("apiTransport", () => {
  it("upsert dipetakan ke /update dengan payload", async () => {
    const api = fakeApi({});
    await pushRow(api, outboxRow());
    expect(api.posts).toEqual([{ path: "/api/habits/12/update", body: { title: "x" } }]);
  });

  it("delete dipetakan ke /delete", async () => {
    const api = fakeApi({});
    await pushRow(api, outboxRow({ operation: "delete", payload: "{}" }));
    expect(api.posts).toEqual([{ path: "/api/habits/12/delete", body: {} }]);
  });

  it("payload rusak TIDAK dikirim sebagai {} yang akan menghapus field", async () => {
    const api = fakeApi({});
    await expect(pushRow(api, outboxRow({ payload: "{bukan json" }))).rejects.toThrow();
    expect(api.posts).toEqual([]);
  });

  it("entity type tanpa rute menolak", async () => {
    await expect(pushRow(fakeApi({}), outboxRow({ entity_type: "musik" }))).rejects.toThrow();
  });

  it("satu baris gagal tidak menghentikan baris lain", async () => {
    let call = 0;
    const api: ApiCalls = {
      async post<T = unknown>(): Promise<T> {
        call += 1;
        if (call === 1) throw new Error("empty");
        return { ok: true } as T;
      },
      async get<T = unknown>(): Promise<T> {
        return {} as T;
      },
    };
    const results = await apiTransport(api).push([outboxRow(), outboxRow({ id: 2 })]);
    expect(results).toEqual([
      { id: 1, ok: false, error: "empty" },
      { id: 2, ok: true },
    ]);
  });

  it("pull mendelegasikan ke rute daftar", async () => {
    const api = fakeApi({ list: { dailies: [{ id: 2 }] } });
    const result = await apiTransport(api).pull(UID, "dailies", null);
    expect(result.rows.map((r) => r.entityLocalId)).toEqual(["2"]);
  });
});
