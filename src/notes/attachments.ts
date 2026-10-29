/**
 * M08 wave 3 — pilih & unggah lampiran catatan.
 *
 * Alurnya: `expo-document-picker` memberi URI berkas lokal → `expo-file-system`
 * membacanya sebagai base64 → `POST /api/upload/file` dengan body JSON.
 *
 * Kenapa base64 dan bukan multipart: endpoint backend
 * (`api_server.py::_handle_upload_file`) memang mengharapkan
 * `{target, noteId, name, mime, dataBase64}`. Mengirim multipart akan
 * membutuhkan perubahan di sisi server, dan mengubah API bukan bagian dari
 * pekerjaan ini.
 *
 * Seperti `src/notifications/`, modul ini mengimpor modul native dan karena itu
 * tidak boleh diimpor dari berkas model fitur (`src/features/`).
 */

import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";

import type { ApiCalls } from "../data/httpApi";
import {
  ATTACHMENT_EXTS,
  ATTACHMENT_MAX_BYTES,
  attachmentRejection,
  attachmentUploadBody,
  fileExtension,
} from "../features/notes/model";

export interface PickedFile {
  name: string;
  uri: string;
  mime: string;
  size: number | undefined;
}

/** Daftar MIME yang diterima server, dipakai membatasi pemilih berkas. */
export const PICKER_MIME_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
] as const;

export async function pickAttachment(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [...PICKER_MIME_TYPES],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return {
    name: asset.name,
    uri: asset.uri,
    // MIME dari pemilih kadang kosong; fallback ke tebakan dari ekstensi.
    mime: asset.mimeType ?? guessMime(asset.name),
    size: asset.size,
  };
}

function guessMime(fileName: string): string {
  const ext = fileExtension(fileName);
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
  };
  return map[ext] ?? "application/octet-stream";
}

export type UploadFailure =
  | { kind: "rejected"; reason: "too-large" | "bad-type" }
  | { kind: "read-failed"; reason: string }
  | { kind: "server"; reason: string };

export type UploadOutcome =
  | { ok: true; attachmentId: string }
  | { ok: false; failure: UploadFailure };

/**
 * Baca berkas lalu unggah.
 *
 * Penolakan jenis/ukuran dilakukan SEBELUM berkas dibaca: membaca 5 MB ke
 * memori hanya untuk membuangnya adalah pemborosan yang terasa di ponsel.
 */
export async function uploadAttachment(
  api: ApiCalls,
  noteId: string,
  file: PickedFile,
): Promise<UploadOutcome> {
  const rejection = attachmentRejection(file.name, file.size);
  if (rejection) return { ok: false, failure: { kind: "rejected", reason: rejection } };

  let base64: string;
  try {
    base64 = await new File(file.uri).base64();
  } catch (err) {
    return {
      ok: false,
      failure: { kind: "read-failed", reason: err instanceof Error ? err.message : String(err) },
    };
  }
  if (!base64) {
    return { ok: false, failure: { kind: "read-failed", reason: "empty" } };
  }
  // Penjaga kedua: `size` dari pemilih bisa tidak ada, jadi ukuran sebenarnya
  // baru diketahui setelah dibaca. 3/4 dari panjang base64 ≈ jumlah byte.
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > ATTACHMENT_MAX_BYTES) {
    return { ok: false, failure: { kind: "rejected", reason: "too-large" } };
  }

  try {
    const res = await api.post<{ ok?: boolean; error?: string; msg?: string; attachment?: { id?: unknown } }>(
      "/api/upload/file",
      attachmentUploadBody(noteId, file.name, file.mime, base64),
    );
    if (!res || res.ok === false) {
      return { ok: false, failure: { kind: "server", reason: res?.msg ?? res?.error ?? "upload_failed" } };
    }
    const id = res.attachment?.id;
    return {
      ok: true,
      attachmentId: id === undefined || id === null ? "" : String(id),
    };
  } catch (err) {
    return {
      ok: false,
      failure: { kind: "server", reason: err instanceof Error ? err.message : String(err) },
    };
  }
}

/** Kunci i18n untuk pesan kegagalan, supaya layar tidak menyusun string sendiri. */
export function failureMessageKey(failure: UploadFailure): string {
  if (failure.kind === "rejected") {
    return failure.reason === "too-large"
      ? "notes_attach_too_large"
      : "notes_attach_type_unsupported";
  }
  return "mobile_attachment_failed";
}

/** Ringkasan batasan, untuk ditampilkan sebelum pengguna memilih berkas. */
export function attachmentLimitsText(): string {
  return `${ATTACHMENT_EXTS.join(" ")} · ${Math.round(ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB`;
}
