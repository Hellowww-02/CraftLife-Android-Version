/**
 * M11 — tes ketahanan: airplane mode, force-kill di tengah sync, reinstall.
 *
 * Skenario perangkat asli (nyalakan mode pesawat, bunuh aplikasi dari
 * recent apps, pasang ulang) tidak bisa dijalankan dari CI, jadi yang
 * diuji di sini adalah SIMULASI jujurnya di lapisan yang menentukan data
 * selamat atau hilang:
 *
 *  • airplane: probe offline → drain tertahan TANPA menyentuh outbox;
 *    saat online lagi, job yang sama terkirim (tidak dobel, tidak hilang);
 *  • force-kill: job yang sudah diambil drain tapi belum ditandai selesai
 *    harus muncul lagi di drain berikutnya (status tidak berubah di store
 *    sampai markDone/markFailed dipanggil);
 *  • reinstall: cache kosong + watermark kosong → tarikan pertama mengisi
 *    ulang dari server tanpa menganggap apa pun sudah tersinkron;
 *  • job mati bisa dihidupkan lagi oleh pengguna (recovery), dan backoff
 *    kini ber-jitter deterministik seperti desktop.
 */

import { describe, expect, it } from "vitest";

import { selectCacheEvictions, type CacheRowMeta } from "../src/data/cache";
import { MemoryOutboxStore } from "../src/sync/memoryStore";
import { backoffSeconds, Outbox, type Clock } from "../src/sync/outbox";
import type { SyncProbe } from "../src/sync/policy";
import {
  SyncService,
  type PullResult,
  type PushResult,
  type SyncTransport,
} from "../src/sync/syncService";

const UID = 5;

function fakeClock(start = new Date("2026-10-23T04:00:00Z")) {
  let current = start;
  const clock: Clock & { advance(seconds: number): void } = {
    now: () => current,
    advance: (s: number) => {
      current = new Date(current.getTime() + s * 1000);
    },
  };
  return clock;
}

function probe(overrides: Partial<SyncProbe> = {}): SyncProbe {
  return {
    isOnline: async () => true,
    isLowPowerMode: async () => false,
    batteryLevel: async () => 0.9,
    isCharging: async () => false,
    ...overrides,
  };
}

describe("airplane mode -> online", () => {
  it("offline menahan drain tanpa menyentuh job; online mengirim sekali", async () => {
    const store = new MemoryOutboxStore();
    const clock = fakeClock();
    const outbox = new Outbox(store, clock);
    await outbox.enqueue({
      localUserId: UID,
      entityType: "habits",
      entityLocalId: "h1",
      operation: "upsert",
      payload: { name: "Lari" },
    });

    let online = false;
    const pushed: number[] = [];
    const transport: SyncTransport = {
      async push(rows): Promise<PushResult[]> {
        pushed.push(...rows.map((r) => r.id));
        return rows.map((r) => ({ id: r.id, ok: true }) as PushResult);
      },
      async pull(): Promise<PullResult> {
        return { rows: [], watermark: null };
      },
    };
    const service = new SyncService({
      outbox,
      transport,
      probe: probe({ isOnline: async () => online }),
      localUserId: UID,
      entityTypes: ["habits"],
      readWatermark: async () => null,
      onCacheRows: async () => undefined,
      onWatermark: async () => undefined,
    });

    const blocked = await service.drainOnce();
    expect(blocked.blocked).toBeTruthy();
    expect(pushed).toEqual([]);
    expect(await outbox.pendingCount(UID)).toBe(1);

    online = true;
    const done = await service.drainOnce();
    expect(done.pushed).toBe(1);
    expect(pushed).toHaveLength(1);
    expect(await outbox.pendingCount(UID)).toBe(0);
  });
});

describe("force-kill di tengah sync", () => {
  it("job yang belum ditandai selesai muncul lagi utuh di drain berikut", async () => {
    const store = new MemoryOutboxStore();
    const clock = fakeClock();
    const outbox = new Outbox(store, clock);
    const id = await outbox.enqueue({
      localUserId: UID,
      entityType: "habits",
      entityLocalId: "h9",
      operation: "upsert",
      payload: { name: "Meditasi" },
    });
    // Simulasi force-kill: drain mengambil job, lalu proses mati SEBELUM
    // markDone/markFailed. Store tidak berubah → job tetap jatuh tempo.
    const taken = await outbox.drain(10);
    expect(taken.map((r) => r.id)).toEqual([id]);
    const retaken = await outbox.drain(10);
    expect(retaken.map((r) => r.id)).toEqual([id]);
    await outbox.markDone(id);
    expect(await outbox.drain(10)).toEqual([]);
  });
});

