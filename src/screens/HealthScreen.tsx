/**
 * M08 wave 2 — layar Health (langkah, tidur, berat, detak jantung, mood).
 *
 * Membaca dari paket harian yang sama dengan layar Food
 * (`/api/healthfood/day`) — backend memang mengirim `healthLog` dan
 * `healthGoals` di dalamnya, jadi tidak perlu panggilan kedua.
 *
 * Menyimpan lewat `POST /api/health`. Dua hal yang sengaja TIDAK dikirim
 * klien, karena backend menghitungnya sendiri:
 *   • `waterMl`  — total air berasal dari log air, bukan dari layar ini;
 *   • `netCalories` — dihitung dari ringkasan nutrisi dikurangi kalori terbakar.
 * Mengirim keduanya akan menimpa angka yang benar dengan tebakan klien.
 */

import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet } from "../components/ui/BottomSheet";
import {
  Button,
  Card,
  Chip,
  ChipRow,
  InlineNote,
  KeyValueRow,
  ProgressBar,
  SectionHeader,
  TextField,
} from "../components/ui/primitives";
import { ScreenShell, Stack, StatRow, StatTile } from "../components/ui/ScreenShell";
import { ErrorState, LoadingState } from "../components/states";
import { useRemote } from "../data/useRemote";
import {
  draftError as healthDraftError,
  draftFromLog,
  healthBars,
  healthPayload,
  MOODS,
  MOOD_ICON,
  MOOD_LABEL_KEY,
  parseOptionalNumber,
  type HealthDraft,
} from "../features/health/model";
import { DAY_PACKAGE_PATH, parseDayPackage } from "../features/healthfood/dayPackage";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

