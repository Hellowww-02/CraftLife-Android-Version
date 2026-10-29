/**
 * M12 — model murni untuk layar penutup celah parity: Learning, Music,
 * Cloud. Semua payload dibentuk server desktop (`studio_api.py` /
 * `cloud_api.py`); model hanya menata ulang. Pemutaran audio TIDAK
 * dimodelkan: berkas musik tinggal di disk desktop dan tidak ada endpoint
 * streaming — menampilkannya sebagai bisa-diputar akan mengarang fitur.
 */

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function asList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is Record<string, unknown> => !!v && typeof v === "object",
  );
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export interface NotebookRow {
  id: string;
  title: string;
  icon: string;
  description: string;
  sourceTitles: string[];
  noteTitles: string[];
  chatCount: number;
}

export function parseNotebooks(raw: unknown): NotebookRow[] {
  return asList(asRecord(raw).notebooks).map((n) => ({
    id: str(n.id),
    title: str(n.title, "Notebook"),
    icon: str(n.icon, "📚"),
    description: str(n.description),
    sourceTitles: asList(n.sources).map((s) => str(s.title, "—")),
    noteTitles: asList(n.savedNotes).map((s) => str(s.title, "—")),
    chatCount: asList(n.chatHistory).length,
  }));
}

export interface PlaylistRow {
  id: string;
  name: string;
  isFavorite: boolean;
  trackTitles: string[];
}

function parseTracks(value: unknown): string[] {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parseTracks(parsed);
    } catch {
      return [];
    }
  }
  return asList(value).map((t2) => str(t2.title ?? t2.name, "—"));
}

export function parsePlaylists(raw: unknown): PlaylistRow[] {
  return asList(asRecord(raw).playlists).map((p) => ({
    id: str(p.id),
    name: str(p.name, "Playlist"),
    isFavorite: num(p.is_favorite ?? p.isFavorite) === 1,
    trackTitles: parseTracks(p.tracks),
  }));
}

export interface LibraryRow {
  title: string;
  artist: string;
}

export function parseLibrary(raw: unknown): LibraryRow[] {
  return asList(asRecord(raw).library).map((row) => ({
    title: str(row.title ?? row.name, "—"),
    artist: str(row.artist),
  }));
}

export interface SearchRow {
  title: string;
  url: string;
}

export function parseSearchResults(raw: unknown): SearchRow[] {
  return asList(asRecord(asRecord(raw).result).results).map((row) => ({
    title: str(row.title ?? row.name, "—"),
    url: str(row.url ?? row.webpage_url),
  }));
}

export interface CloudStatus {
  linked: boolean;
  email: string;
  authConfigured: boolean;
  queueCounts: Record<string, number>;
  conflictCount: number;
  lastDirection: string;
  lastAt: string;
}

export function parseCloudStatus(raw: unknown): CloudStatus {
  const r = asRecord(raw);
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(asRecord(r.queueCounts))) {
    counts[k] = num(v);
  }
  return {
    linked: r.linked === true,
    email: str(r.email),
    authConfigured: r.authConfigured === true,
    queueCounts: counts,
    conflictCount: num(r.conflictCount),
    lastDirection: str(r.lastDirection),
    lastAt: str(r.lastAt),
  };
}
