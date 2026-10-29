/**
 * M07 — aturan outbox harus sama dengan desktop.
 *
 * Ini tes yang paling penting di M07. Kalau Android dan desktop mengambil
 * keputusan berbeda tentang pekerjaan sync yang sama, data pengguna bisa hilang
 * di satu sisi dan tidak di sisi lain (P6). Jadi aturan retry diuji terhadap
 * angka yang sama persis dengan `database.py`.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { MemoryOutboxStore } from "../src/sync/memoryStore";
import {
  BACKOFF_BASE_SECONDS,
  BACKOFF_MAX_SECONDS,
  backoffSeconds,
  fromSqliteUtc,
  isPermanentSyncError,
  MAX_PERMANENT_RETRIES,
  Outbox,
  PERMANENT_SYNC_ERRORS,
  toSqliteUtc,
  type Clock,
} from "../src/sync/outbox";

const UID = 7;

/** Jam yang bisa diputar maju, supaya backoff tidak diuji dengan sleep. */
function fakeClock(start = new Date("2026-10-13T04:00:00Z")) {
  let current = start;
  const clock: Clock & { advance(seconds: number): void; at(): Date } = {
    now: () => current,
    advance: (s: number) => {
      current = new Date(current.getTime() + s * 1000);
    },
    at: () => current,
  };
  return clock;
}

let store: MemoryOutboxStore;
let clock: ReturnType<typeof fakeClock>;
let outbox: Outbox;

beforeEach(() => {
  store = new MemoryOutboxStore();
  clock = fakeClock();
  outbox = new Outbox(store, clock);
});

describe("daftar error permanen identik dengan Python", () => {
  it("11 pola yang sama seperti database.PERMANENT_SYNC_ERRORS", () => {
    expect(PERMANENT_SYNC_ERRORS).toHaveLength(11);
    expect([...PERMANENT_SYNC_ERRORS].sort()).toEqual(
      [
        "402", "401", "403", "payment required", "quota", "unauthorized",
        "forbidden", "account_unavailable", "unsupported_table",
        "invalid_jwt", "jwt_expired",
      ].sort(),
    );
  });

  it("batas percobaan 3, sama seperti MAX_PERMANENT_RETRIES", () => {
    expect(MAX_PERMANENT_RETRIES).toBe(3);
  });

  it("mengenali error permanen tanpa peduli huruf besar", () => {
    expect(isPermanentSyncError("Payment Required")).toBe(true);
    expect(isPermanentSyncError("quota exceeded")).toBe(true);
    expect(isPermanentSyncError("HTTP 402")).toBe(true);
  });

  it("error jaringan BUKAN permanen — ini yang mencegah kehilangan data", () => {
    expect(isPermanentSyncError("connection refused")).toBe(false);
    expect(isPermanentSyncError("Network request failed")).toBe(false);
    expect(isPermanentSyncError("Temporary failure in name resolution")).toBe(false);
    expect(isPermanentSyncError("timed out")).toBe(false);
    expect(isPermanentSyncError(null)).toBe(false);
  });
});

describe("enqueue meniru sync_queue", () => {
  it("mengisi semua kolom yang dimiliki sync_queue", async () => {
    const id = await outbox.enqueue({
      localUserId: UID,
      entityType: "habits",
      entityLocalId: "42",
      operation: "upsert",
      payload: { name: "Minum air" },
    });
    const row = await store.findById(id);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("pending");
    expect(row!.retry_count).toBe(0);
    expect(row!.next_retry_at).toBeNull();
    expect(row!.last_error).toBeNull();
    expect(JSON.parse(row!.payload)).toEqual({ name: "Minum air" });
    expect(row!.created_at).toBe(toSqliteUtc(clock.at()));
  });

  it("perubahan kedua pada entitas yang sama menimpa, bukan menduplikasi", async () => {
    await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "42", operation: "upsert", payload: { n: 1 } });
    const id2 = await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "42", operation: "upsert", payload: { n: 2 } });

    const rows = await store.due(clock.at(), 100);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(id2);
    expect(JSON.parse(rows[0]!.payload)).toEqual({ n: 2 });
  });

  it("operasi terakhir menang: upsert lalu delete mengirim delete", async () => {
    // Bug nyata yang ditemukan tes repository: enqueue men-dedup per entitas
    // dan menimpa payload, tapi dulu tidak menimpa operation. Akibatnya baris
    // yang dihapus pengguna saat offline hidup lagi di server begitu jaringan
    // kembali — persis pelanggaran P6.
    const id = await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "42", operation: "upsert", payload: { name: "A" } });
    await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "42", operation: "delete", payload: {} });

    const rows = await store.due(clock.at(), 100);
    // Kalau delete membuat baris baru alih-alih menimpa, panjangnya jadi 2.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(id);
    expect(rows[0]!.operation).toBe("delete");
  });

  it("delete lalu upsert mengirim upsert (baris dibuat ulang)", async () => {
    await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "42", operation: "delete", payload: {} });
    await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "42", operation: "upsert", payload: { name: "A" } });

    const rows = await store.due(clock.at(), 100);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.operation).toBe("upsert");
    expect(JSON.parse(rows[0]!.payload)).toEqual({ name: "A" });
  });

  it("entitas berbeda tetap jadi baris terpisah", async () => {
    await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "42", operation: "upsert" });
    await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "43", operation: "upsert" });
    expect(await store.due(clock.at(), 100)).toHaveLength(2);
  });

  it("pengguna berbeda tidak saling menimpa", async () => {
    await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "42", operation: "upsert" });
    await outbox.enqueue({ localUserId: 99, entityType: "habits", entityLocalId: "42", operation: "upsert" });
    expect(await store.due(clock.at(), 100)).toHaveLength(2);
  });
});