export default function HealthScreen() {
  const { theme } = useTheme();
  const day = useRemote(DAY_PACKAGE_PATH, parseDayPackage);
  const [draft, setDraft] = useState<HealthDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const closeSheet = useCallback(() => setDraft(null), []);

  const save = useCallback(() => {
    if (!draft || !day.app) {
      setNotice(t("web_api_offline"));
      return;
    }
    const problem = healthDraftError(draft);
    if (problem === "bad-sleep") {
      setNotice(t("mobile_sleep_range"));
      return;
    }
    if (problem === "bad-steps") {
      setNotice(t("msg_invalid_amount"));
      return;
    }
    const dateKey = day.data ? day.data.date : null;
    setBusy(true);
    setNotice(null);
    day.app.api
      .post("/api/health", healthPayload(draft, dateKey))
      .then(() => {
        setDraft(null);
        return day.reload();
      })
      .catch((err: unknown) =>
        setNotice(t("error_occurred", { error: err instanceof Error ? err.message : String(err) })),
      )
      .finally(() => setBusy(false));
  }, [day, draft]);

  const bars = useMemo(
    () => (day.data ? healthBars(day.data.healthLog, day.data.healthGoals) : []),
    [day.data],
  );

  if (day.loading) {
    return <LoadingState theme={theme} title={t("health_daily_targets")} message={t("loading")} />;
  }
  if (!day.data) {
    return (
      <ErrorState
        theme={theme}
        title={t("app_error_title")}
        message={day.error ?? t("web_api_offline")}
        onRetry={() => void day.refresh()}
        retryLabel={t("web_retry")}
      />
    );
  }

  const log = day.data.healthLog;
  const offlineNotice = !day.online ? t("mobile_offline_banner") : notice;

  return (
    <>
      <ScreenShell
        theme={theme}
        title={t("nav_health_food")}
        subtitle={t("health_daily_targets")}
        onRefresh={() => void day.refresh()}
        refreshing={day.refreshing}
        offlineNotice={offlineNotice}
        fab={{
          icon: "✎",
          label: t("mobile_health_edit_log"),
          onPress: () => setDraft(draftFromLog(log)),
        }}
      >
        <Card theme={theme} style={styles.column}>
          <SectionHeader theme={theme} title={t("health_daily_targets")} />
          <Stack>
            {bars.map((bar) => (
              <ProgressBar
                key={bar.labelKey}
                theme={theme}
                percent={bar.percent}
                label={t(bar.labelKey)}
                detail={bar.detail}
              />
            ))}
          </Stack>
        </Card>

        <StatRow>
          <StatTile
            theme={theme}
            label={t("health_mood")}
            value={`${MOOD_ICON[log.mood]} ${t(MOOD_LABEL_KEY[log.mood])}`}
            accent
          />
          <StatTile
            theme={theme}
            label={t("health_weight")}
            value={log.weightKg === null ? "—" : `${log.weightKg}${t("unit_kg")}`}
          />
        </StatRow>

        <Card theme={theme} style={styles.column}>
          <SectionHeader theme={theme} title={t("word_section_health")} />
          <KeyValueRow
            theme={theme}
            label={t("health_steps")}
            value={`${log.steps}${t("unit_steps")}`}
          />
          <KeyValueRow
            theme={theme}
            label={t("health_sleep")}
            value={`${log.sleepHours}${t("unit_hours")}`}
          />
          <KeyValueRow
            theme={theme}
            label={t("health_hr")}
            value={log.heartRate === null ? "—" : `${log.heartRate} bpm`}
          />
          <KeyValueRow
            theme={theme}
            label={t("health_water")}
            value={`${day.data.water.totalMl}${t("unit_ml")}`}
          />
          {log.notes !== "" ? (
            <InlineNote theme={theme}>{log.notes}</InlineNote>
          ) : null}
        </Card>

        <Card theme={theme} style={styles.column}>
          <SectionHeader theme={theme} title={t("health_calories")} />
          <KeyValueRow
            theme={theme}
            label={t("stats_total_calories")}
            value={`${Math.round(day.data.nutrition.calories)}${t("unit_kcal")}`}
          />
          <KeyValueRow
            theme={theme}
            label={t("dashboard_sport_progress")}
            value={`-${day.data.caloriesBurned}${t("unit_kcal")}`}
          />
          <KeyValueRow
            theme={theme}
            label={t("food_net_calories")}
            value={`${day.data.netCalories}${t("unit_kcal")}`}
          />
        </Card>

        <InlineNote theme={theme}>{t("mobile_health_edit_hint")}</InlineNote>
      </ScreenShell>

      <BottomSheet
        theme={theme}
        visible={draft !== null}
        title={t("mobile_health_edit_log")}
        onClose={closeSheet}
        footer={<Button theme={theme} label={t("dialog_save")} onPress={save} disabled={busy} />}
      >
        {draft ? (
          <>
            <TextField
              theme={theme}
              label={t("health_steps")}
              value={String(draft.steps)}
              onChangeText={(text) =>
                setDraft({ ...draft, steps: Number.parseInt(text, 10) || 0 })
              }
              placeholder={t("ph_steps")}
            />
            <TextField
              theme={theme}
              label={t("health_sleep")}
              value={String(draft.sleepHours)}
              onChangeText={(text) =>
                setDraft({ ...draft, sleepHours: Number.parseFloat(text.replace(",", ".")) || 0 })
              }
              placeholder={t("ph_sleep_h")}
            />
            <TextField
              theme={theme}
              label={t("health_weight")}
              value={draft.weightKg === null ? "" : String(draft.weightKg)}
              onChangeText={(text) => setDraft({ ...draft, weightKg: parseOptionalNumber(text) })}
              placeholder="—"
            />
            <TextField
              theme={theme}
              label={t("health_hr")}
              value={draft.heartRate === null ? "" : String(draft.heartRate)}
              onChangeText={(text) => setDraft({ ...draft, heartRate: parseOptionalNumber(text) })}
              placeholder="—"
            />
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>{t("health_mood")}</Text>
              <ChipRow>
                {MOODS.map((mood) => (
                  <Chip
                    key={mood}
                    theme={theme}
                    label={`${MOOD_ICON[mood]} ${t(MOOD_LABEL_KEY[mood])}`}
                    selected={draft.mood === mood}
                    onPress={() => setDraft({ ...draft, mood })}
                  />
                ))}
              </ChipRow>
            </View>
            <TextField
              theme={theme}
              label={t("dialog_notes")}
              value={draft.notes}
              onChangeText={(notes) => setDraft({ ...draft, notes })}
              placeholder={t("ph_notes")}
              multiline
            />
            <InlineNote theme={theme}>{t("mobile_health_server_computed")}</InlineNote>
          </>
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: "stretch", flexDirection: "column", gap: 10, minHeight: 0 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: "700" },
});
