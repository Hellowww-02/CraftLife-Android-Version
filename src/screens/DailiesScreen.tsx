/**
 * M08 — layar Dailies.
 *
 * Yang membedakan dari Habits: daily punya JADWAL (hari pengulangan) dan bisa
 * GAGAL atau DIBEKUKAN. Ketiganya aksi nyata di backend
 * (`/api/dailies/:id/{complete,fail,freeze}`), jadi ketiganya ada di UI — bukan
 * disederhanakan jadi satu tombol centang.
 *
 * "Jatuh tempo hari ini" dihitung dari jam SERVER (`useTaskList.dateKey`),
 * bukan jam perangkat. Lihat komentar panjang di features/dailies/model.ts.
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
  applyDailyComplete,
  dailyPayload,
  dailiesForToday,
  dailiesProgress,
  draftError,
  draftFromDaily,
  emptyDailyDraft,
  isEveryDay,
  toDailyRows,
  type DailyDraft,
  type DailyRow,
} from "../features/dailies/model";
import { useTaskList } from "../features/tasks/useTaskList";
import { DIFFICULTIES, DIFFICULTY_META } from "../features/tasks/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

/** Label pendek hari, konvensi JS getDay: 0 = Minggu. */
const DAY_LABELS: Record<number, string> = {
  0: "Min",
  1: "Sen",
  2: "Sel",
  3: "Rab",
  4: "Kam",
  5: "Jum",
  6: "Sab",
};

type SheetMode =
  | { kind: "closed" }
  | { kind: "actions"; row: DailyRow }
  | { kind: "form"; draft: DailyDraft; editingId: string | null };

