/**
 * M08 — SyncTransport nyata di atas API desktop.
 *
 * Ini bagian yang membuat antrean offline benar-benar berguna: baris outbox
 * diterjemahkan jadi panggilan API yang sudah ada, satu per satu, sehingga
 * satu baris yang ditolak server tidak menahan baris lain.
 *
 * Pemetaannya:
 *   operation "delete" -> POST /api/<entitas>/<id>/delete
 *   operation "upsert" -> POST /api/<entitas>/<id>/update
 *
 * Batas yang penting dan disengaja: transport ini hanya menangani baris yang
 * id-nya SUDAH dikenal server. Baris baru yang dibuat saat offline tidak
 * pernah diantrekan (lihat layar Habits/Dailies/Quests) karena id-nya baru
 * ada setelah server menjawab — mengirim id karangan akan membuat server
 * menolak, atau lebih buruk, menimpa baris lain.
 */

import { httpRemoteSource, type ApiCalls } from "../data/httpApi";
import type { OutboxRow } from "./outbox";
import type { PullResult, PushResult, SyncTransport } from "./syncService";

export const TRANSPORT_ENTITY_BASE: Record<string, string> = {
  habits: "/api/habits",
  dailies: "/api/dailies",
  todos: "/api/todos",
  // Keduanya punya endpoint `/update` dan `/delete` sendiri
  // (`life_api.py:1098,1444`), jadi pemetaan upsert/delete tetap berlaku.
  sport: "/api/sport",
  economy: "/api/economy",
  // Wave 3: ketiganya punya `/update` dan `/delete` sendiri
  // (`life_api.py:1793` supplies, `:1556` notes, `:1603` reminders).
  //
  // `pomodoro` dan `calendar` SENGAJA tidak ada di sini:
  //   • pomodoro hanya punya `/api/pomodoro/complete` — tidak ada update/delete;
  //   • catatan kalender tidak punya id (kuncinya tanggal), jadi tidak bisa
  //     dipetakan ke `/api/<entity>/<id>/...`.
  // Kalau keduanya dimasukkan, outbox akan membangun rute yang tidak ada dan
  // tiap drain menghasilkan kegagalan permanen.
  supplies: "/api/supplies",
  notes: "/api/notes",
  reminders: "/api/reminders",
};

/** Terjemahkan satu baris outbox jadi satu panggilan API. Melempar saat gagal. */
export async function pushRow(api: ApiCalls, row: OutboxRow): Promise<void> {
  const base = TRANSPORT_ENTITY_BASE[row.entity_type];
  if (!base) {
    throw new Error(`entity type tanpa rute transport: ${row.entity_type}`);
  }
  if (row.entity_local_id === null || row.entity_local_id === "") {
    // Baris tanpa identitas tidak bisa dipetakan ke rute mana pun. Dilempar
    // supaya outbox mencatatnya sebagai gagal, bukan dikirim ke `/api/x//update`
    // yang akan mengenai rute lain.
    throw new Error("baris outbox tanpa entity_local_id");
  }
  const id = encodeURIComponent(row.entity_local_id);
  if (row.operation === "delete") {
    await api.post(`${base}/${id}/delete`, {});
    return;
  }
  if (row.operation === "upsert") {
    let payload: unknown = {};
    try {
      payload = JSON.parse(row.payload);
    } catch {
      // Payload rusak tidak bisa dikirim apa adanya. Dilempar sebagai error
      // supaya outbox mencatatnya; mengirim `{}` akan MENGHAPUS field di
      // server karena handler update menimpa field yang ada di body.
      throw new Error("payload outbox tidak bisa dibaca sebagai JSON");
    }
    await api.post(`${base}/${id}/update`, payload);
    return;
  }
  throw new Error(`operasi outbox tidak dikenal: ${row.operation}`);
}

export function apiTransport(api: ApiCalls): SyncTransport {
  const remote = httpRemoteSource(api);
  return {
    async push(rows: OutboxRow[]): Promise<PushResult[]> {
      const out: PushResult[] = [];
      for (const row of rows) {
        try {
          await pushRow(api, row);
          out.push({ id: row.id, ok: true });
        } catch (err) {
          out.push({
            id: row.id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return out;
    },
    pull(
      localUserId: number,
      entityType: string,
      since: string | null,
    ): Promise<PullResult> {
      return remote.list(localUserId, entityType, since);
    },
  };
}
