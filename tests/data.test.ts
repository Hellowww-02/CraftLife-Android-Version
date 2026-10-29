/**
 * M08 — jam server dan repository.
 *
 * Dua hal diuji di sini, dan keduanya adalah tempat aplikasi offline-first
 * paling sering bohong:
 *
 *  1. Tanggal harus datang dari jam SERVER. Kalau Android diam-diam fallback ke
 *     jam perangkat, streak akan berbeda dari desktop dan dua klien saling
 *     menimpa.
 *  2. Tulis harus mendarat di cache DAN outbox. Kalau hanya salah satu,
 *     pengguna melihat perubahan yang tidak akan pernah tersinkron — atau
 *     perubahan yang tersinkron tapi tidak terlihat.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { ServerClock, type ClockSource, type ServerClockBase } from "../src/data/serverClock";
import { Repository, type CachePort, type CachedRow, type RemoteSource, type WatermarkPort } from "../src/data/repository";
import { MemoryOutboxStore } from "../src/sync/memoryStore";
import { Outbox } from "../src/sync/outbox";

const UID = 5;

// ---------------------------------------------------------------------------
// Jam
// ---------------------------------------------------------------------------
function clockSource(base: ServerClockBase | null, startMs: number): ClockSource & { advance(ms: number): void } {
  let now = startMs;
  return {
    async fetchBase() {
      if (!base) return null;
      // receivedAt mengikuti jam yang dikendalikan, bukan Date.now() nyata
      return { ...base, receivedAt: now };
    },
    nowMs: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

const RECEIVED_AT = Date.UTC(2026, 9, 13, 0, 0, 0);

describe("ServerClock", () => {
  it("menghasilkan tanggal dari jam server, bukan jam perangkat", async () => {
    // Server di Asia/Jakarta (UTC+7). Epoch ini = 2026-10-12 17:30 UTC
    // = 2026-10-13 00:30 WIB. Jam perangkat disetel ke UTC, jadi kalau kode
    // memakai jam perangkat hasilnya 2026-10-12 — salah satu hari.
    const epoch = Math.floor(Date.UTC(2026, 9, 12, 17, 30, 0) / 1000);
    const src = clockSource({ epoch, receivedAt: RECEIVED_AT, tzOffsetMin: 420 }, RECEIVED_AT);
    const clock = new ServerClock(src);

    expect(clock.isReady).toBe(false);
    expect(clock.dateKey()).toBeNull();

    await clock.refresh();
    expect(clock.isReady).toBe(true);
    expect(clock.dateKey()).toBe("2026-10-13");
  });

  it("tanggal bergulir saat jam berjalan, tanpa refresh", async () => {
    const epoch = Math.floor(Date.UTC(2026, 9, 12, 16, 59, 0) / 1000); // 23:59 WIB
    const src = clockSource({ epoch, receivedAt: RECEIVED_AT, tzOffsetMin: 420 }, RECEIVED_AT);
    const clock = new ServerClock(src);
    await clock.refresh();

    expect(clock.dateKey()).toBe("2026-10-12");
    src.advance(2 * 60 * 1000); // +2 menit -> 00:01 WIB
    expect(clock.dateKey()).toBe("2026-10-13");
  });

  it("tanpa jam server tidak ada fallback ke jam perangkat", async () => {
    const src = clockSource(null, RECEIVED_AT);
    const clock = new ServerClock(src);

    expect(await clock.refresh()).toBe(false);
    expect(clock.dateKey()).toBeNull();
    expect(clock.nowDate()).toBeNull();
  });

  it("setBase menerima jam dari respons lain (mis. /api/bootstrap)", () => {
    const clock = new ServerClock(clockSource(null, RECEIVED_AT));
    const epoch = Math.floor(Date.UTC(2026, 9, 12, 17, 30, 0) / 1000);
    clock.setBase({ epoch, receivedAt: RECEIVED_AT, tzOffsetMin: 420 });

    expect(clock.isReady).toBe(true);
    expect(clock.dateKey()).toBe("2026-10-13");
  });
});

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------
class MemoryCache implements CachePort {
  rows = new Map<string, CachedRow>();
  private key(t: string, id: string) {
    return `${t}::${id}`;
  }
  async list(_u: number, entityType: string) {
    return [...this.rows.values()].filter((_r, i) => [...this.rows.keys()][i]!.startsWith(`${entityType}::`));
  }
  async get(_u: number, t: string, id: string) {
    return this.rows.get(this.key(t, id)) ?? null;
  }
  async put(_u: number, t: string, id: string, payload: unknown, serverUpdatedAt: string | null = null) {
    this.rows.set(this.key(t, id), {
      entity_local_id: id,
      payload: JSON.stringify(payload ?? {}),
      server_updated_at: serverUpdatedAt,
    });
  }
  async remove(_u: number, t: string, id: string) {
    this.rows.delete(this.key(t, id));
  }
}

class MemoryWatermarks implements WatermarkPort {
  map = new Map<string, string>();
  async get(_u: number, t: string) {
    return this.map.get(t) ?? null;
  }
  async advance(_u: number, t: string, v: string) {
    const cur = this.map.get(t);
    if (!cur || v > cur) this.map.set(t, v);
  }
}

function remote(rows: Array<{ entityLocalId: string; payload: unknown; serverUpdatedAt: string | null }>, watermark: string | null): RemoteSource {
  return {
    async list() {
      return { rows, watermark };
    },
  };
}

let cache: MemoryCache;
let watermarks: MemoryWatermarks;
let store: MemoryOutboxStore;
let outbox: Outbox;

beforeEach(() => {
  cache = new MemoryCache();
  watermarks = new MemoryWatermarks();
  store = new MemoryOutboxStore();
  outbox = new Outbox(store, { now: () => new Date("2026-10-13T00:00:00Z") });
});

describe("Repository — tulis", () => {
  it("upsert mendarat di cache DAN outbox", async () => {
    const repo = new Repository({ cache, watermarks, outbox, remote: remote([], null), localUserId: UID });
    await repo.upsert("habits", "42", { name: "Minum air" });

    expect(await cache.get(UID, "habits", "42")).not.toBeNull();
    const queued = await store.due(new Date("2026-10-13T00:00:00Z"), 10);
    expect(queued).toHaveLength(1);
    expect(queued[0]!.entity_type).toBe("habits");
    expect(queued[0]!.operation).toBe("upsert");
  });

  it("delete menghapus dari cache dan mengantre operasi delete", async () => {
    const repo = new Repository({ cache, watermarks, outbox, remote: remote([], null), localUserId: UID });
    await repo.upsert("habits", "42", { name: "Minum air" });
    await repo.remove("habits", "42");

    expect(await cache.get(UID, "habits", "42")).toBeNull();
    const queued = await store.due(new Date("2026-10-13T00:00:00Z"), 10);
    const last = queued[queued.length - 1]!;
    expect(last.operation).toBe("delete");
  });

  it("perubahan offline tetap terbaca setelahnya", async () => {
    const repo = new Repository({ cache, watermarks, outbox, remote: remote([], null), localUserId: UID });
    await repo.upsert("habits", "1", { name: "A" });
    await repo.upsert("habits", "2", { name: "B" });

    const result = await repo.read<{ name: string }>("habits");
    expect(result.rows.map((r) => r.name).sort()).toEqual(["A", "B"]);
    expect(result.isEmpty).toBe(false);
    expect(await outbox.pendingCount(UID)).toBe(2);
  });
});

describe("Repository — baca", () => {
  it("cache kosong menandai isEmpty, bukan melempar", async () => {
    const repo = new Repository({ cache, watermarks, outbox, remote: remote([], null), localUserId: UID });
    const result = await repo.read("habits");
    expect(result.rows).toEqual([]);
    expect(result.isEmpty).toBe(true);
  });

  it("payload rusak dilewati, tidak menggagalkan seluruh layar", async () => {
    cache.rows.set("habits::1", { entity_local_id: "1", payload: "{bukan json", server_updated_at: null });
    cache.rows.set("habits::2", { entity_local_id: "2", payload: '{"name":"B"}', server_updated_at: null });

    const repo = new Repository({ cache, watermarks, outbox, remote: remote([], null), localUserId: UID });
    const result = await repo.read<{ name: string }>("habits");

    expect(result.rows).toEqual([{ name: "B" }]);
    expect(result.isEmpty).toBe(false);
  });
});

describe("Repository — refresh", () => {
  it("menyimpan baris server ke cache dan memajukan watermark", async () => {
    const repo = new Repository({
      cache,
      watermarks,
      outbox,
      remote: remote(
        [
          { entityLocalId: "1", payload: { name: "A" }, serverUpdatedAt: "2026-10-13 01:00:00" },
          { entityLocalId: "2", payload: { name: "B" }, serverUpdatedAt: "2026-10-13 01:00:00" },
        ],
        "2026-10-13 01:00:00",
      ),
      localUserId: UID,
    });

    expect(await repo.refresh("habits")).toBe(2);
    expect((await repo.read("habits")).rows).toHaveLength(2);
    expect(await watermarks.get(UID, "habits")).toBe("2026-10-13 01:00:00");
  });

  it("refresh berikutnya memakai watermark, bukan mengunduh ulang", async () => {
    let capturedSince: Array<string | null> = [];
    const src: RemoteSource = {
      async list(_u, _t, since) {
        capturedSince.push(since);
        return { rows: [], watermark: "2026-10-13 01:00:00" };
      },
    };
    const repo = new Repository({ cache, watermarks, outbox, remote: src, localUserId: UID });

    await repo.refresh("habits");
    await repo.refresh("habits");

    expect(capturedSince).toEqual([null, "2026-10-13 01:00:00"]);
  });

  it("baris yang dihapus di server ikut hilang dari cache", async () => {
    await cache.put(UID, "habits", "1", { name: "A" });
    const repo = new Repository({
      cache,
      watermarks,
      outbox,
      remote: remote([{ entityLocalId: "1", payload: { deleted: true }, serverUpdatedAt: "2026-10-13 02:00:00" }], "2026-10-13 02:00:00"),
      localUserId: UID,
    });

    await repo.refresh("habits");
    expect(await cache.get(UID, "habits", "1")).toBeNull();
  });

  it("watermark tidak pernah mundur", async () => {
    const repo = new Repository({
      cache,
      watermarks,
      outbox,
      remote: remote([], "2026-10-13 05:00:00"),
      localUserId: UID,
    });
    await repo.refresh("habits");

    const backwards = new Repository({
      cache,
      watermarks,
      outbox,
      remote: remote([], "2026-10-13 01:00:00"),
      localUserId: UID,
    });
    await backwards.refresh("habits");

    expect(await watermarks.get(UID, "habits")).toBe("2026-10-13 05:00:00");
  });
});
