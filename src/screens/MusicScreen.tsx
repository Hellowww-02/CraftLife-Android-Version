/**
 * M12 — layar Music (penutup celah parity §14: "sama seperti desktop").
 *
 * Playlist + isi trek dan perpustakaan desktop dibaca dari
 * `/api/music/playlists` dan `/api/music/library`; membuat playlist dan
 * mencari lagu memakai endpoint POST yang sama dengan web. Unduhan
 * dikerjakan proses desktop (yt-dlp di mesin desktop) — tombol di sini
 * memulai job yang sama dan hasilnya masuk perpustakaan desktop.
 *
 * Pemutaran audio SENGAJA tidak ditampilkan: berkas musik tinggal di disk
 * desktop dan belum ada endpoint streaming, jadi tombol "putar" di ponsel
 * akan mengarang fitur. Batas ini tertulis di layar, bukan disembunyikan.
 */

import React, { useState } from "react";

import { Button, Card, InlineNote, SectionHeader, TextField } from "../components/ui/primitives";
import { ScreenShell, Stack } from "../components/ui/ScreenShell";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { useRemote } from "../data/useRemote";
import { parseLibrary, parsePlaylists, parseSearchResults, SearchRow } from "../features/studio/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

export default function MusicScreen() {
  const { theme } = useTheme();
  const playlistsRemote = useRemote("/api/music/playlists", parsePlaylists);
  const libraryRemote = useRemote("/api/music/library", parseLibrary);
  const [newName, setNewName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const api = playlistsRemote.app?.api;

  if (playlistsRemote.loading && !playlistsRemote.data) {
    return <LoadingState theme={theme} title={t("nav_music")} message={t("loading")} />;
  }
  if (playlistsRemote.error && !playlistsRemote.data) {
    return (
      <ErrorState
        theme={theme}
        title={t("nav_music")}
        message={playlistsRemote.error}
        retryLabel={t("web_retry")}
        onRetry={() => void playlistsRemote.reload()}
      />
    );
  }

  const playlists = playlistsRemote.data ?? [];
  const library = libraryRemote.data ?? [];

  const search = async () => {
    if (!api || !query.trim()) return;
    setNotice(null);
    try {
      const raw = await api.post("/api/music/search", { query: query.trim() });
      setResults(parseSearchResults(raw));
    } catch {
      setNotice(t("mobile_rpg_needs_server"));
    }
  };

  const download = async (row: SearchRow) => {
    if (!api || !row.url) return;
    setNotice(null);
    try {
      await api.post("/api/music/download", { url: row.url });
      setNotice(t("mobile_music_download_note"));
    } catch {
      setNotice(t("mobile_rpg_needs_server"));
    }
  };

  return (
    <ScreenShell
      theme={theme}
      title={t("nav_music")}
      onRefresh={() => void playlistsRemote.reload()}
      refreshing={playlistsRemote.refreshing}
      offlineNotice={playlistsRemote.online ? null : t("mobile_offline_banner")}
    >
      <Stack>
        <InlineNote theme={theme}>{t("mobile_music_no_playback")}</InlineNote>
        {notice ? <InlineNote theme={theme}>{notice}</InlineNote> : null}
        <Card theme={theme}>
          <TextField
            theme={theme}
            label={t("music_new_playlist")}
            value={newName}
            onChangeText={setNewName}
          />
          <Button
            theme={theme}
            label={t("music_new_playlist")}
            disabled={!newName.trim()}
            onPress={() => {
              if (!api) return;
              void api
                .post("/api/music/playlists", { name: newName.trim() })
                .then(() => playlistsRemote.reload())
                .catch(() => setNotice(t("mobile_rpg_needs_server")));
              setNewName("");
            }}
          />
        </Card>
        {playlists.length === 0 ? (
          <EmptyState theme={theme} title={t("nav_music")} message={t("notes_empty")} />
        ) : (
          playlists.map((pl) => (
            <Card key={pl.id} theme={theme}>
              <SectionHeader theme={theme} title={pl.isFavorite ? `★ ${pl.name}` : pl.name} />
              {pl.trackTitles.map((title, i) => (
                <InlineNote key={i} theme={theme}>{`• ${title}`}</InlineNote>
              ))}
            </Card>
          ))
        )}
        <Card theme={theme}>
          <SectionHeader theme={theme} title={t("mobile_music_library")} />
          {library.map((row, i) => (
            <InlineNote key={i} theme={theme}>
              {row.artist ? `• ${row.title} — ${row.artist}` : `• ${row.title}`}
            </InlineNote>
          ))}
        </Card>
        <Card theme={theme}>
          <TextField
            theme={theme}
            label={t("mobile_music_search")}
            value={query}
            onChangeText={setQuery}
          />
          <Button
            theme={theme}
            label={t("mobile_music_search")}
            disabled={!query.trim()}
            onPress={() => void search()}
          />
          {results.map((row, i) => (
            <Button
              key={i}
              theme={theme}
              variant="ghost"
              label={`⬇ ${row.title}`}
              onPress={() => void download(row)}
            />
          ))}
        </Card>
      </Stack>
    </ScreenShell>
  );
}
