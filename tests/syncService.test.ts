/**
 * M07 — drain yang sadar baterai dan jaringan.
 *
 * Bagian yang paling mudah salah di sini bukan push/pull-nya, tapi KAPAN drain
 * boleh jalan. Kalau gerbangnya salah, aplikasi akan mengirim data saat baterai
 * 5% atau saat mode pesawat — dan di Android sistem akan membatasi aplikasi
 * yang boros, jadi malah makin tidak sinkron.
 *
 * Probe disuntikkan, jadi setiap kombinasi bisa diuji tanpa perangkat.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryOutboxStore } from "../src/sync/memoryStore";
import { Outbox, type Clock, type OutboxRow } from "../src/sync/outbox";
import { LOW_BATTERY_THRESHOLD, type SyncProbe } from "../src/sync/policy";
import {
  SyncService,
  type PullResult,
  type PushResult,
  type SyncTransport,
} from "../src/sync/syncService";

const UID = 3;

function probe(overrides: Partial<SyncProbe> = {}): SyncProbe {
  return {
    isOnline: async () => true,
    isLowPowerMode: async () => false,
    batteryLevel: async () => 0.9,
    isCharging: async () => false,
    ...overrides,
  };
}

function transport(overrides: Partial<SyncTransport> = {}): SyncTransport & {
  pushCalls: OutboxRow[][];
  pullCalls: Array<{ entityType: string; since: string | null }>;
} {
  const pushCalls: OutboxRow[][] = [];
  const pullCalls: Array<{ entityType: string; since: string | null }> = [];
  // Rekaman dibungkus, bukan ditimpa. Kalau override menggantikan fungsinya
  // langsung, pushCalls/pullCalls tetap kosong dan tes lulus tanpa membuktikan
  // apa pun - itu persis jebakan yang bikin dua tes di berkas ini sempat salah.
  const inner: SyncTransport = {
    async push(rows) {
      return rows.map((r) => ({ id: r.id, ok: true }) as PushResult);
    },
    async pull(): Promise<PullResult> {
      return { rows: [], watermark: null };
    },
    ...overrides,
  };
  return {
    pushCalls,
    pullCalls,
    async push(rows) {
      pushCalls.push(rows);
      return inner.push(rows);
    },
    async pull(uid, entityType, since) {
      pullCalls.push({ entityType, since });
      return inner.pull(uid, entityType, since);
    },
  };
}

let current = new Date("2026-10-13T05:00:00Z");
const clock: Clock = { now: () => current };
function advance(seconds: number) {
  current = new Date(current.getTime() + seconds * 1000);
}

let store: MemoryOutboxStore;
let outbox: Outbox;

beforeEach(() => {
  current = new Date("2026-10-13T05:00:00Z");
  store = new MemoryOutboxStore();
  outbox = new Outbox(store, clock);
});

describe("gerbang sebelum drain", () => {
  it("offline memblokir drain", async () => {
    const svc = new SyncService({
      outbox,
      transport: transport(),
      probe: probe({ isOnline: async () => false }),
      localUserId: UID,
      entityTypes: [],
    });
    const result = await svc.drainOnce();
    expect(result.blocked).toBe("offline");
    expect(result.pushed).toBe(0);
  });

  it("mode hemat daya memblokir drain", async () => {
    const svc = new SyncService({
      outbox,
      transport: transport(),
      probe: probe({ isLowPowerMode: async () => true }),
      localUserId: UID,
      entityTypes: [],
    });
    expect((await svc.drainOnce()).blocked).toBe("low_power");
  });

  it("baterai lemah memblokir drain", async () => {
    const svc = new SyncService({
      outbox,
      transport: transport(),
      probe: probe({ batteryLevel: async () => LOW_BATTERY_THRESHOLD - 0.01 }),
      localUserId: UID,
      entityTypes: [],
    });
    expect((await svc.drainOnce()).blocked).toBe("low_battery");
  });

  it("baterai lemah TIDAK memblokir saat sedang mengisi daya", async () => {
    const svc = new SyncService({
      outbox,
      transport: transport(),
      probe: probe({ batteryLevel: async () => 0.05, isCharging: async () => true }),
      localUserId: UID,
      entityTypes: [],
    });
    expect((await svc.drainOnce()).blocked).toBeNull();
  });

  it("tingkat baterai tidak diketahui tidak memblokir", async () => {
    // getBatteryLevelAsync mengembalikan -1 saat tidak tersedia. Kalau itu
    // dibaca sebagai 0%, sinkronisasi tidak akan pernah jalan di perangkat
    // yang tidak melaporkan baterai.
    const svc = new SyncService({
      outbox,
      transport: transport(),
      probe: probe({ batteryLevel: async () => null }),
      localUserId: UID,
      entityTypes: [],
    });
    expect((await svc.drainOnce()).blocked).toBeNull();
  });

  it("tidak ada permintaan jaringan sama sekali saat terblokir", async () => {
    const t = transport();
    const svc = new SyncService({
      outbox,
      transport: t,
      probe: probe({ isOnline: async () => false }),
      localUserId: UID,
      entityTypes: ["habits"],
    });
    await svc.drainOnce();
    expect(t.pushCalls).toHaveLength(0);
    expect(t.pullCalls).toHaveLength(0);
  });
});

describe("drain", () => {
  it("mengirim yang tertunda dan menandainya selesai", async () => {
    await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "1", operation: "upsert" });
    await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "2", operation: "upsert" });

    const svc = new SyncService({
      outbox,
      transport: transport(),
      probe: probe(),
      localUserId: UID,
      entityTypes: [],
    });
    const result = await svc.drainOnce();

    expect(result.pushed).toBe(2);
    expect(result.failed).toBe(0);
    expect(await outbox.pendingCount(UID)).toBe(0);
  });

  it("push yang gagal per-baris memakai aturan retry outbox", async () => {
    await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "1", operation: "upsert" });
    const svc = new SyncService({
      outbox,
      transport: transport({
        async push(rows) {
          return rows.map((r) => ({ id: r.id, ok: false, error: "Network request failed" }));
        },
      }),
      probe: probe(),
      localUserId: UID,
      entityTypes: [],
    });
    const result = await svc.drainOnce();

    expect(result.failed).toBe(1);
    // error jaringan -> retry, bukan mati
    const row = await store.findById(1);
    expect(row!.status).toBe("retry");
  });

  it("error permanen dari server mematikan pekerjaan setelah 3 kali", async () => {
    await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "1", operation: "upsert" });
    const svc = new SyncService({
      outbox,
      transport: transport({
        async push(rows) {
          return rows.map((r) => ({ id: r.id, ok: false, error: "HTTP 402 quota" }));
        },
      }),
      probe: probe(),
      localUserId: UID,
      entityTypes: [],
    });

    // Tanpa memajukan jam, pekerjaan belum jatuh tempo dan drain kedua tidak
    // mengirim apa pun - jadi retry_count tidak akan pernah naik.
    await svc.drainOnce();
    advance(31);
    await svc.drainOnce();
    advance(31);
    await svc.drainOnce();

    const row = await store.findById(1);
    expect(row!.status).toBe("dead");
    expect(row!.retry_count).toBe(3);
  });

  it("exception saat push menandai seluruh batch, bukan membuatnya hilang", async () => {
    await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "1", operation: "upsert" });
    await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "2", operation: "upsert" });
    const svc = new SyncService({
      outbox,
      transport: transport({
        async push() {
          throw new Error("Network request failed");
        },
      }),
      probe: probe(),
      localUserId: UID,
      entityTypes: [],
    });
    const result = await svc.drainOnce();

    expect(result.failed).toBe(2);
    const row = await store.findById(1);
    expect(row!.status).toBe("retry");
    expect(row!.last_error).toBe("Network request failed");
  });

  it("pull memakai watermark, bukan mengunduh seluruh riwayat tiap putaran", async () => {
    const t = transport({
      async pull(_uid, entityType, since) {
        return { rows: [], watermark: since ? "2026-10-13 06:00:00" : "2026-10-13 05:30:00" };
      },
    });
    const watermarks = new Map<string, string>();
    const svc = new SyncService({
      outbox,
      transport: t,
      probe: probe(),
      localUserId: UID,
      entityTypes: ["habits"],
      readWatermark: async (t2) => watermarks.get(t2) ?? null,
      onWatermark: async (t2, w) => {
        watermarks.set(t2, w);
      },
    });

    await svc.drainOnce();
    await svc.drainOnce();

    expect(t.pullCalls.map((c) => c.since)).toEqual([null, "2026-10-13 05:30:00"]);
  });

  it("baris hasil pull diteruskan ke cache", async () => {
    const onCacheRows = vi.fn(async () => {});
    const svc = new SyncService({
      outbox,
      transport: transport({
        async pull() {
          return {
            rows: [{ entityLocalId: "7", payload: { n: 1 }, serverUpdatedAt: "2026-10-13 05:30:00" }],
            watermark: "2026-10-13 05:30:00",
          };
        },
      }),
      probe: probe(),
      localUserId: UID,
      entityTypes: ["habits"],
      onCacheRows,
    });
    const result = await svc.drainOnce();

    expect(result.pulled).toBe(1);
    expect(onCacheRows).toHaveBeenCalledWith("habits", [
      { entityLocalId: "7", payload: { n: 1 }, serverUpdatedAt: "2026-10-13 05:30:00" },
    ]);
  });

  it("batchSize membatasi jumlah yang dikirim satu putaran", async () => {
    for (let i = 0; i < 10; i++) {
      await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: String(i), operation: "upsert" });
    }
    const t = transport();
    const svc = new SyncService({
      outbox,
      transport: t,
      probe: probe(),
      localUserId: UID,
      entityTypes: [],
    });
    const result = await svc.drainOnce(4);

    expect(result.pushed).toBe(4);
    expect(t.pushCalls[0]).toHaveLength(4);
    expect(await outbox.pendingCount(UID)).toBe(6);
  });
});
