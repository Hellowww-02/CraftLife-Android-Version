/**
 * M08 wave 3 — model layar Notes.
 *
 * Sumber bentuk data: `life_api.py::map_note` / `map_folder`, dan
 * `GET /api/notes` yang mengembalikan `{ok, notes, noteFolders, noteAttachments}`.
 *
 * Lampiran catatan diunggah ke `POST /api/upload/file` dengan body JSON
 * `{target:"note_attachment", noteId, name, mime, dataBase64}` — **bukan**
 * multipart. Batas dan ekstensi yang diizinkan di sini disalin dari
 * `api_server.py::_NOTE_ATTACH_MAX` (5 MB) dan `_NOTE_ATTACH_EXTS`, supaya
 * penolakan terjadi di klien dengan pesan yang jelas, bukan setelah file 5 MB
 * dikirim lalu ditolak server.
 */

export interface NoteRow {
  id: string;
  folderId: string | null;
  title: string;
  content: string;
  isPinned: boolean;
  isArchived: boolean;
  zoomLevel: number;
  updatedAt: string;
}

export interface NoteFolder {
  id: string;
  name: string;
  icon: string;
  parentId: string | null;
}

export interface NoteAttachment {
  id: string;
  noteId: string;
  fileName: string;
  mime: string;
  size: number;
  kind: string;
  createdAt: string;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

export function toNoteRow(raw: unknown): NoteRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = r.id === undefined || r.id === null ? "" : String(r.id);
  if (!id) return null;
  return {
    id,
    folderId: r.folderId === null || r.folderId === undefined ? null : String(r.folderId),
    title: str(r.title),
    content: str(r.content),
    isPinned: r.isPinned === true,
    isArchived: r.isArchived === true,
    zoomLevel: Math.round(num(r.zoomLevel, 100)),
    updatedAt: str(r.updatedAt),
  };
}

export function toNoteRows(rawList: unknown): NoteRow[] {
  if (!Array.isArray(rawList)) return [];
  const out: NoteRow[] = [];
  for (const raw of rawList) {
    const row = toNoteRow(raw);
    if (row) out.push(row);
  }
  return sortNotes(out);
}

/**
 * Urutan tampilan: disematkan dulu, lalu yang paling baru diubah.
 *
 * `updatedAt` dibandingkan sebagai string, bukan di-parse: format backend
 * `YYYY-MM-DD[ T]HH:MM:SS` sudah urut secara leksikografis, dan mem-parse-nya
 * akan memaksa kita memutuskan zona waktu — padahal tidak perlu.
 */
export function sortNotes(rows: readonly NoteRow[]): NoteRow[] {
  return [...rows].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
    return a.title.localeCompare(b.title);
  });
}

