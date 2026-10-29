/**
 * M08 wave 2 — layar SportTrack.
 *
 * Dibangun seperti layar task Wave 1 (kartu + tekan lama + bottom sheet +
 * tarik-untuk-menyegarkan) supaya satu app terasa satu app.
 *
 * Yang khas sport dan tidak ada di Habits:
 *   • satu aktivitas punya DUA aksi bernilai: "Selesai" (poin sport) dan
 *     "Log Reps" (menggerakkan rank). Keduanya endpoint berbeda;
 *   • kartu menampilkan durasi, kalori, dan total reps, bukan cuma judul.
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
import { ScreenShell, Stack, StatRow, StatTile } from "../components/ui/ScreenShell";
import { ErrorState, LoadingState } from "../components/states";
import { writeTask, type WriteOutcome } from "../data/taskActions";
import {
  applySportComplete,
  draftError,
  emptySportDraft,
  repsPayload,
  sportPayload,
  sportProgress,
  SPORT_TYPES,
  SPORT_TYPE_ICON,
  sportTypeLabelKey,
  toSportRows,
  type SportDraft,
  type SportRow,
} from "../features/sport/model";
import { useTaskList } from "../features/tasks/useTaskList";
import { DIFFICULTIES, DIFFICULTY_META } from "../features/tasks/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

type SheetMode =
  | { kind: "closed" }
  | { kind: "actions"; row: SportRow }
  | { kind: "reps"; row: SportRow; reps: string; sets: string }
  | { kind: "form"; draft: SportDraft };

export default function SportScreen() {
  const { theme } = useTheme();
  const list = useTaskList<SportRow>("sport", toSportRows);
  const [sheet, setSheet] = useState<SheetMode>({ kind: "closed" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const progress = useMemo(() => sportProgress(list.rows), [list.rows]);
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
    (row: SportRow) => {
      if (!list.app) return;
      void runWrite(
        writeTask(
          { api: list.app.api, repo: list.app.repo },
          {
            path: `/api/sport/${row.id}/complete`,
            body: {},
            entityType: "sport",
            entityId: row.id,
            nextPayload: applySportComplete(row),
            previousPayload: row,
          },
        ),
      );
    },
    [list, runWrite],
  );

  const remove = useCallback(
    (row: SportRow) => {
      if (!list.app) return;
      closeSheet();
      void runWrite(
        writeTask(
          { api: list.app.api, repo: list.app.repo },
          {
            path: `/api/sport/${row.id}/delete`,
            body: {},
            entityType: "sport",
            entityId: row.id,
            nextPayload: null,
            previousPayload: row,
          },
        ),
      );
    },
    [closeSheet, list, runWrite],
  );

  const saveReps = useCallback(() => {
    if (sheet.kind !== "reps" || !list.app) return;
    const reps = Number.parseInt(sheet.reps, 10);
    const sets = Number.parseInt(sheet.sets, 10) || 1;
    if (!Number.isFinite(reps) || reps <= 0) {
      setNotice(t("error_occurred", { error: "reps" }));
      return;
    }
    const row = sheet.row;
    closeSheet();
    // Reps tidak mengubah baris aktivitas secara berarti selain totalReps,
    // jadi cache diperbarui lalu daftar disegarkan dari server.
    setBusy(true);
    list.app.api
      .post(`/api/sport/${row.id}/reps`, repsPayload(reps, sets))
      .then(() => list.refresh())
      .catch((err: unknown) =>
        setNotice(t("error_occurred", { error: err instanceof Error ? err.message : String(err) })),
      )
      .finally(() => setBusy(false));
  }, [closeSheet, list, sheet]);

  const saveDraft = useCallback(() => {
    if (sheet.kind !== "form" || !list.app) return;
    if (draftError(sheet.draft)) {
      setNotice(t("error_occurred", { error: "empty" }));
      return;
    }
    const body = sportPayload(sheet.draft);
    closeSheet();
    // Aktivitas baru butuh id dari server; tanpa koneksi tidak ada id yang
    // bisa dipakai, jadi pembuatan butuh jaringan (dijelaskan di UI).
    setBusy(true);
    list.app.api
      .post("/api/sport", body)
      .then(() => list.refresh())
      .catch((err: unknown) =>
        setNotice(t("error_occurred", { error: err instanceof Error ? err.message : String(err) })),
      )
      .finally(() => setBusy(false));
  }, [closeSheet, list, sheet]);

  const actionsFor = useCallback(
    (row: SportRow): SheetAction[] => [
      { key: "done", label: t("sport_btn_complete"), icon: "✔", onPress: () => { closeSheet(); complete(row); } },
      {
        key: "reps",
        label: t("sport_log_reps_btn"),
        icon: "💪",
        onPress: () => setSheet({ kind: "reps", row, reps: "", sets: "1" }),
      },
      { key: "delete", label: t("task_delete_title"), icon: "🗑", destructive: true, onPress: () => remove(row) },
    ],
    [closeSheet, complete, remove],
  );

  if (list.loading) {
    return <LoadingState theme={theme} title={t("page_sport_title")} message={t("loading")} />;
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
        title={t("page_sport_title")}
        subtitle={t("page_sport_subtitle")}
        onRefresh={() => void list.refresh()}
        refreshing={list.refreshing}
        offlineNotice={!list.online ? t("mobile_offline_banner") : notice}
        fab={{ icon: "+", label: t("sport_add_title"), onPress: () => setSheet({ kind: "form", draft: emptySportDraft() }) }}
      >
        <Card theme={theme} style={styles.columnCard}>
          <ProgressBar
            theme={theme}
            percent={progress.percent}
            label={t("mobile_today_progress")}
            detail={`${progress.done}/${progress.total}`}
          />
        </Card>

        <StatRow>
          <StatTile
            theme={theme}
            label={t("sport_cal_today")}
            value={`${progress.caloriesToday}${t("unit_kcal")}`}
            accent
          />
          <StatTile
            theme={theme}
            label={t("sport_duration")}
            value={`${progress.minutesToday}${t("unit_minutes")}`}
          />
        </StatRow>

        {list.rows.length === 0 ? (
          <InlineNote theme={theme}>{t("sport_empty")}</InlineNote>
        ) : (
          <>
            <SectionHeader theme={theme} title={t("sport_tab_all")} />
            <Stack>
              {list.rows.map((row) => (
                <Card
                  key={row.id}
                  theme={theme}
                  onPress={() => complete(row)}
                  onLongPress={() => setSheet({ kind: "actions", row })}
                  accessibilityLabel={`${row.title}, ${t(sportTypeLabelKey(row.sportType))}`}
                >
                  <Text style={styles.icon} accessibilityElementsHidden>
                    {row.icon}
                  </Text>
                  <View style={styles.body}>
                    <Text
                      style={[
                        styles.title,
                        { color: theme.colors.text },
                        row.done ? styles.done : null,
                      ]}
                      numberOfLines={2}
                    >
                      {row.title}
                    </Text>
                    <Text style={[styles.meta, { color: theme.colors.muted }]}>
                      {`${t(sportTypeLabelKey(row.sportType))} · ${row.durationMinutes}${t("unit_minutes")} · ${row.caloriesBurned}${t("unit_kcal")}`}
                      {row.totalReps > 0 ? ` · ${t("sport_reps_total_label", { n: row.totalReps })}` : ""}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.check,
                      {
                        backgroundColor: row.done ? theme.colors.primary : theme.colors.bg3,
                        borderColor: theme.colors.border,
                      },
                    ]}
                    accessibilityElementsHidden
                  >
                    <Text
                      style={{
                        color: row.done ? theme.colors.onPrimary : theme.colors.muted,
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
        visible={sheet.kind === "reps"}
        title={sheet.kind === "reps" ? t("sport_log_reps_title", { name: sheet.row.title }) : ""}
        onClose={closeSheet}
        footer={<Button theme={theme} label={t("dialog_save")} onPress={saveReps} disabled={busy} />}
      >
        {sheet.kind === "reps" ? (
          <>
            <TextField
              theme={theme}
              label={t("sport_log_reps_reps")}
              value={sheet.reps}
              onChangeText={(reps) => setSheet({ ...sheet, reps })}
              placeholder="12"
            />
            <TextField
              theme={theme}
              label={t("sport_log_reps_sets")}
              value={sheet.sets}
              onChangeText={(sets) => setSheet({ ...sheet, sets })}
              placeholder="3"
            />
            <InlineNote theme={theme}>{t("sport_log_reps_hint")}</InlineNote>
          </>
        ) : null}
      </BottomSheet>

      <BottomSheet
        theme={theme}
        visible={sheet.kind === "form"}
        title={t("sport_add_title")}
        onClose={closeSheet}
        footer={<Button theme={theme} label={t("dialog_save")} onPress={saveDraft} disabled={busy} />}
      >
        {sheet.kind === "form" ? (
          <>
            <TextField
              theme={theme}
              label={t("sport_activity_name")}
              value={sheet.draft.sportName}
              onChangeText={(sportName) => setSheet({ kind: "form", draft: { ...sheet.draft, sportName } })}
              placeholder={t("sport_activity_name")}
            />
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                {t("mobile_sport_type")}
              </Text>
              <ChipRow>
                {SPORT_TYPES.map((type) => (
                  <Chip
                    key={type}
                    theme={theme}
                    label={`${SPORT_TYPE_ICON[type] ?? "🏅"} ${t(sportTypeLabelKey(type))}`}
                    selected={sheet.draft.sportType === type}
                    onPress={() =>
                      setSheet({
                        kind: "form",
                        draft: {
                          ...sheet.draft,
                          sportType: type,
                          icon: SPORT_TYPE_ICON[type] ?? "🏅",
                        },
                      })
                    }
                  />
                ))}
              </ChipRow>
            </View>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>{t("sport_intensity")}</Text>
              <ChipRow>
                {DIFFICULTIES.filter((d) => d !== "trivial").map((value) => (
                  <Chip
                    key={value}
                    theme={theme}
                    label={t(DIFFICULTY_META[value].labelKey)}
                    selected={sheet.draft.difficulty === value}
                    onPress={() =>
                      setSheet({ kind: "form", draft: { ...sheet.draft, difficulty: value } })
                    }
                  />
                ))}
              </ChipRow>
            </View>
            <TextField
              theme={theme}
              label={t("sport_duration")}
              value={String(sheet.draft.durationMinutes)}
              onChangeText={(text) =>
                setSheet({
                  kind: "form",
                  draft: { ...sheet.draft, durationMinutes: Number.parseInt(text, 10) || 0 },
                })
              }
              placeholder="30"
            />
            <TextField
              theme={theme}
              label={t("food_calories_label")}
              value={String(sheet.draft.caloriesBurned)}
              onChangeText={(text) =>
                setSheet({
                  kind: "form",
                  draft: { ...sheet.draft, caloriesBurned: Number.parseInt(text, 10) || 0 },
                })
              }
              placeholder="0"
            />
            <TextField
              theme={theme}
              label={t("dialog_notes")}
              value={sheet.draft.notes}
              onChangeText={(notes) => setSheet({ kind: "form", draft: { ...sheet.draft, notes } })}
              placeholder={t("dialog_notes_placeholder")}
              multiline
            />
          </>
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  columnCard: { alignItems: "stretch", flexDirection: "column", gap: 10, minHeight: 0 },
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