describe("error permanen mati, error jaringan tidak", () => {
  it("error permanen -> dead tepat setelah 3 percobaan", async () => {
    const id = await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "1", operation: "upsert" });

    expect(await outbox.markFailed(id, "HTTP 402 quota")).toBe("retry");
    clock.advance(BACKOFF_BASE_SECONDS + 1);
    expect(await outbox.markFailed(id, "HTTP 402 quota")).toBe("retry");
    clock.advance(BACKOFF_BASE_SECONDS + 1);
    expect(await outbox.markFailed(id, "HTTP 402 quota")).toBe("dead");

    const row = await store.findById(id);
    expect(row!.status).toBe("dead");
    expect(row!.retry_count).toBe(MAX_PERMANENT_RETRIES);
    expect(row!.last_error).toBe("HTTP 402 quota");
    // dead tidak boleh ikut terkirim lagi
    expect(await store.due(clock.at(), 100)).toHaveLength(0);
  });

  it("error jaringan dicoba ulang jauh melampaui 3 kali", async () => {
    const id = await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "1", operation: "upsert" });

    for (let i = 0; i < 12; i++) {
      const verdict = await outbox.markFailed(id, "Network request failed");
      expect(verdict, `percobaan ke-${i + 1}`).toBe("retry");
      clock.advance(BACKOFF_MAX_SECONDS + 1);
    }
    const row = await store.findById(id);
    expect(row!.status).toBe("retry");
    expect(row!.retry_count).toBe(12);
  });

  it("backoff eksponensial dengan batas atas 1 jam", () => {
    expect(backoffSeconds(0)).toBe(30);
    expect(backoffSeconds(1)).toBe(60);
    expect(backoffSeconds(2)).toBe(120);
    expect(backoffSeconds(20)).toBe(BACKOFF_MAX_SECONDS);
  });

  it("pekerjaan yang belum jatuh tempo tidak ikut terkirim", async () => {
    const id = await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "1", operation: "upsert" });
    await outbox.markFailed(id, "Network request failed");

    expect(await store.due(clock.at(), 100)).toHaveLength(0);
    // M11: delay kini base + jitter deterministik (maks +20%), jadi jam
    // diputar melewati keduanya — bukan lagi tepat base seperti dulu.
    clock.advance(Math.floor(BACKOFF_BASE_SECONDS * 1.2) + 1);
    expect(await store.due(clock.at(), 100)).toHaveLength(1);
  });
});

describe("waktu disimpan dalam format SQLite UTC", () => {
  it("bolak-balik tanpa kehilangan nilai", () => {
    const stamp = toSqliteUtc(new Date("2026-10-13T04:05:06Z"));
    expect(stamp).toBe("2026-10-13 04:05:06");
    expect(fromSqliteUtc(stamp)!.toISOString()).toBe("2026-10-13T04:05:06.000Z");
  });

  it("nilai rusak menghasilkan null, bukan tanggal epoch", () => {
    expect(fromSqliteUtc("bukan-tanggal")).toBeNull();
    expect(fromSqliteUtc(null)).toBeNull();
  });
});

describe("hitung untuk sync status bar", () => {
  it("pending dan dead dihitung terpisah", async () => {
    await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "1", operation: "upsert" });
    const id2 = await outbox.enqueue({ localUserId: UID, entityType: "habits", entityLocalId: "2", operation: "upsert" });
    for (let i = 0; i < 3; i++) {
      await outbox.markFailed(id2, "401 unauthorized");
      clock.advance(BACKOFF_BASE_SECONDS + 1);
    }
    expect(await outbox.pendingCount(UID)).toBe(1);
    expect(await outbox.deadCount(UID)).toBe(1);
  });
});