export function toNoteFolders(rawList: unknown): NoteFolder[] {
  if (!Array.isArray(rawList)) return [];
  const out: NoteFolder[] = [];
  for (const raw of rawList) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const id = r.id === undefined || r.id === null ? "" : String(r.id);
    if (!id) continue;
    out.push({
      id,
      name: str(r.name),
      icon: str(r.icon, "📁") || "📁",
      parentId: r.parentId === null || r.parentId === undefined ? null : String(r.parentId),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function toNoteAttachments(rawList: unknown): NoteAttachment[] {
  if (!Array.isArray(rawList)) return [];
  const out: NoteAttachment[] = [];
  for (const raw of rawList) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const id = r.id === undefined || r.id === null ? "" : String(r.id);
    if (!id) continue;
    out.push({
      id,
      noteId: r.noteId === undefined || r.noteId === null ? "" : String(r.noteId),
      fileName: str(r.fileName),
      mime: str(r.mime),
      size: Math.round(num(r.size)),
      kind: str(r.kind, "file") || "file",
      createdAt: str(r.createdAt),
    });
  }
  return out;
}

export function attachmentsFor(
  all: readonly NoteAttachment[],
  noteId: string,
): NoteAttachment[] {
  return all.filter((a) => a.noteId === noteId);
}

/** Preview isi: baris pertama yang tidak kosong, dipotong. */
export function notePreview(content: string, max = 140): string {
  const line = content.split(/\r?\n/).map((l) => l.trim()).find((l) => l !== "") ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export type NoteFilter = { search: string; folderId: string | null; archived: boolean };

export function filterNotes(
  rows: readonly NoteRow[],
  filter: NoteFilter,
): NoteRow[] {
  const needle = filter.search.trim().toLowerCase();
  return sortNotes(
    rows.filter((row) => {
      if (row.isArchived !== filter.archived) return false;
      if (filter.folderId !== null && row.folderId !== filter.folderId) return false;
      if (needle === "") return true;
      return (
        row.title.toLowerCase().includes(needle) ||
        row.content.toLowerCase().includes(needle)
      );
    }),
  );
}

export function countByFolder(rows: readonly NoteRow[]): Map<string | null, number> {
  const map = new Map<string | null, number>();
  for (const row of rows) {
    if (row.isArchived) continue;
    map.set(row.folderId, (map.get(row.folderId) ?? 0) + 1);
  }
  return map;
}

// ── Draf ────────────────────────────────────────────────────────────────────

export interface NoteDraft {
  id: string | null;
  title: string;
  content: string;
  folderId: string | null;
}

export function emptyNoteDraft(folderId: string | null): NoteDraft {
  return { id: null, title: "", content: "", folderId };
}

export function draftFromNote(row: NoteRow): NoteDraft {
  return { id: row.id, title: row.title, content: row.content, folderId: row.folderId };
}

export function draftError(draft: NoteDraft): "empty" | null {
  // Judul DAN isi sama-sama boleh kosong selama salah satunya terisi.
  // Catatan kosong total tidak berguna dan cuma memenuhi daftar.
  return draft.title.trim() === "" && draft.content.trim() === "" ? "empty" : null;
}

/** Payload `POST /api/notes`. */
export function noteCreatePayload(draft: NoteDraft): Record<string, unknown> {
  return {
    title: draft.title.trim() || draft.content.trim().slice(0, 60),
    content: draft.content,
    ...(draft.folderId ? { folderId: draft.folderId } : {}),
  };
}

/**
 * Payload `POST /api/notes/:id/update`.
 *
 * `pinned` sengaja TIDAK ikut: backend memperlakukan `None` sebagai "jangan
 * diubah" (G02), jadi mengirimnya di sini akan menimpa status sematan setiap
 * kali pengguna menyimpan isi. Sematan punya endpoint-nya sendiri.
 */
export function noteUpdatePayload(draft: NoteDraft): Record<string, unknown> {
  return {
    title: draft.title.trim(),
    content: draft.content,
    folderId: draft.folderId ?? "",
  };
}

// ── Lampiran ────────────────────────────────────────────────────────────────

/** Salinan `_NOTE_ATTACH_EXTS` dari `api_server.py:947`. */
export const ATTACHMENT_EXTS: readonly string[] = [
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf", ".txt", ".md", ".csv",
] as const;

/** Salinan `_NOTE_ATTACH_MAX` dari `api_server.py:946` (5 MB). */
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot).toLowerCase();
}

export type AttachmentRejection = "too-large" | "bad-type" | null;

export function attachmentRejection(
  fileName: string,
  sizeBytes: number | undefined,
): AttachmentRejection {
  if (!ATTACHMENT_EXTS.includes(fileExtension(fileName))) return "bad-type";
  // Ukuran boleh tidak diketahui (`undefined`): lebih baik mencoba dan
  // membiarkan server menolak, daripada menolak file yang sebenarnya sah.
  if (typeof sizeBytes === "number" && sizeBytes > ATTACHMENT_MAX_BYTES) return "too-large";
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Body `POST /api/upload/file`. Dipisah supaya bisa dites tanpa filesystem. */
export function attachmentUploadBody(
  noteId: string,
  fileName: string,
  mime: string,
  dataBase64: string,
): Record<string, unknown> {
  return {
    target: "note_attachment",
    noteId: Number.parseInt(noteId, 10),
    name: fileName,
    // Backend memotong di ";" untuk membuang parameter charset.
    mime: (mime.split(";")[0] ?? "").trim() || "application/octet-stream",
    dataBase64,
  };
}

// ── Paket respons `/api/notes` ──────────────────────────────────────────────

export interface NotesPackage {
  notes: NoteRow[];
  folders: NoteFolder[];
  attachments: NoteAttachment[];
}

/**
 * `GET /api/notes` mengirim ketiganya sekaligus (`life_api.py:917`), jadi satu
 * panggilan cukup untuk daftar, folder, dan lampiran. Memanggil tiga kali
 * hanya menggandakan trafik tanpa menambah data.
 */
export function parseNotesPackage(raw: unknown): NotesPackage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const notes: NoteRow[] = [];
  if (Array.isArray(r.notes)) {
    for (const item of r.notes) {
      const row = toNoteRow(item);
      if (row) notes.push(row);
    }
  }
  return {
    notes: sortNotes(notes),
    folders: toNoteFolders(r.noteFolders),
    attachments: toNoteAttachments(r.noteAttachments),
  };
}

/** Rute tunggal paket catatan. */
export const NOTES_PATH = "/api/notes";
