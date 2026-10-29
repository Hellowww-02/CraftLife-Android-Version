/**
 * M08 wave 3 — layar Notes.
 *
 * Satu panggilan `GET /api/notes` memberi catatan + folder + lampiran, jadi
 * layar ini memakai `useRemote` (bukan cache entitas): yang dibutuhkan adalah
 * tiga daftar yang saling menjelaskan, bukan satu daftar baris.
 *
 * Konsekuensi yang ditulis jujur di UI: saat offline layar menampilkan data
 * terakhir yang masih diingat, dan tulisan baru ditolak dengan pesan jelas
 * alih-alih pura-pura tersimpan. Catatan tidak punya jalur outbox karena
 * membuat catatan butuh `id` dari server sebelum lampiran bisa menempel.
 */

import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionList, BottomSheet, type SheetAction } from "../components/ui/BottomSheet";
import {
  Button,
  Card,
  Chip,
  ChipRow,
  InlineNote,
  KeyValueRow,
  SectionHeader,
  TextField,
} from "../components/ui/primitives";
import { ScreenShell, Stack } from "../components/ui/ScreenShell";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { useRemote } from "../data/useRemote";
import { errorMessage } from "../data/httpApi";
import { writeTask, type WriteOutcome } from "../data/taskActions";
import {
  attachmentLimitsText,
  failureMessageKey,
  pickAttachment,
  uploadAttachment,
} from "../notes/attachments";
import {
  attachmentsFor,
  countByFolder,
  draftError as noteDraftError,
  draftFromNote,
  emptyNoteDraft,
  filterNotes,
  formatFileSize,
  NOTES_PATH,
  noteCreatePayload,
  notePreview,
  noteUpdatePayload,
  parseNotesPackage,
  type NoteDraft,
  type NoteRow,
} from "../features/notes/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

type SheetMode =
  | { kind: "closed" }
  | { kind: "actions"; row: NoteRow }
  | { kind: "editor"; draft: NoteDraft }
  | { kind: "detail"; row: NoteRow };

