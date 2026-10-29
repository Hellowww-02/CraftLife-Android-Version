/**
 * M08 — layar Quests.
 *
 * Di backend ini "todos"; di UI disebut Quests (lihat komentar di
 * features/quests/model.ts). Rutenya `/api/todos`.
 *
 * Daftar dikelompokkan menurut tenggat — Terlambat / Hari Ini / Akan Datang /
 * Tanpa Tenggat / Selesai — karena di layar sempit menggulir daftar panjang
 * tanpa kelompok membuat tenggat tidak terbaca. Pengelompokan memakai tanggal
 * SERVER.
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
  ProgressBar,
  SectionHeader,
  TextField,
} from "../components/ui/primitives";
import { ScreenShell, Stack } from "../components/ui/ScreenShell";
import { ErrorState, LoadingState } from "../components/states";
import { writeTask, type WriteOutcome } from "../data/taskActions";
import {
  applyQuestComplete,
  draftError,
  draftFromQuest,
  emptyQuestDraft,
  groupQuests,
  questPayload,
  questsProgress,
  toQuestRows,
  type QuestDraft,
  type QuestRow,
} from "../features/quests/model";
import { useTaskList } from "../features/tasks/useTaskList";
import {
  addDaysToYmd,
  DIFFICULTIES,
  DIFFICULTY_META,
  normalizeYmd,
} from "../features/tasks/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

type SheetMode =
  | { kind: "closed" }
  | { kind: "actions"; row: QuestRow }
  | { kind: "form"; draft: QuestDraft; editingId: string | null };

export default function QuestsScreen() {
  const { theme } = useTheme();
  const list = useTaskList<QuestRow>("todos", toQuestRows);
  const [sheet, setSheet] = useState<SheetMode>({ kind: "closed" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dateInput, setDateInput] = useState("");

  const dateKey = list.dateKey;
  const progress = useMemo(() => questsProgress(list.rows, dateKey), [dateKey, list.rows]);
  const grouping = useMemo(() => groupQuests(list.rows, dateKey), [dateKey, list.rows]);

  const closeSheet = useCallback(() => setSheet({ kind: "closed" }), []);

  const runWrite = useCallback(
    async (outcome: Promise<WriteOutcome>) => {
      setBusy(true);
      try {
        const result = await outcome;
        setNotice(
          result.kind === "failed"
            ? t("error_occurred", { error: result.reason })
            : result.kind === "queued"
              ? t("mobile_saved_offline")
              : null,
        );
        await list.reload();
      } finally {
        setBusy(false);
      }
    },
    [list],
  );

  const complete = useCallback(
    (row: QuestRow) => {
      if (!list.app) return;
      void runWrite(
        writeTask(
          { api: list.app.api, repo: list.app.repo },
          {
            path: `/api/todos/${row.id}/complete`,
            body: {},
            entityType: "todos",
            entityId: row.id,
            nextPayload: applyQuestComplete(row),
            previousPayload: row,
          },
        ),
      );
    },
    [list, runWrite],
  );

  const remove = useCallback(
    (row: QuestRow) => {
      if (!list.app) return;
      closeSheet();
      void runWrite(
        writeTask(
          { api: list.app.api, repo: list.app.repo },
          {
            path: `/api/todos/${row.id}/delete`,
            body: {},
            entityType: "todos",
            entityId: row.id,
            nextPayload: null,
            previousPayload: row,
          },
        ),
      );
    },
    [closeSheet, list, runWrite],
  );

  const saveDraft = useCallback(() => {
    if (sheet.kind !== "form" || !list.app) return;
    if (draftError(sheet.draft)) {
      setNotice(t("error_occurred", { error: "empty" }));
      return;
    }
    const editingId = sheet.editingId;
    const body = questPayload(sheet.draft);
    closeSheet();

    if (editingId === null) {
      setBusy(true);
      list.app.api
        .post("/api/todos", body)
        .then(() => list.refresh())
        .catch((err: unknown) =>
          setNotice(t("error_occurred", { error: err instanceof Error ? err.message : String(err) })),
        )
        .finally(() => setBusy(false));
      return;
    }

    const previous = list.rows.find((r) => r.id === editingId) ?? null;
    void runWrite(
      writeTask(
        { api: list.app.api, repo: list.app.repo },
        {
          path: `/api/todos/${editingId}/update`,
          body,
          entityType: "todos",
          entityId: editingId,
          nextPayload: previous ? { ...previous, ...body, id: editingId } : body,
          previousPayload: previous,
        },
      ),
    );
  }, [closeSheet, list, runWrite, sheet]);

  const actionsFor = useCallback(
    (row: QuestRow): SheetAction[] => [
      { key: "done", label: t("task_btn_check"), icon: "✔", onPress: () => complete(row) },
      {
        key: "edit",
        label: t("dialog_edit_mode", { mode: t("page_quests_title") }),
        icon: "✏️",
        onPress: () => {
          setSheet({ kind: "form", draft: draftFromQuest(row), editingId: row.id });
          setDateInput(row.dueDate ?? "");
        },
      },
      { key: "delete", label: t("task_delete_title"), icon: "🗑", destructive: true, onPress: () => remove(row) },
    ],
    [complete, remove],
  );

  if (list.loading) {
    return <LoadingState theme={theme} title={t("page_quests_title")} message={t("loading")} />;
  }
  if (!list.online && list.rows.length === 0 && list.error) {
    return (
      <ErrorState
        theme={theme}
        title={t("app_error_title")}
        message={list.error}
        onRetry={() => void list.refresh()}
        retryLabel={t("web_retry")}
      />
    );
  }

  return (
    <>
      <ScreenShell
        theme={theme}
        title={t("page_quests_title")}
        subtitle={
          grouping.dateKeyAvailable
            ? undefined
            : // Tanpa jam server tenggat tidak bisa dinilai. Dikatakan, bukan ditebak.
              t("cloud_sync_status_never")
        }
        onRefresh={() => void list.refresh()}
        refreshing={list.refreshing}
        offlineNotice={!list.online ? t("mobile_offline_banner") : notice}
        fab={{
          icon: "+",
          label: t("dialog_add_todo"),
          onPress: () => {
            setSheet({ kind: "form", draft: emptyQuestDraft(), editingId: null });
            setDateInput("");
          },
        }}
      >
        <Card theme={theme} style={styles.progressCard}>
          <View style={styles.progressInner}>
            <ProgressBar
              theme={theme}
              percent={progress.percent}
              label={t("mobile_today_progress")}
              detail={`${progress.done}/${progress.total}`}
              color={progress.overdue > 0 ? theme.colors.accent : theme.colors.primary}
            />
            {progress.overdue > 0 ? (
              <Text style={[styles.overdue, { color: theme.colors.accent }]}>
                {t("mobile_quest_overdue")}: {progress.overdue}
              </Text>
            ) : null}
          </View>
        </Card>

        {list.rows.length === 0 ? (
          <InlineNote theme={theme}>{t("task_empty_todo")}</InlineNote>
        ) : (
          <>
            {grouping.groups.map((group) => (
              <View key={group.bucket}>
                <SectionHeader
                  theme={theme}
                  title={t(group.labelKey)}
                  trailing={
                    <Text style={[styles.count, { color: theme.colors.muted }]}>
                      {group.rows.length}
                    </Text>
                  }
                />
                <Stack>
                  {group.rows.map((row) => (
                    <Card
                      key={row.id}
                      theme={theme}
                      onPress={() => complete(row)}
                      onLongPress={() => setSheet({ kind: "actions", row })}
                      accessibilityLabel={`${row.title}${row.dueDate ? `, ${row.dueDate}` : ""}`}
                    >
                      <Text style={styles.icon} accessibilityElementsHidden>
                        {row.icon}
                      </Text>
                      <View style={styles.body}>
                        <Text
                          style={[
                            styles.title,
                            { color: theme.colors.text },
                            row.isCompleted ? styles.done : null,
                          ]}
                          numberOfLines={2}
                        >
                          {row.title}
                        </Text>
                        <Text style={[styles.meta, { color: theme.colors.muted }]}>
                          {row.dueDate ?? t("mobile_quest_no_due")}
                          {`  ·  ${t(DIFFICULTY_META[row.difficulty].labelKey)}`}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.check,
                          {
                            backgroundColor: row.isCompleted
                              ? theme.colors.primary
                              : theme.colors.bg3,
                            borderColor: theme.colors.border,
                          },
                        ]}
                        accessibilityElementsHidden
                      >
                        <Text
                          style={{
                            color: row.isCompleted ? theme.colors.onPrimary : theme.colors.muted,
                            fontSize: 16,
                            fontWeight: "800",
                          }}
                        >
                          ✔
                        </Text>
                      </View>
                    </Card>
                  ))}
                </Stack>
              </View>
            ))}
            <InlineNote theme={theme}>{t("mobile_long_press_hint")}</InlineNote>
          </>
        )}
      </ScreenShell>

      <BottomSheet
        theme={theme}
        visible={sheet.kind === "actions"}
        title={sheet.kind === "actions" ? sheet.row.title : ""}
        onClose={closeSheet}
      >
        {sheet.kind === "actions" ? (
          <ActionList theme={theme} actions={actionsFor(sheet.row)} />
        ) : null}
      </BottomSheet>

      <BottomSheet
        theme={theme}
        visible={sheet.kind === "form"}
        title={sheet.kind === "form" && sheet.editingId !== null ? t("dialog_edit_mode", { mode: t("page_quests_title") }) : t("dialog_add_todo")}
        onClose={closeSheet}
        footer={<Button theme={theme} label={t("dialog_save")} onPress={saveDraft} disabled={busy} />}
      >
        {sheet.kind === "form" ? (
          <>
            <TextField
              theme={theme}
              label={t("page_quests_title")}
              value={sheet.draft.title}
              onChangeText={(title) =>
                setSheet({ kind: "form", draft: { ...sheet.draft, title }, editingId: sheet.editingId })
              }
              placeholder={t("palette_action_add_todo")}
            />
            <TextField
              theme={theme}
              label={t("dialog_notes")}
              value={sheet.draft.notes}
              onChangeText={(notes) =>
                setSheet({ kind: "form", draft: { ...sheet.draft, notes }, editingId: sheet.editingId })
              }
              placeholder={t("dialog_notes_placeholder")}
              multiline
            />
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                {t("quest_due_date")}
              </Text>
              {/* React Native tidak punya pemilih tanggal bawaan; kolom teks
                  divalidasi `normalizeYmd`, dan pintasan dihitung dari tanggal
                  server — bukan `new Date()` perangkat. */}
              <ChipRow>
                {[0, 1, 7].map((offset) => {
                  const value = dateKey ? addDaysToYmd(dateKey, offset) : null;
                  if (!value) return null;
                  return (
                    <Chip
                      key={offset}
                      theme={theme}
                      label={offset === 0 ? t("food_today") : `+${offset}`}
                      selected={sheet.draft.dueDate === value}
                      onPress={() => {
                        setDateInput(value);
                        setSheet({
                          kind: "form",
                          draft: { ...sheet.draft, dueDate: value },
                          editingId: sheet.editingId,
                        });
                      }}
                    />
                  );
                })}
                <Chip
                  theme={theme}
                  label={t("mobile_quest_no_due")}
                  selected={sheet.draft.dueDate === null}
                  onPress={() => {
                    setDateInput("");
                    setSheet({
                      kind: "form",
                      draft: { ...sheet.draft, dueDate: null },
                      editingId: sheet.editingId,
                    });
                  }}
                />
              </ChipRow>
              <TextField
                theme={theme}
                label="YYYY-MM-DD"
                value={dateInput}
                onChangeText={(next) => {
                  setDateInput(next);
                  setSheet({
                    kind: "form",
                    draft: { ...sheet.draft, dueDate: normalizeYmd(next) },
                    editingId: sheet.editingId,
                  });
                }}
                placeholder="2026-10-13"
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                {t("dialog_priority")}
              </Text>
              <ChipRow>
                {DIFFICULTIES.map((value) => (
                  <Chip
                    key={value}
                    theme={theme}
                    label={t(DIFFICULTY_META[value].labelKey)}
                    selected={sheet.draft.difficulty === value}
                    onPress={() =>
                      setSheet({
                        kind: "form",
                        draft: { ...sheet.draft, difficulty: value },
                        editingId: sheet.editingId,
                      })
                    }
                  />
                ))}
              </ChipRow>
            </View>
          </>
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  progressCard: { flexDirection: "column", alignItems: "stretch", minHeight: 0 },
  progressInner: { gap: 6, paddingVertical: 2 },
  overdue: { fontSize: 12, fontWeight: "800" },
  count: { fontSize: 12, fontWeight: "800" },
  icon: { fontSize: 22 },
  body: { flex: 1, gap: 3 },
  title: { fontSize: 15, fontWeight: "700" },
  done: { textDecorationLine: "line-through" },
  meta: { fontSize: 12 },
  check: {
    alignItems: "center",
    borderRadius: 24,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: "700" },
});
