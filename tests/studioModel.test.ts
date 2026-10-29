/**
 * M12 — bukti model layar penutup celah parity (Learning, Music, Cloud):
 * parser membaca payload server apa adanya dan tidak mengarang pemutaran
 * audio maupun status cloud.
 */
import { describe, expect, it } from "vitest";

import {
  parseCloudStatus,
  parseLibrary,
  parseNotebooks,
  parsePlaylists,
  parseSearchResults,
} from "../src/features/studio/model";

describe("parseNotebooks", () => {
  it("memetakan notebook + sumber + catatan dari payload _nb_map", () => {
    const rows = parseNotebooks({
      notebooks: [
        {
          id: 7,
          title: "Biologi",
          icon: "🧬",
          description: "Sel",
          sources: [{ title: "Bab 1" }, { title: "Bab 2" }],
          savedNotes: [{ title: "Ringkasan" }],
          chatHistory: [{ sender: "user", text: "hai" }],
        },
      ],
    });
    // id server berupa angka → model menormalkan lewat str() default ""
    // (payload nyata mengirim string sejak _nb_map); angka ditolak jujur.
    expect(rows[0]?.title).toBe("Biologi");
    expect(rows[0]?.sourceTitles).toEqual(["Bab 1", "Bab 2"]);
    expect(rows[0]?.noteTitles).toEqual(["Ringkasan"]);
    expect(rows[0]?.chatCount).toBe(1);
  });
  it("payload kosong → daftar kosong", () => {
    expect(parseNotebooks(null)).toEqual([]);
    expect(parseNotebooks({})).toEqual([]);
  });
});

describe("parsePlaylists", () => {
  it("membaca favorit + trek (objek maupun JSON string)", () => {
    const rows = parsePlaylists({
      playlists: [
        { id: "1", name: "Favorite", is_favorite: 1, tracks: [{ title: "A" }] },
        { id: "2", name: "LoFi", is_favorite: 0, tracks: '[{"title":"B"}]' },
        { id: "3", name: "Rusak", is_favorite: 0, tracks: "{bukan json" },
      ],
    });
    expect(rows[0]).toMatchObject({ isFavorite: true, trackTitles: ["A"] });
    expect(rows[1]?.trackTitles).toEqual(["B"]);
    expect(rows[2]?.trackTitles).toEqual([]);
  });
});

describe("parseLibrary + parseSearchResults", () => {
  it("library memetakan judul/artis defensif", () => {
    expect(parseLibrary({ library: [{ title: "X", artist: "Y" }, {}] })).toEqual([
      { title: "X", artist: "Y" },
      { title: "—", artist: "" },
    ]);
  });
  it("hasil cari membaca result.results + webpage_url", () => {
    expect(
      parseSearchResults({ result: { results: [{ title: "S", webpage_url: "u" }] } }),
    ).toEqual([{ title: "S", url: "u" }]);
    expect(parseSearchResults({ result: { results: [] } })).toEqual([]);
  });
});

describe("parseCloudStatus", () => {
  it("status tertaut membawa email + hitungan antrean", () => {
    const s = parseCloudStatus({
      linked: true,
      email: "a@example.com",
      authConfigured: true,
      queueCounts: { pending: 2, failed: 1 },
      conflictCount: 3,
      lastDirection: "push",
      lastAt: "2026-10-23 10:00",
    });
    expect(s.linked).toBe(true);
    expect(s.queueCounts).toEqual({ pending: 2, failed: 1 });
    expect(s.conflictCount).toBe(3);
  });
  it("payload asing → tidak tertaut, tidak mengarang", () => {
    const s = parseCloudStatus({ linked: "ya" });
    expect(s.linked).toBe(false);
    expect(s.email).toBe("");
    expect(s.queueCounts).toEqual({});
  });
});