export default function NotesScreen() {
  const { theme } = useTheme();
  const pkg = useRemote(NOTES_PATH, parseNotesPackage);

  const [sheet, setSheet] = useState<SheetMode>({ kind: "closed" });
  const [search, setSearch] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const closeSheet = useCallback(() => setSheet({ kind: "closed" }), []);

  const post = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      if (!pkg.app) {
        setNotice(t("web_api_offline"));
        return false;
      }
      setBusy(true);
      setNotice(null);
      try {
        await pkg.app.api.post(path, body);
        await pkg.reload();
        return true;
      } catch (err) {
        setNotice(t("error_occurred", { error: errorMessage(err) }));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [pkg],
  );

  /**
   * Jalur tulis yang bisa diantrekan. Dipakai untuk operasi yang punya pasangan
   * `/update` atau `/delete` di backend, karena hanya dua bentuk itu yang bisa
   * dibangun oleh `apiTransport`. Operasi lain (buat baru, duplikat, arsip,
   * lampiran) tetap lewat `post` dan memang butuh jaringan.
   */
  const runWrite = useCallback(
    async (outcome: Promise<WriteOutcome>) => {
      setBusy(true);
      setNotice(null);
      try {
        const result = await outcome;
        setNotice(
          result.kind === "failed"
            ? t("error_occurred", { error: result.reason })
            : result.kind === "queued"
              ? t("mobile_saved_offline")
              : null,
        );
        await pkg.reload();
      } finally {
        setBusy(false);
      }
    },
    [pkg],
  );

  const notes = useMemo(() => pkg.data?.notes ?? [], [pkg.data]);
  const folders = useMemo(() => pkg.data?.folders ?? [], [pkg.data]);
  const attachments = useMemo(() => pkg.data?.attachments ?? [], [pkg.data]);
  const perFolder = useMemo(() => countByFolder(notes), [notes]);

  const visible = useMemo(
    () => filterNotes(notes, { search, folderId, archived: showArchived }),
    [folderId, notes, search, showArchived],
  );

  const folderName = useCallback(
    (id: string | null) => folders.find((f) => f.id === id)?.name ?? t("notes_no_folder"),
    [folders],
  );

  const saveDraft = useCallback(() => {
    if (sheet.kind !== "editor" || !pkg.app) return;
    if (noteDraftError(sheet.draft)) {
      setNotice(t("notes_to_learning_empty"));
      return;
    }
    const draft = sheet.draft;
    closeSheet();
    if (draft.id === null) {
      // Catatan baru butuh id dari server sebelum lampiran bisa menempel.
      void post("/api/notes", noteCreatePayload(draft));
      return;
    }
    const previous = notes.find((row) => row.id === draft.id) ?? null;
    closeSheet();
    void runWrite(
      writeTask(
        { api: pkg.app.api, repo: pkg.app.repo },
        {
          path: `/api/notes/${draft.id}/update`,
          body: noteUpdatePayload(draft),
          entityType: "notes",
          entityId: draft.id,
          nextPayload: { ...draft, id: draft.id },
          previousPayload: previous,
        },
      ),
    );
  }, [closeSheet, notes, pkg, post, runWrite, sheet]);

  const togglePin = useCallback(
    (row: NoteRow) => {
      if (!pkg.app) return;
      closeSheet();
      // `pinned` dikirim eksplisit: backend memperlakukan `None` sebagai
      // "jangan ubah" (G02), jadi untuk MEMBALIK status ia harus dikirim.
      void runWrite(
        writeTask(
          { api: pkg.app.api, repo: pkg.app.repo },
          {
            path: `/api/notes/${row.id}/update`,
            body: { pinned: !row.isPinned },
            entityType: "notes",
            entityId: row.id,
            nextPayload: { ...row, isPinned: !row.isPinned },
            previousPayload: row,
          },
        ),
      );
    },
    [closeSheet, pkg, runWrite],
  );

  const toggleArchive = useCallback(
    (row: NoteRow) => {
      closeSheet();
      void post(`/api/notes/${row.id}/archive`, { archived: !row.isArchived });
    },
    [closeSheet, post],
  );

  const duplicate = useCallback(
    (row: NoteRow) => {
      closeSheet();
      void post(`/api/notes/${row.id}/duplicate`, {
        ...(row.folderId ? { folderId: row.folderId } : {}),
      });
    },
    [closeSheet, post],
  );

  const remove = useCallback(
    (row: NoteRow) => {
      if (!pkg.app) return;
      closeSheet();
      void runWrite(
        writeTask(
          { api: pkg.app.api, repo: pkg.app.repo },
          {
            path: `/api/notes/${row.id}/delete`,
            body: {},
            entityType: "notes",
            entityId: row.id,
            nextPayload: null,
            previousPayload: row,
          },
        ),
      );
    },
    [closeSheet, pkg, runWrite],
  );

  const removeAttachment = useCallback(
    (attachmentId: string) => {
      void post("/api/notes/attachment/delete", { id: Number.parseInt(attachmentId, 10) });
    },
    [post],
  );

  const addAttachment = useCallback(
    async (noteId: string) => {
      if (!pkg.app) {
        setNotice(t("web_api_offline"));
        return;
      }
      setBusy(true);
      setNotice(null);
      try {
        const picked = await pickAttachment();
        if (!picked) return;
        const result = await uploadAttachment(pkg.app.api, noteId, picked);
        if (result.ok) {
          await pkg.reload();
        } else {
          setNotice(t(failureMessageKey(result.failure)));
        }
      } catch (err) {
        setNotice(t("error_occurred", { error: errorMessage(err) }));
      } finally {
        setBusy(false);
      }
    },
    [pkg],
  );

  const actionsFor = useCallback(
    (row: NoteRow): SheetAction[] => [
      {
        key: "open",
        label: t("notes_attach_open"),
        icon: "📄",
        onPress: () => setSheet({ kind: "detail", row }),
      },
      {
        key: "edit",
        label: t("notes_edit"),
        icon: "✎",
        onPress: () => setSheet({ kind: "editor", draft: draftFromNote(row) }),
      },
      {
        key: "pin",
        label: row.isPinned ? t("note_unpin") : t("note_pin"),
        icon: row.isPinned ? "📌" : "📍",
        onPress: () => togglePin(row),
      },
      {
        key: "duplicate",
        label: t("notes_duplicate_btn"),
        icon: "📋",
        onPress: () => duplicate(row),
      },
      {
        key: "archive",
        label: row.isArchived ? t("notes_unarchived") : t("notes_archive"),
        icon: "📦",
        onPress: () => toggleArchive(row),
      },
      {
        key: "delete",
        label: t("notes_delete"),
        icon: "🗑",
        destructive: true,
        onPress: () => remove(row),
      },
    ],
    [duplicate, remove, toggleArchive, togglePin],
  );

  if (pkg.loading) {
    return <LoadingState theme={theme} title={t("notes_title")} message={t("loading")} />;
  }
  if (!pkg.data) {
    return (
      <ErrorState
        theme={theme}
        title={t("app_error_title")}
        message={pkg.error ?? t("web_api_offline")}
        onRetry={() => void pkg.refresh()}
        retryLabel={t("web_retry")}
      />
    );
  }

  return (
    <>
      <ScreenShell
        theme={theme}
        title={t("notes_title")}
        subtitle={t("notes_count_format", { count: notes.filter((n) => !n.isArchived).length })}
        onRefresh={() => void pkg.refresh()}
        refreshing={pkg.refreshing}
        offlineNotice={!pkg.online ? t("mobile_offline_banner") : notice}
        fab={{
          icon: "+",
          label: t("notes_add_note"),
          onPress: () => setSheet({ kind: "editor", draft: emptyNoteDraft(folderId) }),
        }}
      >
        <TextField
          theme={theme}
          label={t("notes_search_placeholder")}
          value={search}
          onChangeText={setSearch}
          placeholder={t("notes_search_placeholder")}
        />

        <ChipRow>
          <Chip
            theme={theme}
            label={t("notes_all")}
            selected={folderId === null && !showArchived}
            onPress={() => {
              setFolderId(null);
              setShowArchived(false);
            }}
          />
          {folders.map((folder) => (
            <Chip
              key={folder.id}
              theme={theme}
              label={`${folder.icon} ${folder.name}${
                perFolder.get(folder.id) ? ` (${perFolder.get(folder.id)})` : ""
              }`}
              selected={folderId === folder.id}
              onPress={() => setFolderId(folderId === folder.id ? null : folder.id)}
            />
          ))}
          <Chip
            theme={theme}
            label={showArchived ? t("notes_hide_archived") : t("notes_show_archived")}
            selected={showArchived}
            onPress={() => setShowArchived(!showArchived)}
          />
        </ChipRow>

        {visible.length === 0 ? (
          <EmptyState
            theme={theme}
            title={showArchived ? t("notes_archive_empty") : t("notes_title")}
            message={
              notes.length === 0
                ? t("notes_note_content_ph")
                : t("notes_search_result", { count: 0 })
            }
            actionLabel={t("notes_add_note")}
            onAction={() => setSheet({ kind: "editor", draft: emptyNoteDraft(folderId) })}
          />
        ) : (
          <Stack>
            {visible.map((row) => (
              <Card
                key={row.id}
                theme={theme}
                onPress={() => setSheet({ kind: "editor", draft: draftFromNote(row) })}
                onLongPress={() => setSheet({ kind: "actions", row })}
                accessibilityLabel={`${row.isPinned ? "📌 " : ""}${row.title}`}
              >
                <View style={styles.body}>
                  <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={2}>
                    {`${row.isPinned ? "📌 " : ""}${row.title || t("notes_note_title_ph")}`}
                  </Text>
                  <Text style={[styles.meta, { color: theme.colors.muted }]} numberOfLines={2}>
                    {notePreview(row.content)}
                  </Text>
                  <Text style={[styles.meta, { color: theme.colors.muted }]}>
                    {[folderName(row.folderId), row.updatedAt.slice(0, 16).replace("T", " ")]
                      .filter((v) => v !== "")
                      .join(" · ")}
                  </Text>
                </View>
              </Card>
            ))}
            <InlineNote theme={theme}>{t("mobile_long_press_hint")}</InlineNote>
          </Stack>
        )}
      </ScreenShell>

      <BottomSheet
        theme={theme}
        visible={sheet.kind === "actions"}
        title={sheet.kind === "actions" ? sheet.row.title || t("notes_title") : ""}
        onClose={closeSheet}
      >
        {sheet.kind === "actions" ? (
          <ActionList theme={theme} actions={actionsFor(sheet.row)} />
        ) : null}
      </BottomSheet>

      <BottomSheet
        theme={theme}
        visible={sheet.kind === "detail"}
        title={sheet.kind === "detail" ? sheet.row.title || t("notes_title") : ""}
        onClose={closeSheet}
        footer={
          sheet.kind === "detail" ? (
            <Button
              theme={theme}
              label={t("notes_attach_file")}
              onPress={() => void addAttachment(sheet.row.id)}
              disabled={busy}
            />
          ) : undefined
        }
      >
        {sheet.kind === "detail" ? (
          <>
            <InlineNote theme={theme}>{sheet.row.content || t("notes_note_content_ph")}</InlineNote>

            <SectionHeader theme={theme} title={t("notes_attach_file")} />
            {attachmentsFor(attachments, sheet.row.id).length === 0 ? (
              <Text style={[styles.meta, { color: theme.colors.muted }]}>{attachmentLimitsText()}</Text>
            ) : (
              attachmentsFor(attachments, sheet.row.id).map((att) => (
                <Card key={att.id} theme={theme} onLongPress={() => removeAttachment(att.id)}>
                  <View style={styles.body}>
                    <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
                      {`${att.kind === "image" ? "🖼 " : "📎 "}${att.fileName}`}
                    </Text>
                    <Text style={[styles.meta, { color: theme.colors.muted }]}>
                      {formatFileSize(att.size)}
                    </Text>
                  </View>
                </Card>
              ))
            )}
            <InlineNote theme={theme}>
              {`${attachmentLimitsText()} — ${t("mobile_attachment_hint")}`}
            </InlineNote>
          </>
        ) : null}
      </BottomSheet>

      <BottomSheet
        theme={theme}
        visible={sheet.kind === "editor"}
        title={sheet.kind === "editor" && sheet.draft.id ? t("notes_edit") : t("notes_add_note")}
        onClose={closeSheet}
        footer={<Button theme={theme} label={t("notes_save")} onPress={saveDraft} disabled={busy} />}
      >
        {sheet.kind === "editor" ? (
          <>
            <TextField
              theme={theme}
              label={t("notes_note_title_ph")}
              value={sheet.draft.title}
              onChangeText={(title) => setSheet({ kind: "editor", draft: { ...sheet.draft, title } })}
              placeholder={t("notes_note_title_ph")}
            />
            <TextField
              theme={theme}
              label={t("notes_note_content_ph")}
              value={sheet.draft.content}
              onChangeText={(content) => setSheet({ kind: "editor", draft: { ...sheet.draft, content } })}
              placeholder={t("notes_note_content_ph")}
              multiline
            />
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                {t("notes_folder_label")}
              </Text>
              <ChipRow>
                <Chip
                  theme={theme}
                  label={t("notes_no_folder")}
                  selected={sheet.draft.folderId === null}
                  onPress={() => setSheet({ kind: "editor", draft: { ...sheet.draft, folderId: null } })}
                />
                {folders.map((folder) => (
                  <Chip
                    key={folder.id}
                    theme={theme}
                    label={`${folder.icon} ${folder.name}`}
                    selected={sheet.draft.folderId === folder.id}
                    onPress={() =>
                      setSheet({ kind: "editor", draft: { ...sheet.draft, folderId: folder.id } })
                    }
                  />
                ))}
              </ChipRow>
            </View>
            {sheet.draft.id ? (
              <KeyValueRow
                theme={theme}
                label={t("notes_attach_file")}
                value={String(attachmentsFor(attachments, sheet.draft.id).length)}
              />
            ) : null}
          </>
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: 3 },
  title: { fontSize: 15, fontWeight: "700" },
  meta: { fontSize: 12 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: "700" },
});
