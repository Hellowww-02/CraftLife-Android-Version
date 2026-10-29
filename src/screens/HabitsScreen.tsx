/**
 * M08 — layar Habits.
 *
 * Perbedaan yang disengaja dari desktop (brief: jangan menyalin tata letak
 * desktop):
 *   • satu baris = satu kartu yang bisa ditekan untuk menyelesaikan, bukan
 *     baris tabel dengan kolom;
 *   • tekan lama membuka sheet aksi (ubah / duplikat / hapus), bukan menu
 *     klik-kanan yang tidak ada di layar sentuh;
 *   • tarik ke bawah untuk menyegarkan;
 *   • formulir muncul sebagai bottom sheet, bukan dialog tengah.
 *
 * Yang TIDAK berubah: rute backend, nama field, dan arti datanya.
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
  applyHabitComplete,
  draftError,
  draftFromHabit,
  emptyHabitDraft,
  habitDirection,
  habitPayload,
  habitStreak,
  habitsProgress,
  toHabitRows,
  type HabitDraft,
  type HabitRow,
} from "../features/habits/model";
import { useTaskList } from "../features/tasks/useTaskList";
import { DIFFICULTIES, DIFFICULTY_META } from "../features/tasks/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

type SheetMode =
  | { kind: "closed" }
  | { kind: "actions"; row: HabitRow }
  | { kind: "form"; draft: HabitDraft; editingId: string | null };

export default function HabitsScreen() {
  const { theme } = useTheme();
  const list = useTaskList<HabitRow>("habits", toHabitRows);
  const [sheet, setSheet] = useState<SheetMode>({ kind: "closed" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const progress = useMemo(() => habitsProgress(list.rows), [list.rows]);

  const closeSheet = useCallback(() => setSheet({ kind: "closed" }), []);

  /** Jalankan satu tulisan, lalu baca ulang cache dan laporkan hasilnya. */
  const runWrite = useCallback(
    async (outcome: Promise<WriteOutcome>) => {
      setBusy(true);
      try {
        const result = await outcome;
        if (result.kind === "failed") {
          setNotice(t("error_occurred", { error: result.reason }));
        } else if (result.kind === "queued") {
          setNotice(t("mobile_saved_offline"));
        } else {
          setNotice(null);
        }
        await list.reload();
      } finally {
        setBusy(false);
      }
    },
    [list],
  );

  const complete = useCallback(
    (row: HabitRow) => {
      const positive = habitDirection(row) === "positive";
      if (!list.app) return;
      void runWrite(
        writeTask(
          { api: list.app.api, repo: list.app.repo },
          {
            path: `/api/habits/${row.id}/complete`,
            body: { positive },
            entityType: "habits",
            entityId: row.id,
            nextPayload: applyHabitComplete(row, positive),
            previousPayload: row,
          },
        ),
      );
    },
    [list, runWrite],
  );

  const remove = useCallback(
    (row: HabitRow) => {
      if (!list.app) return;
      closeSheet();
      void runWrite(
        writeTask(
          { api: list.app.api, repo: list.app.repo },
          {
            path: `/api/habits/${row.id}/delete`,
            body: {},
            entityType: "habits",
            entityId: row.id,
            nextPayload: null,
            previousPayload: row,
          },
        ),
      );
    },
    [closeSheet, list, runWrite],
  );

  const duplicate = useCallback(
    (row: HabitRow) => {
      if (!list.app) return;
      closeSheet();
      // Duplikat menghasilkan baris BERU dengan id dari server, jadi tidak bisa
      // ditulis ke cache secara optimistik. Setelah server menjawab, daftar
      // disegarkan supaya baris baru muncul dengan id yang benar.
      setBusy(true);
      list.app.api
        .post(`/api/habits/${row.id}/duplicate`, {})
        .then(() => list.refresh())
        .catch((err: unknown) =>
          setNotice(t("error_occurred", { error: err instanceof Error ? err.message : String(err) })),
        )
        .finally(() => setBusy(false));
    },
    [closeSheet, list],
  );

  const saveDraft = useCallback(() => {
    if (sheet.kind !== "form" || !list.app) return;
    if (draftError(sheet.draft)) {
      setNotice(t("error_occurred", { error: "empty" }));
      return;
    }
    const editingId = sheet.editingId;
    const body = habitPayload(sheet.draft);
    closeSheet();

    if (editingId === null) {
      // Membuat baru butuh id dari server; tanpa koneksi tidak ada id yang
      // bisa dipakai. Ini dikatakan terus terang, tidak dipalsukan.
      setBusy(true);
      list.app.api
        .post("/api/habits", body)
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
          path: `/api/habits/${editingId}/update`,
          body,
          entityType: "habits",
          entityId: editingId,
          nextPayload: previous ? { ...previous, ...body, id: editingId } : body,
          previousPayload: previous,
        },
      ),
    );
  }, [closeSheet, list, runWrite, sheet]);

  const actionsFor = useCallback(
    (row: HabitRow): SheetAction[] => [
      {
        key: "edit",
        label: t("habit_edit_habit"),
        icon: "✏️",
        onPress: () => setSheet({ kind: "form", draft: draftFromHabit(row), editingId: row.id }),
      },
      { key: "duplicate", label: t("habit_duplicate"), icon: "📋", onPress: () => duplicate(row) },
      { key: "delete", label: t("task_delete_title"), icon: "🗑", destructive: true, onPress: () => remove(row) },
    ],
    [duplicate, remove],
  );

  if (list.loading) {
    return <LoadingState theme={theme} title={t("page_habits_title")} message={t("loading")} />;
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
        title={t("page_habits_title")}
        subtitle={t("page_habits_subtitle")}
        onRefresh={() => void list.refresh()}
        refreshing={list.refreshing}
        offlineNotice={!list.online ? t("mobile_offline_banner") : notice}
        fab={{ icon: "+", label: t("dialog_add_habit"), onPress: () => setSheet({ kind: "form", draft: emptyHabitDraft(), editingId: null }) }}
      >
        <Card theme={theme} style={styles.progressCard}>
          <View style={styles.progressInner}>
            <ProgressBar
              theme={theme}
              percent={progress.percent}
              label={t("mobile_today_progress")}
              detail={`${progress.done}/${progress.total}`}
            />
          </View>
        </Card>

        {list.rows.length === 0 ? (
          <InlineNote theme={theme}>{t("task_empty_habit")}</InlineNote>
        ) : (
          <>
            <SectionHeader theme={theme} title={t("habit_all_habits")} />
            <Stack>
              {list.rows.map((row) => {
                const direction = habitDirection(row);
                const streak = habitStreak(row);
                return (
                  <Card
                    key={row.id}
                    theme={theme}
                    onPress={() => complete(row)}
                    onLongPress={() => setSheet({ kind: "actions", row })}
                    accessibilityLabel={`${row.title}, ${t("task_streak_days", { streak })}`}
                  >
                    <Text style={styles.icon} accessibilityElementsHidden>
                      {row.icon}
                    </Text>
                    <View style={styles.body}>
                      <Text
                        style={[
                          styles.title,
                          { color: theme.colors.text },
                          row.doneToday ? styles.done : null,
                        ]}
                        numberOfLines={2}
                      >
                        {row.title}
                      </Text>
                      <Text style={[styles.meta, { color: theme.colors.muted }]}>
                        {t(DIFFICULTY_META[row.difficulty].labelKey)}
                        {streak > 0
                          ? `  ·  ${t(direction === "negative" ? "task_fail_streak_days" : "task_streak_days", { streak })}`
                          : ""}
                        {row.doneToday ? `  ·  ${t("habit_done_today")}` : ""}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.check,
                        {
                          backgroundColor: row.doneToday
                            ? direction === "negative"
                              ? theme.colors.accent
                              : theme.colors.primary
                            : theme.colors.bg3,
                          borderColor: theme.colors.border,
                        },
                      ]}
                      accessibilityElementsHidden
                    >
                      <Text
                        style={{
                          color: row.doneToday
                            ? direction === "negative"
                              ? theme.colors.onAccent
                              : theme.colors.onPrimary
                            : theme.colors.muted,
                          fontSize: 16,
                          fontWeight: "800",
                        }}
                      >
                        {direction === "negative" ? "✗" : "✔"}
                      </Text>
                    </View>
                  </Card>
                );
              })}
            </Stack>
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
        title={
          sheet.kind === "form"
            ? sheet.editingId === null
              ? t("dialog_add_habit")
              : t("habit_edit_habit")
            : ""
        }
        onClose={closeSheet}
        footer={
          <Button theme={theme} label={t("dialog_save")} onPress={saveDraft} disabled={busy} />
        }
      >
        {sheet.kind === "form" ? (
          <>
            <TextField
              theme={theme}
              label={t("page_habits_title")}
              value={sheet.draft.title}
              onChangeText={(title) =>
                setSheet({ kind: "form", draft: { ...sheet.draft, title }, editingId: sheet.editingId })
              }
              placeholder={t("habit_create_first_habit")}
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
                {t("dialog_difficulty")}
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
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                {t("dialog_icon")}
              </Text>
              <ChipRow>
                {["⚔️", "💪", "📖", "🧘", "💧", "🏃"].map((icon) => (
                  <Chip
                    key={icon}
                    theme={theme}
                    label={icon}
                    selected={sheet.draft.icon === icon}
                    onPress={() =>
                      setSheet({
                        kind: "form",
                        draft: { ...sheet.draft, icon },
                        editingId: sheet.editingId,
                      })
                    }
                  />
                ))}
              </ChipRow>
            </View>
            <ChipRow>
              <Chip
                theme={theme}
                label={t("habit_good")}
                selected={sheet.draft.isPositive}
                onPress={() =>
                  setSheet({
                    kind: "form",
                    draft: { ...sheet.draft, isPositive: true, isNegative: false },
                    editingId: sheet.editingId,
                  })
                }
              />
              <Chip
                theme={theme}
                label={t("habit_bad")}
                selected={sheet.draft.isNegative}
                onPress={() =>
                  setSheet({
                    kind: "form",
                    draft: { ...sheet.draft, isPositive: false, isNegative: true },
                    editingId: sheet.editingId,
                  })
                }
              />
            </ChipRow>
          </>
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  progressCard: { flexDirection: "column", alignItems: "stretch", minHeight: 0 },
  progressInner: { paddingVertical: 2 },
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
