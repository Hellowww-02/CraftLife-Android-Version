/**
 * M08 — identitas pengguna lokal untuk cache dan outbox.
 *
 * `entity_cache` dan `sync_outbox` di-skop per `local_user_id`, meniru
 * `sync_queue.local_user_id` di desktop. Kolom itu INTEGER, sedangkan sesi
 * Android bisa datang dari dua sumber:
 *
 *   - API desktop (`/api/me`)  -> id angka sebagai string, mis. "7"
 *   - Supabase Auth            -> UUID, mis. "1f0c…"
 *
 * UUID tidak bisa jadi integer. Daripada menyimpan NaN (yang akan membuat
 * SEMUA pengguna berbagi satu baris cache), nilai tak dikenal dipetakan ke 0
 * dan dipakai konsisten — satu ruang cache anonim, bukan cache yang tercampur.
 */

export const ANONYMOUS_LOCAL_USER_ID = 0;

export function localUserIdFrom(rawId: unknown): number {
  if (typeof rawId === "number") {
    return Number.isInteger(rawId) && rawId > 0 ? rawId : ANONYMOUS_LOCAL_USER_ID;
  }
  if (typeof rawId !== "string") return ANONYMOUS_LOCAL_USER_ID;
  const trimmed = rawId.trim();
  if (!/^\d+$/.test(trimmed)) return ANONYMOUS_LOCAL_USER_ID;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : ANONYMOUS_LOCAL_USER_ID;
}
