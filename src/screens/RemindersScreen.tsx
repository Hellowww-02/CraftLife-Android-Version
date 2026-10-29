/**
 * M08 wave 3 — layar Reminders.
 *
 * Dua hal yang membuat layar ini berbeda dari daftar biasa:
 *
 *  1. **Waktu memakai jam server.** "Sudah lewat" atau "15 menit lagi" dihitung
 *     dari `app.clock.nowDate()`, bukan `new Date()`. Jam ponsel bisa salah
 *     beberapa jam, dan pengingat yang berbunyi di waktu yang salah tidak ada
 *     gunanya.
 *  2. **Pengingat juga ditanam sebagai notifikasi lokal OS.** Setelah daftar
 *     dimuat, jadwal di AlarmManager disamakan ulang. Jadi pengingat tetap
 *     berbunyi walau aplikasi ditutup dan ponsel offline — push dari server
 *     tidak bisa menjanjikan itu.
 *
 * Daftar "sekarang" disegarkan tiap 30 detik supaya label relatif tidak
 * membeku. 30 detik, bukan 1 detik: presisi semenit sudah cukup untuk label
 * "x menit lagi", dan interval 1 detik hanya menguras baterai.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionList, BottomSheet, type SheetAction } from "../components/ui/BottomSheet";
import {
  Button,
  Card,
  Chip,
  ChipRow,
  InlineNote,
  SectionHeader,
  TextField,
} from "../components/ui/primitives";
import { ScreenShell, Stack, StatRow, StatTile } from "../components/ui/ScreenShell";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { writeTask, type WriteOutcome } from "../data/taskActions";
import {
  countsByState,
  draftError as reminderDraftError,
  draftFromRow,
  dueRows,
  emptyReminderDraft,
  formatReminderWhen,
  minutesUntil,
  REPEAT_LABEL_KEY,
  REPEAT_TYPES,
  relativeLabelKey,
  relativeParts,
  reminderCreatePayload,
  reminderState,
  reminderUpdatePayload,
  toReminderRows,
  toggleRepeatDay,
  WEEKDAY_LABEL_KEY,
  type ReminderDraft,
  type ReminderRow,
} from "../features/reminders/model";
import { syncReminders } from "../notifications/reminders";
import { useTaskList } from "../features/tasks/useTaskList";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

type SheetMode =
  | { kind: "closed" }
  | { kind: "actions"; row: ReminderRow }
  | { kind: "form"; draft: ReminderDraft };

const REFRESH_MS = 30_000;

export default function RemindersScreen() {
  const { theme } = useTheme();
  const list = useTaskList<ReminderRow>("reminders", toReminderRows);

  const [sheet, setSheet] = useState<SheetMode>({ kind: "closed" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [permission, setPermission] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // Jam server dibaca ulang tiap 30 detik. `nowMs` lokal hanya dipakai sebagai
  // pemicu render ulang; tanggalnya tetap berasal dari `clock.nowDate()`.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const serverNow = useMemo(() => {
    void now;
    return list.app ? list.app.clock.nowDate() : null;
  }, [list.app, now]);

  // Samakan jadwal notifikasi tiap kali daftar berubah.
  useEffect(() => {
    let alive = true;
    if (list.rows.length === 0) return;
    void syncReminders(list.rows, serverNow).then((result) => {
      if (alive) setPermission(result.permission);
    });
    return () => {
      alive = false;
    };
  }, [list.rows, serverNow]);

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

  const remove = useCallback(
    (row: ReminderRow) => {
      if (!list.app) return;
      closeSheet();
      void runWrite(
        writeTask(
          { api: list.app.api, repo: list.app.repo },
          {
            path: `/api/reminders/${row.id}/delete`,
            body: {},
            entityType: "reminders",
            entityId: row.id,
            nextPayload: null,
            previousPayload: row,
          },
        ),
      );
    },
    [closeSheet, list, runWrite],
  );

  const toggle = useCallback(
    (row: ReminderRow) => {
      if (!list.app) return;
      closeSheet();
      void runWrite(
        writeTask(
          { api: list.app.api, repo: list.app.repo },
          {
            path: `/api/reminders/${row.id}/toggle`,
            body: {},
            entityType: "reminders",
            entityId: row.id,
            nextPayload: { ...row, isActive: !row.isActive, triggered: false },
            previousPayload: row,
          },
        ),
      );
    },
    [closeSheet, list, runWrite],
  );

  const saveDraft = useCallback(() => {
    if (sheet.kind !== "form" || !list.app) return;
    const problem = reminderDraftError(sheet.draft);
    if (problem === "empty-title") {
      setNotice(t("reminders_title_required"));
      return;
    }
    if (problem !== null) {
      setNotice(t("reminders_invalid_datetime"));
      return;
    }
    const draft = sheet.draft;
    closeSheet();
    if (draft.id === null) {
      // Pengingat baru butuh id dari server sebelum bisa dijadwalkan di OS,
      // jadi pembuatannya memang membutuhkan jaringan.
      setBusy(true);
      list.app.api
        .post("/api/reminders", reminderCreatePayload(draft))
        .then(() => list.refresh())
        .catch((err: unknown) =>
          setNotice(t("error_occurred", { error: err instanceof Error ? err.message : String(err) })),
        )
        .finally(() => setBusy(false));
      return;
    }
    void runWrite(
      writeTask(
        { api: list.app.api, repo: list.app.repo },
        {
          path: `/api/reminders/${draft.id}/update`,
          body: reminderUpdatePayload(draft),
          entityType: "reminders",
          entityId: draft.id,
          nextPayload: null,
          previousPayload: list.rows.find((row) => row.id === draft.id) ?? null,
        },
      ),
    );
  }, [closeSheet, list, runWrite, sheet]);

  const actionsFor = useCallback(
    (row: ReminderRow): SheetAction[] => [
      {
        key: "toggle",
        label: t("reminders_toggle"),
        icon: row.isActive ? "🔕" : "🔔",
        onPress: () => toggle(row),
      },
      {
        key: "edit",
        label: t("reminders_edit"),
        icon: "✎",
        onPress: () => setSheet({ kind: "form", draft: draftFromRow(row) }),
      },
      {
        key: "delete",
        label: t("reminders_delete"),
        icon: "🗑",
        destructive: true,
        onPress: () => remove(row),
      },
    ],
    [remove, toggle],
  );

  const due = useMemo(() => dueRows(list.rows, serverNow), [list.rows, serverNow]);
  const counts = useMemo(() => countsByState(list.rows, serverNow), [list.rows, serverNow]);

  if (list.loading) {
    return <LoadingState theme={theme} title={t("reminders_title")} message={t("loading")} />;
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

  const renderRow = (row: ReminderRow) => {
    const state = reminderState(row, serverNow);
    const minutes = minutesUntil(row.datetime, serverNow);
    const parts = relativeParts(minutes);
    return (
      <Card
        key={row.id}
        theme={theme}
        onPress={() => toggle(row)}
        onLongPress={() => setSheet({ kind: "actions", row })}
        accessibilityLabel={`${row.title}, ${formatReminderWhen(row.datetime)}`}
      >
        <View style={styles.body}>
          <Text
            style={[
              styles.title,
              { color: state === "off" ? theme.colors.muted : theme.colors.text },
              state === "done" ? styles.done : null,
            ]}
            numberOfLines={2}
          >
            {row.title}
          </Text>
          <Text style={[styles.meta, { color: theme.colors.muted }]}>
            {formatReminderWhen(row.datetime)}
          </Text>
          {row.repeat !== "none" ? (
            <Text style={[styles.meta, { color: theme.colors.muted }]}>
              {t(REPEAT_LABEL_KEY[row.repeat])}
            </Text>
          ) : null}
          {row.description !== "" ? (
            <Text style={[styles.meta, { color: theme.colors.muted }]} numberOfLines={2}>
              {row.description}
            </Text>
          ) : null}
        </View>
        <Text
          style={[
            styles.when,
            {
              color:
                state === "due"
                  ? theme.colors.accent3
                  : state === "off"
                    ? theme.colors.muted
                    : theme.colors.accent2,
            },
          ]}
        >
          {t(relativeLabelKey(minutes), { n: parts.value })}
        </Text>
      </Card>
    );
  };

  return (
    <>
      <ScreenShell
        theme={theme}
        title={t("reminders_title")}
        subtitle={t("mobile_reminder_notification_hint")}
        onRefresh={() => void list.refresh()}
        refreshing={list.refreshing}
        offlineNotice={!list.online ? t("mobile_offline_banner") : notice}
        fab={{
          icon: "+",
          label: t("reminders_add"),
          onPress: () =>
            setSheet({
              kind: "form",
              draft: emptyReminderDraft(
                serverNow
                  ? `${serverNow.getFullYear()}-${String(serverNow.getMonth() + 1).padStart(2, "0")}-${String(serverNow.getDate()).padStart(2, "0")}`
                  : "",
              ),
            }),
        }}
      >
        <StatRow>
          <StatTile theme={theme} label={t("mobile_reminder_upcoming")} value={String(counts.upcoming)} />
          <StatTile theme={theme} label={t("mobile_reminder_due")} value={String(counts.due)} accent={counts.due > 0} />
          <StatTile theme={theme} label={t("mobile_reminder_off")} value={String(counts.off)} />
        </StatRow>

        {permission === "denied" ? (
          <InlineNote theme={theme}>{t("mobile_reminder_permission_denied")}</InlineNote>
        ) : null}

        {due.length > 0 ? (
          <>
            <SectionHeader theme={theme} title={t("mobile_reminder_due")} />
            <Stack>{due.map(renderRow)}</Stack>
          </>
        ) : null}

        {list.rows.length === 0 ? (
          <EmptyState
            theme={theme}
            title={t("reminders_title")}
            message={t("reminders_empty")}
            actionLabel={t("reminders_add")}
            onAction={() => setSheet({ kind: "form", draft: emptyReminderDraft("") })}
          />
        ) : (
          <>
            <SectionHeader theme={theme} title={t("reminders_title")} />
            <Stack>{list.rows.map(renderRow)}</Stack>
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
        title={sheet.kind === "form" && sheet.draft.id ? t("reminders_edit_title") : t("reminders_add_title")}
        onClose={closeSheet}
        footer={<Button theme={theme} label={t("btn_save")} onPress={saveDraft} disabled={busy} />}
      >
        {sheet.kind === "form" ? (
          <>
            <TextField
              theme={theme}
              label={t("reminders_title_ph")}
              value={sheet.draft.title}
              onChangeText={(title) => setSheet({ kind: "form", draft: { ...sheet.draft, title } })}
              placeholder={t("reminders_title_ph")}
            />
            <TextField
              theme={theme}
              label={t("reminders_desc_ph")}
              value={sheet.draft.description}
              onChangeText={(description) =>
                setSheet({ kind: "form", draft: { ...sheet.draft, description } })
              }
              placeholder={t("reminders_desc_ph")}
              multiline
            />
            <TextField
              theme={theme}
              label={t("reminders_datetime_label")}
              value={`${sheet.draft.date} ${sheet.draft.time}`}
              onChangeText={(text) => {
                const [date = "", time = ""] = text.trim().split(/[ T]+/);
                setSheet({ kind: "form", draft: { ...sheet.draft, date, time } });
              }}
              placeholder="2026-10-13 08:00"
            />
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                {t("reminders_repeat_label")}
              </Text>
              <ChipRow>
                {REPEAT_TYPES.map((repeat) => (
                  <Chip
                    key={repeat}
                    theme={theme}
                    label={t(REPEAT_LABEL_KEY[repeat])}
                    selected={sheet.draft.repeat === repeat}
                    onPress={() => setSheet({ kind: "form", draft: { ...sheet.draft, repeat } })}
                  />
                ))}
              </ChipRow>
              {sheet.draft.repeat === "custom" ? (
                <ChipRow>
                  {WEEKDAY_LABEL_KEY.map((labelKey, index) => (
                    <Chip
                      key={labelKey}
                      theme={theme}
                      label={t(labelKey)}
                      selected={
                        sheet.draft.repeatDays
                          .split(",")
                          .map((v) => Number.parseInt(v, 10))
                          .includes(index)
                      }
                      onPress={() =>
                        setSheet({
                          kind: "form",
                          draft: {
                            ...sheet.draft,
                            repeatDays: toggleRepeatDay(sheet.draft.repeatDays, index),
                          },
                        })
                      }
                    />
                  ))}
                </ChipRow>
              ) : null}
              {sheet.draft.repeat === "yearly" ? (
                <InlineNote theme={theme}>{t("reminders_repeat_yearly_hint")}</InlineNote>
              ) : null}
              {sheet.draft.repeat === "custom" && sheet.draft.repeatDays === "" ? (
                <InlineNote theme={theme}>{t("reminders_custom_days_required")}</InlineNote>
              ) : null}
            </View>
          </>
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: 3 },
  title: { fontSize: 15, fontWeight: "700" },
  done: { textDecorationLine: "line-through" },
  meta: { fontSize: 12 },
  when: { fontSize: 12, fontWeight: "800", marginLeft: 8 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: "700" },
});