export default function DailiesScreen() {
  const { theme } = useTheme();
  const list = useTaskList<DailyRow>("dailies", toDailyRows);
  const [sheet, setSheet] = useState<SheetMode>({ kind: "closed" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const dateKey = list.dateKey;
  const progress = useMemo(() => dailiesProgress(list.rows, dateKey), [dateKey, list.rows]);
  const visible = useMemo(
    () => (showAll ? list.rows : dailiesForToday(list.rows, dateKey)),
    [dateKey, list.rows, showAll],
  );

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

  const act = useCallback(
    (row: DailyRow, action: "complete" | "fail" | "freeze") => {
      if (!list.app) return;
      closeSheet();
      const next =
        action === "complete"
          ? applyDailyComplete(row)
          : action === "fail"
            ? { ...row, isCompletedToday: false, streak: 0 }
            : { ...row, isFrozen: true };
      void runWrite(
        writeTask(
          { api: list.app.api, repo: list.app.repo },
          {
            path: `/api/dailies/${row.id}/${action}`,
            body: {},
            entityType: "dailies",
            entityId: row.id,
            nextPayload: next,
            previousPayload: row,
          },
        ),
      );
    },
    [closeSheet, list, runWrite],
  );

  const remove = useCallback(
    (row: DailyRow) => {
      if (!list.app) return;
      closeSheet();
      void runWrite(
        writeTask(
          { api: list.app.api, repo: list.app.repo },
          {
            path: `/api/dailies/${row.id}/delete`,
            body: {},
            entityType: "dailies",
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
    const body = dailyPayload(sheet.draft);
    closeSheet();

    if (editingId === null) {
      setBusy(true);
      list.app.api
        .post("/api/dailies", body)
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
          path: `/api/dailies/${editingId}/update`,
          body,
          entityType: "dailies",
          entityId: editingId,
          nextPayload: previous ? { ...previous, ...body, id: editingId } : body,
          previousPayload: previous,
        },
      ),
    );
  }, [closeSheet, list, runWrite, sheet]);

  const actionsFor = useCallback(
    (row: DailyRow): SheetAction[] => [
      { key: "done", label: t("task_btn_done"), icon: "✔", onPress: () => act(row, "complete") },
      { key: "fail", label: t("task_btn_fail"), icon: "✗", onPress: () => act(row, "fail") },
      { key: "freeze", label: t("task_daily_freeze_title"), icon: "❄️", onPress: () => act(row, "freeze") },
      {
        key: "edit",
        label: t("daily_edit_daily"),
        icon: "✏️",
        onPress: () => setSheet({ kind: "form", draft: draftFromDaily(row), editingId: row.id }),
      },
      { key: "delete", label: t("task_delete_title"), icon: "🗑", destructive: true, onPress: () => remove(row) },
    ],
    [act, remove],
  );

  if (list.loading) {
    return <LoadingState theme={theme} title={t("page_dailies_title")} message={t("loading")} />;
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
        title={t("page_dailies_title")}
        subtitle={
          dateKey === null
            ? // Tanpa jam server, jadwal harian tidak bisa dipastikan. Dikatakan
              // terus terang daripada menampilkan rutinitas yang mungkin salah.
              t("cloud_sync_status_never")
            : t("daily_repeat_days")
        }
        onRefresh={() => void list.refresh()}
        refreshing={list.refreshing}
        offlineNotice={!list.online ? t("mobile_offline_banner") : notice}
        fab={{
          icon: "+",
          label: t("daily_new_daily"),
          onPress: () => setSheet({ kind: "form", draft: emptyDailyDraft(), editingId: null }),
        }}
      >
        <Card theme={theme} style={styles.progressCard}>
          <View style={styles.progressInner}>
            <ProgressBar
              theme={theme}
              percent={progress.percent}
              label={t("mobile_today_progress")}
              detail={`${progress.done}/${progress.due}`}
            />
          </View>
        </Card>

        <ChipRow>
          <Chip
            theme={theme}
            label={t("stats_daily_today")}
            selected={!showAll}
            onPress={() => setShowAll(false)}
          />
          <Chip
            theme={theme}
            label={t("daily_all_dailies")}
            selected={showAll}
            onPress={() => setShowAll(true)}
          />
        </ChipRow>

        {visible.length === 0 ? (
          <InlineNote theme={theme}>
            {list.rows.length === 0 ? t("task_empty_daily") : t("recur_not_today")}
          </InlineNote>
        ) : (
          <>
            <SectionHeader
              theme={theme}
              title={showAll ? t("daily_all_dailies") : t("stats_daily_today")}
            />
            <Stack>
              {visible.map((row) => (
                <Card
                  key={row.id}
                  theme={theme}
                  onPress={() => act(row, "complete")}
                  onLongPress={() => setSheet({ kind: "actions", row })}
                  accessibilityLabel={`${row.title}, ${t("task_streak_days", { streak: row.streak })}`}
                >
                  <Text style={styles.icon} accessibilityElementsHidden>
                    {row.icon}
                  </Text>
                  <View style={styles.body}>
                    <Text
                      style={[
                        styles.title,
                        { color: theme.colors.text },
                        row.isCompletedToday ? styles.done : null,
                      ]}
                      numberOfLines={2}
                    >
                      {row.title}
                    </Text>
                    <Text style={[styles.meta, { color: theme.colors.muted }]}>
                      {isEveryDay(row) ? t("mobile_repeat_everyday") : row.repeatDays.map((d) => DAY_LABELS[d] ?? "").join(" ")}
                      {row.streak > 0 ? `  ·  ${t("task_streak_days", { streak: row.streak })}` : ""}
                      {row.isFrozen ? `  ·  ${t("daily_frozen")}` : ""}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.check,
                      {
                        backgroundColor: row.isCompletedToday
                          ? theme.colors.primary
                          : theme.colors.bg3,
                        borderColor: theme.colors.border,
                      },
                    ]}
                    accessibilityElementsHidden
                  >
                    <Text
                      style={{
                        color: row.isCompletedToday ? theme.colors.onPrimary : theme.colors.muted,
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
        title={sheet.kind === "form" && sheet.editingId !== null ? t("daily_edit_daily") : t("daily_new_daily")}
        onClose={closeSheet}
        footer={<Button theme={theme} label={t("dialog_save")} onPress={saveDraft} disabled={busy} />}
      >
        {sheet.kind === "form" ? (
          <>
            <TextField
              theme={theme}
              label={t("page_dailies_title")}
              value={sheet.draft.title}
              onChangeText={(title) =>
                setSheet({ kind: "form", draft: { ...sheet.draft, title }, editingId: sheet.editingId })
              }
              placeholder={t("daily_new_daily")}
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
                {t("daily_repeat_days")}
              </Text>
              <ChipRow>
                {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                  const selected = sheet.draft.repeatDays.includes(day);
                  return (
                    <Chip
                      key={day}
                      theme={theme}
                      label={DAY_LABELS[day] ?? ""}
                      selected={selected}
                      onPress={() =>
                        setSheet({
                          kind: "form",
                          draft: {
                            ...sheet.draft,
                            repeatDays: selected
                              ? sheet.draft.repeatDays.filter((d) => d !== day)
                              : [...sheet.draft.repeatDays, day],
                          },
                          editingId: sheet.editingId,
                        })
                      }
                    />
                  );
                })}
              </ChipRow>
            </View>
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
