/**
 * Implementasi `OutboxStore` di memori.
 *
 * Dipakai tes supaya aturan retry bisa diuji tanpa emulator atau expo-sqlite.
 * Bukan mock: ia menyimpan dan menyaring baris sungguhan dengan semantik yang
 * sama seperti kueri SQL-nya (status IN pending/retry, next_retry_at jatuh
 * tempo, urut id).
 */

import type { OutboxRow, OutboxStore } from "./outbox";

export class MemoryOutboxStore implements OutboxStore {
  private rows = new Map<number, OutboxRow>();
  private nextId = 1;

  async insert(row: Omit<OutboxRow, "id">): Promise<number> {
    const id = this.nextId++;
    this.rows.set(id, { ...row, id });
    return id;
  }

  async update(id: number, patch: Partial<OutboxRow>): Promise<void> {
    const existing = this.rows.get(id);
    if (!existing) return;
    this.rows.set(id, { ...existing, ...patch, id });
  }

  async findById(id: number): Promise<OutboxRow | null> {
    return this.rows.get(id) ?? null;
  }

  async due(now: Date, limit: number): Promise<OutboxRow[]> {
    const cutoff = now.toISOString().slice(0, 19).replace("T", " ");
    return [...this.rows.values()]
      .filter((r) => r.status === "pending" || r.status === "retry")
      .filter((r) => r.next_retry_at === null || r.next_retry_at <= cutoff)
      .sort((a, b) => a.id - b.id)
      .slice(0, limit);
  }

  async findPending(
    localUserId: number,
    entityType: string,
    entityLocalId: string | null,
  ): Promise<OutboxRow | null> {
    return (
      [...this.rows.values()].find(
        (r) =>
          r.local_user_id === localUserId &&
          r.entity_type === entityType &&
          r.entity_local_id === entityLocalId &&
          (r.status === "pending" || r.status === "retry"),
      ) ?? null
    );
  }

  async list(localUserId: number, status: OutboxRow["status"]): Promise<OutboxRow[]> {
    return [...this.rows.values()]
      .filter((r) => r.local_user_id === localUserId && r.status === status)
      .sort((a, b) => a.id - b.id)
      .map((r) => ({ ...r }));
  }

  async count(localUserId: number, status?: OutboxRow["status"]): Promise<number> {
    return [...this.rows.values()].filter(
      (r) => r.local_user_id === localUserId && (status === undefined || r.status === status),
    ).length;
  }
}
