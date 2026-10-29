/**
 * M12 — layar Learning (penutup celah parity §14: "sama seperti desktop").
 *
 * Notebook, sumber, catatan tersimpan, dan riwayat chat dibaca dari
 * `/api/learning/notebooks` (payload sama dengan web). Membuat notebook dan
 * menambah catatan memakai endpoint POST yang sama. Generasi AI (ringkasan,
 * kuis, podcast) tetap dijalankan dari desktop pada fase ini — kunci Gemini
 * tidak pernah meninggalkan server — sehingga layar ini jujur menampilkannya
 * sebagai baca-saja, bukan tombol karangan.
 */

import React, { useState } from "react";

import { Button, Card, InlineNote, SectionHeader, TextField } from "../components/ui/primitives";
import { ScreenShell, Stack } from "../components/ui/ScreenShell";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { useRemote } from "../data/useRemote";
import { parseNotebooks } from "../features/studio/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

export default function LearningScreen() {
  const { theme } = useTheme();
  const remote = useRemote("/api/learning/notebooks", parseNotebooks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const api = remote.app?.api;

  if (remote.loading && !remote.data) {
    return <LoadingState theme={theme} title={t("nav_learning")} message={t("loading")} />;
  }
  if (remote.error && !remote.data) {
    return (
      <ErrorState
        theme={theme}
        title={t("nav_learning")}
        message={remote.error}
        retryLabel={t("web_retry")}
        onRetry={() => void remote.reload()}
      />
    );
  }

  const notebooks = remote.data ?? [];
  const selected =
    notebooks.find((n) => n.id === selectedId) ?? notebooks[0] ?? null;

  const post = async (path: string, body: unknown) => {
    if (!api) return;
    setNotice(null);
    try {
      await api.post(path, body);
      await remote.reload();
    } catch {
      setNotice(t("mobile_rpg_needs_server"));
    }
  };

  return (
    <ScreenShell
      theme={theme}
      title={t("nav_learning")}
      onRefresh={() => void remote.reload()}
      refreshing={remote.refreshing}
      offlineNotice={remote.online ? null : t("mobile_offline_banner")}
    >
      <Stack>
        {notice ? <InlineNote theme={theme}>{notice}</InlineNote> : null}
        <Card theme={theme}>
          <TextField
            theme={theme}
            label={t("mobile_learning_new_notebook")}
            value={newTitle}
            onChangeText={setNewTitle}
          />
          <Button
            theme={theme}
            label={t("mobile_learning_new_notebook")}
            disabled={!newTitle.trim()}
            onPress={() => {
              void post("/api/learning/notebooks", { title: newTitle.trim() });
              setNewTitle("");
            }}
          />
        </Card>
        {notebooks.length === 0 ? (
          <EmptyState theme={theme} title={t("nav_learning")} message={t("notes_empty")} />
        ) : (
          notebooks.map((nb) => (
            <Card key={nb.id} theme={theme}>
              <Button
                theme={theme}
                variant={selected?.id === nb.id ? "primary" : "ghost"}
                label={`${nb.icon} ${nb.title}`}
                onPress={() => setSelectedId(nb.id)}
              />
            </Card>
          ))
        )}
        {selected ? (
          <Card theme={theme}>
            <SectionHeader theme={theme} title={`${selected.icon} ${selected.title}`} />
            <SectionHeader theme={theme} title={t("mobile_learning_sources")} />
            {selected.sourceTitles.map((title, i) => (
              <InlineNote key={i} theme={theme}>{`• ${title}`}</InlineNote>
            ))}
            <SectionHeader theme={theme} title={t("mobile_learning_notes")} />
            {selected.noteTitles.map((title, i) => (
              <InlineNote key={i} theme={theme}>{`• ${title}`}</InlineNote>
            ))}
            <TextField
              theme={theme}
              label={t("mobile_note_title")}
              value={noteTitle}
              onChangeText={setNoteTitle}
            />
            <TextField
              theme={theme}
              label={t("mobile_note_content")}
              value={noteContent}
              onChangeText={setNoteContent}
              multiline
            />
            <Button
              theme={theme}
              label={t("mobile_note_add")}
              disabled={!noteContent.trim()}
              onPress={() => {
                void post(`/api/learning/notebooks/${selected.id}/notes`, {
                  title: noteTitle.trim(),
                  content: noteContent.trim(),
                });
                setNoteTitle("");
                setNoteContent("");
              }}
            />
          </Card>
        ) : null}
      </Stack>
    </ScreenShell>
  );
}
