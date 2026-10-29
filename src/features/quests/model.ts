/**
 * M08 — model layar Quests.
 *
 * Catatan penamaan yang sering menjebak: di backend ini disebut **todos**
 * (`/api/todos`, tabel `todos`, `_map_todo`), tetapi di UI disebut **Quests**.
 * `web/src/api/rpg.ts` memakai `/api/todos` untuk `addQuest`/`completeQuest`.
 * Layar Android mengikuti UI (Quests) dan rute backend (todos) sekaligus.
 *
 * Sumber bentuk data: `api_server.py::_map_todo`. Perhatikan `difficulty` di
 * payload todo sebenarnya adalah `priority` di DB — backend sudah
 * memetakannya, jadi di sini cukup dibaca sebagai difficulty.
 */

import {
  compareYmd,
  percentOf,
  sortTasks,
  toTaskBase,
  type Difficulty,
  type TaskBase,
} from "../tasks/model";

export interface QuestRow extends TaskBase {
  dueDate: string | null;
  isCompleted: boolean;
}

export function toQuestRow(raw: unknown): QuestRow | null {
  const base = toTaskBase(raw, "📜");
  if (!base) return null;
  const r = raw as Record<string, unknown>;
  return {
    ...base,
    dueDate:
      typeof r.dueDate === "string" && r.dueDate !== "" ? r.dueDate.slice(0, 10) : null,
    isCompleted: r.isCompleted === true,
  };
}

export function toQuestRows(rawList: unknown): QuestRow[] {
  if (!Array.isArray(rawList)) return [];
  const out: QuestRow[] = [];
  for (const raw of rawList) {
    const row = toQuestRow(raw);
    if (row) out.push(row);
  }
  return sortTasks(out);
}

export type QuestBucket = "overdue" | "today" | "upcoming" | "someday" | "done";

export const QUEST_BUCKET_ORDER: readonly QuestBucket[] = [
  "overdue",
  "today",
  "upcoming",
  "someday",
  "done",
] as const;

/** Kunci label grup memakai katalog yang sudah ada, kecuali dua kunci baru M08. */
export const QUEST_BUCKET_LABEL: Record<QuestBucket, string> = {
  overdue: "mobile_quest_overdue",
  today: "food_today",
  upcoming: "love_upcoming",
  someday: "mobile_quest_no_due",
  done: "habit_done_today",
};

/**
 * Kelompokkan quest menurut tenggat, memakai tanggal SERVER.
 *
 * Kalau jam server belum tersedia (`dateKey` null), quest bertenggat tidak
 * bisa dinilai terlambat atau tidak. Mereka ditempatkan di "upcoming" dan
 * `dateKeyAvailable` diset false supaya UI bisa memberi tahu pengguna bahwa
 * pengelompokan tanggal belum aktif — menebak dengan jam perangkat justru
 * bisa menandai quest "terlambat" yang sebenarnya masih hari ini.
 */
export function questBucket(row: QuestRow, dateKey: string | null): QuestBucket {
  if (row.isCompleted) return "done";
  if (!row.dueDate || dateKey === null) return row.dueDate ? "upcoming" : "someday";
  const cmp = compareYmd(row.dueDate, dateKey);
  if (cmp < 0) return "overdue";
  if (cmp === 0) return "today";
  return "upcoming";
}

export interface QuestGroup {
  bucket: QuestBucket;
  labelKey: string;
  rows: QuestRow[];
}

export interface QuestGrouping {
  groups: QuestGroup[];
  dateKeyAvailable: boolean;
}

export function groupQuests(
  rows: readonly QuestRow[],
  dateKey: string | null,
): QuestGrouping {
  const byBucket = new Map<QuestBucket, QuestRow[]>();
  for (const bucket of QUEST_BUCKET_ORDER) byBucket.set(bucket, []);
  for (const row of rows) {
    const bucket = questBucket(row, dateKey);
    byBucket.get(bucket)!.push(row);
  }

  const groups: QuestGroup[] = [];
  for (const bucket of QUEST_BUCKET_ORDER) {
    const list = byBucket.get(bucket)!;
    if (list.length === 0) continue;
    // Di dalam grup: yang paling cepat jatuh tempo di atas, tanpa tenggat di bawah.
    list.sort((a, b) => compareYmd(a.dueDate, b.dueDate));
    groups.push({ bucket, labelKey: QUEST_BUCKET_LABEL[bucket], rows: list });
  }
  return { groups, dateKeyAvailable: dateKey !== null };
}

export interface QuestProgress {
  done: number;
  total: number;
  percent: number;
  overdue: number;
}

export function questsProgress(
  rows: readonly QuestRow[],
  dateKey: string | null,
): QuestProgress {
  const done = rows.filter((r) => r.isCompleted).length;
  const overdue = rows.filter((r) => questBucket(r, dateKey) === "overdue").length;
  return { done, total: rows.length, percent: percentOf(done, rows.length), overdue };
}

export function applyQuestComplete(row: QuestRow): QuestRow {
  return { ...row, isCompleted: !row.isCompleted };
}

export interface QuestDraft {
  title: string;
  icon: string;
  difficulty: Difficulty;
  notes: string;
  dueDate: string | null;
  folderId?: string | null;
}

export function emptyQuestDraft(): QuestDraft {
  return { title: "", icon: "📜", difficulty: "medium", notes: "", dueDate: null };
}

export function draftFromQuest(row: QuestRow): QuestDraft {
  return {
    title: row.title,
    icon: row.icon,
    difficulty: row.difficulty,
    notes: row.notes,
    dueDate: row.dueDate,
    folderId: row.folderId,
  };
}

export function draftError(draft: QuestDraft): "empty-title" | null {
  return draft.title.trim() === "" ? "empty-title" : null;
}

/**
 * Payload untuk `POST /api/todos` dan `/api/todos/:id/update`.
 *
 * Nama field-nya `difficulty`, BUKAN `priority` — meski kolom DB-nya bernama
 * `priority`. Handler create hanya membaca `body.get("difficulty")`
 * (`api_server.py:2443`); handler update menerima keduanya
 * (`api_server.py:2483`). Mengirim `priority` saja akan membuat quest baru
 * diam-diam tersimpan sebagai "medium" apa pun pilihan pengguna.
 */
export function questPayload(draft: QuestDraft): Record<string, unknown> {
  return {
    title: draft.title.trim(),
    icon: draft.icon,
    difficulty: draft.difficulty,
    notes: draft.notes,
    dueDate: draft.dueDate,
    ...(draft.folderId === undefined ? {} : { folderId: draft.folderId }),
  };
}