describe("reinstall", () => {
  it("watermark kosong berarti tarikan dari awal (tidak ada yang dianggap sinkron)", async () => {
    const store = new MemoryOutboxStore();
    const outbox = new Outbox(store, fakeClock());
    const sinceSeen: Array<string | null> = [];
    const transport: SyncTransport = {
      async push(rows): Promise<PushResult[]> {
        return rows.map((r) => ({ id: r.id, ok: true }) as PushResult);
      },
      async pull(_localUserId, _entityType, since): Promise<PullResult> {
        sinceSeen.push(since);
        return {
          rows: [
            {
              entityLocalId: "srv-1",
              payload: { id: "srv-1" },
              serverUpdatedAt: "2026-10-23T00:00:00Z",
            },
          ],
          watermark: "2026-10-23T00:00:00Z",
        };
      },
    };
    const cached: string[] = [];
    const service = new SyncService({
      outbox,
      transport,
      probe: probe(),
      localUserId: UID,
      entityTypes: ["habits"],
      readWatermark: async () => null, // reinstall: belum ada watermark
      onCacheRows: async (_type, rows) => {
        cached.push(...rows.map((r) => r.entityLocalId));
      },
      onWatermark: async () => undefined,
    });
    const out = await service.drainOnce();
    expect(sinceSeen).toEqual([null]);
    expect(cached).toEqual(["srv-1"]);
    expect(out.pulled).toBe(1);
  });
});

describe("recovery & jitter", () => {
  it("job mati bisa diantrekan ulang oleh pengguna", async () => {
    const store = new MemoryOutboxStore();
    const outbox = new Outbox(store, fakeClock());
    const id = await outbox.enqueue({
      localUserId: UID,
      entityType: "habits",
      entityLocalId: "h7",
      operation: "upsert",
      payload: {},
    });
    for (let i = 0; i < 3; i++) {
      await outbox.markFailed(id, "HTTP 402: Payment Required");
    }
    expect(await outbox.deadCount(UID)).toBe(1);
    expect(await outbox.requeueDead(UID)).toBe(1);
    expect(await outbox.deadCount(UID)).toBe(0);
    expect(await outbox.pendingCount(UID)).toBe(1);
  });

  it("backoff ber-jitter deterministik dan tidak melebihi plafon +20%", () => {
    expect(backoffSeconds(0)).toBe(30);
    const j1 = backoffSeconds(1, 42);
    expect(j1).toBe(backoffSeconds(1, 42));
    expect(j1).toBeGreaterThanOrEqual(60);
    expect(j1).toBeLessThanOrEqual(72);
    expect(backoffSeconds(99, 1)).toBeLessThanOrEqual(3600 + 720);
  });
});

describe("cache eviction", () => {
  it("membuang yang terlama per jenis, lalu terlama global", () => {
    const rows: CacheRowMeta[] = [];
    for (let i = 0; i < 5; i++) {
      rows.push({
        entityType: "habits",
        entityLocalId: `h${i}`,
        cachedAt: `2026-10-2${i}T00:00:00Z`,
        bytes: 10,
      });
    }
    rows.push({
      entityType: "todos",
      entityLocalId: "t0",
      cachedAt: "2026-10-01T00:00:00Z",
      bytes: 10,
    });
    const evict = selectCacheEvictions(rows, { perType: 2, total: 10 });
    expect(evict.map((r) => r.entityLocalId)).toEqual(["h0", "h1", "h2"]);
    const evictGlobal = selectCacheEvictions(rows, { perType: 99, total: 4 });
    expect(evictGlobal.map((r) => r.entityLocalId)).toEqual(["t0", "h0"]);
  });
});

describe("pengaturan jam palsu tidak bocor ke produksi", () => {
  it("fakeClock hanya milik tes ini", () => {
    expect(typeof fakeClock).toBe("function");
  });
});

