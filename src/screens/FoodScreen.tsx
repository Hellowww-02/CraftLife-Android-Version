/**
 * M08 wave 2 — layar Food (nutrisi + air).
 *
 * Data datang dari satu endpoint agregat (`/api/healthfood/day`) lewat
 * `useRemote`, bukan dari cache entitas: isinya ringkasan satu hari, bukan
 * baris yang bisa di-outbox. Konsekuensinya ditulis jujur di UI — saat
 * offline layar menampilkan data terakhir yang masih diingat dan memberi tahu
 * bahwa catatan baru belum bisa disimpan.
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
  ProgressBar,
  SectionHeader,
  TextField,
} from "../components/ui/primitives";
import { ScreenShell, Stack } from "../components/ui/ScreenShell";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { useRemote } from "../data/useRemote";
import {
  addWaterPayload,
  draftError as foodDraftError,
  emptyFoodLogDraft,
  foodLogPayload,
  MEAL_TYPES,
  MEAL_LABEL_KEY,
  nutritionBars,
  WATER_QUICK_AMOUNTS,
  type FoodLogDraft,
  type FoodLogRow,
} from "../features/food/model";
import { DAY_PACKAGE_PATH, parseDayPackage } from "../features/healthfood/dayPackage";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

type SheetMode =
  | { kind: "closed" }
  | { kind: "actions"; row: FoodLogRow }
  | { kind: "water-goal"; value: string }
  | { kind: "food"; draft: FoodLogDraft };

export default function FoodScreen() {
  const { theme } = useTheme();
  const day = useRemote(DAY_PACKAGE_PATH, parseDayPackage);
  const [sheet, setSheet] = useState<SheetMode>({ kind: "closed" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const closeSheet = useCallback(() => setSheet({ kind: "closed" }), []);

  /**
   * Semua tulisan layar ini lewat sini: satu tempat untuk memusatkan
   * penanganan "gagal jaringan" supaya tidak ada tombol yang tampak berhasil
   * padahal tidak.
   */
  const post = useCallback(
    async (path: string, body: Record<string, unknown>, quietOnFail = false) => {
      if (!day.app) {
        setNotice(t("web_api_offline"));
        return false;
      }
      setBusy(true);
      setNotice(null);
      try {
        await day.app.api.post(path, body);
        await day.reload();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!quietOnFail) setNotice(t("error_occurred", { error: message }));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [day],
  );

  const addWater = useCallback(
    (amountMl: number) => {
      const dateKey = day.data ? day.data.date : null;
      void post("/api/water", addWaterPayload(amountMl, dateKey));
    },
    [day.data, post],
  );

  const removeLog = useCallback(
    (row: FoodLogRow) => {
      closeSheet();
      void post(`/api/food/log/${row.id}/delete`, {});
    },
    [closeSheet, post],
  );

  const moveLog = useCallback(
    (row: FoodLogRow, mealType: string) => {
      closeSheet();
      void post("/api/food/log/move", { id: Number.parseInt(row.id, 10), mealType });
    },
    [closeSheet, post],
  );

  const saveWaterGoal = useCallback(() => {
    if (sheet.kind !== "water-goal") return;
    const targetMl = Number.parseInt(sheet.value, 10);
    if (!Number.isFinite(targetMl) || targetMl <= 0) {
      setNotice(t("error_occurred", { error: "ml" }));
      return;
    }
    closeSheet();
    void post("/api/water/goal", { targetMl });
  }, [closeSheet, post, sheet]);

  const saveFoodLog = useCallback(() => {
    if (sheet.kind !== "food") return;
    if (foodDraftError(sheet.draft)) {
      setNotice(t("food_name_empty"));
      return;
    }
    const dateKey = day.data ? day.data.date : null;
    closeSheet();
    void post("/api/food/log", foodLogPayload(sheet.draft, dateKey));
  }, [closeSheet, day.data, post, sheet]);

  const actionsFor = useCallback(
    (row: FoodLogRow): SheetAction[] => [
      ...MEAL_TYPES.filter((meal) => meal !== row.mealType).map((meal) => ({
        key: `move-${meal}`,
        label: t(MEAL_LABEL_KEY[meal]),
        icon: "↪",
        onPress: () => moveLog(row, meal),
      })),
      {
        key: "delete",
        label: t("task_delete_title"),
        icon: "🗑",
        destructive: true,
        onPress: () => removeLog(row),
      },
    ],
    [moveLog, removeLog],
  );

  const bars = useMemo(
    () => (day.data ? nutritionBars(day.data.nutrition, day.data.goals) : []),
    [day.data],
  );

  if (day.loading) {
    return <LoadingState theme={theme} title={t("nav_health_food")} message={t("loading")} />;
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

  const pkg = day.data;
  const offlineNotice = !day.online ? t("mobile_offline_banner") : notice;

  return (
    <>
      <ScreenShell
        theme={theme}
        title={t("nav_health_food")}
        subtitle={t("food_today")}
        onRefresh={() => void day.refresh()}
        refreshing={day.refreshing}
        offlineNotice={offlineNotice}
        fab={{
          icon: "+",
          label: t("food_log_group_title"),
          onPress: () => setSheet({ kind: "food", draft: emptyFoodLogDraft() }),
        }}
      >
        <Card theme={theme} style={styles.column}>
          <SectionHeader
            theme={theme}
            title={t("food_cal_stat")}
            trailing={
              <Text style={[styles.kcal, { color: theme.colors.muted }]}>
                {`${Math.round(pkg.nutrition.calories)} / ${Math.round(pkg.goals.calories)}${t("unit_kcal")}`}
              </Text>
            }
          />
          <Stack>
            {bars.map((bar) => (
              <ProgressBar
                key={bar.labelKey}
                theme={theme}
                percent={bar.percent}
                label={t(bar.labelKey)}
                detail={`${Math.round(bar.value)} / ${Math.round(bar.goal)}`}
              />
            ))}
          </Stack>
        </Card>

        <Card theme={theme} style={styles.column}>
          <SectionHeader
            theme={theme}
            title={t("food_tab_water")}
            trailing={
              <Button
                theme={theme}
                variant="ghost"
                label={t("food_water_set_goal")}
                onPress={() => setSheet({ kind: "water-goal", value: String(pkg.water.goalMl) })}
              />
            }
          />
          <ProgressBar
            theme={theme}
            percent={pkg.water.percent}
            label={t("health_water")}
            detail={`${pkg.water.totalMl} / ${pkg.water.goalMl}${t("unit_ml")}`}
          />
          <ChipRow>
            {WATER_QUICK_AMOUNTS.map((ml) => (
              <Chip
                key={ml}
                theme={theme}
                label={t(`food_water_add_${ml}`)}
                selected={pkg.water.goalReached}
                onPress={() => addWater(ml)}
              />
            ))}
          </ChipRow>
          {pkg.water.goalReached ? (
            <InlineNote theme={theme}>{t("water_goal_reached")}</InlineNote>
          ) : null}
          {pkg.water.logs.length === 0 ? (
            <Text style={[styles.muted, { color: theme.colors.muted }]}>{t("food_no_water_today")}</Text>
          ) : (
            pkg.water.logs.slice(-4).map((log) => (
              <KeyValueRow
                key={log.id}
                theme={theme}
                label={`${log.time !== "" ? `${log.time} · ` : ""}${log.amountMl}${t("unit_ml")}`}
                value=""
              />
            ))
          )}
        </Card>

        <Card theme={theme} style={styles.column}>
          <SectionHeader theme={theme} title={t("health_calories")} />
          <KeyValueRow
            theme={theme}
            label={t("stats_total_calories")}
            value={`${Math.round(pkg.nutrition.calories)}${t("unit_kcal")}`}
          />
          <KeyValueRow
            theme={theme}
            label={t("dashboard_sport_progress")}
            value={`-${pkg.caloriesBurned}${t("unit_kcal")}`}
          />
          <KeyValueRow
            theme={theme}
            label={t("food_net_calories")}
            value={`${pkg.netCalories}${t("unit_kcal")}`}
          />
        </Card>

        {pkg.foodLogs.length === 0 ? (
          <EmptyState
            theme={theme}
            title={t("food_log_group_title")}
            message={t("food_no_logs_today")}
            actionLabel={t("dialog_add")}
            onAction={() => setSheet({ kind: "food", draft: emptyFoodLogDraft() })}
          />
        ) : (
          <>
            <SectionHeader theme={theme} title={t("food_log_group_title")} />
            <Stack>
              {pkg.foodLogs.map((row) => (
                <Card
                  key={row.id}
                  theme={theme}
                  onLongPress={() => setSheet({ kind: "actions", row })}
                  accessibilityLabel={`${row.name}, ${row.calories}${t("unit_kcal")}`}
                >
                  <Text style={styles.icon} accessibilityElementsHidden>
                    {row.icon}
                  </Text>
                  <View style={styles.body}>
                    <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={2}>
                      {row.name}
                    </Text>
                    <Text style={[styles.muted, { color: theme.colors.muted }]}>
                      {`${t(MEAL_LABEL_KEY[row.mealType])} · ${row.calories}${t("unit_kcal")} · P${row.protein} K${row.carbs} L${row.fat}`}
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
        title={sheet.kind === "actions" ? sheet.row.name : ""}
        onClose={closeSheet}
      >
        {sheet.kind === "actions" ? (
          <ActionList theme={theme} actions={actionsFor(sheet.row)} />
        ) : null}
      </BottomSheet>

      <BottomSheet
        theme={theme}
        visible={sheet.kind === "water-goal"}
        title={t("food_water_goal_dialog_title")}
        onClose={closeSheet}
        footer={<Button theme={theme} label={t("dialog_save")} onPress={saveWaterGoal} disabled={busy} />}
      >
        {sheet.kind === "water-goal" ? (
          <TextField
            theme={theme}
            label={t("food_water_goal_dialog_label")}
            value={sheet.value}
            onChangeText={(value) => setSheet({ kind: "water-goal", value })}
            placeholder="2500"
          />
        ) : null}
      </BottomSheet>

      <BottomSheet
        theme={theme}
        visible={sheet.kind === "food"}
        title={t("food_log_group_title")}
        onClose={closeSheet}
        footer={<Button theme={theme} label={t("dialog_save")} onPress={saveFoodLog} disabled={busy} />}
      >
        {sheet.kind === "food" ? (
          <>
            <TextField
              theme={theme}
              label={t("food_name_label")}
              value={sheet.draft.name}
              onChangeText={(name) => setSheet({ kind: "food", draft: { ...sheet.draft, name } })}
              placeholder={t("ph_nama_makanan")}
            />
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                {t("food_meal_type")}
              </Text>
              <ChipRow>
                {MEAL_TYPES.map((meal) => (
                  <Chip
                    key={meal}
                    theme={theme}
                    label={t(MEAL_LABEL_KEY[meal])}
                    selected={sheet.draft.mealType === meal}
                    onPress={() =>
                      setSheet({ kind: "food", draft: { ...sheet.draft, mealType: meal } })
                    }
                  />
                ))}
              </ChipRow>
            </View>
            <TextField
              theme={theme}
              label={t("food_calories_label")}
              value={String(sheet.draft.calories)}
              onChangeText={(text) =>
                setSheet({
                  kind: "food",
                  draft: { ...sheet.draft, calories: Number.parseInt(text, 10) || 0 },
                })
              }
              placeholder="0"
            />
            <TextField
              theme={theme}
              label={t("food_protein_label")}
              value={String(sheet.draft.protein)}
              onChangeText={(text) =>
                setSheet({
                  kind: "food",
                  draft: { ...sheet.draft, protein: Number.parseFloat(text) || 0 },
                })
              }
              placeholder="0"
            />
            <TextField
              theme={theme}
              label={t("food_carbs_label")}
              value={String(sheet.draft.carbs)}
              onChangeText={(text) =>
                setSheet({
                  kind: "food",
                  draft: { ...sheet.draft, carbs: Number.parseFloat(text) || 0 },
                })
              }
              placeholder="0"
            />
            <TextField
              theme={theme}
              label={t("food_fat_label")}
              value={String(sheet.draft.fat)}
              onChangeText={(text) =>
                setSheet({
                  kind: "food",
                  draft: { ...sheet.draft, fat: Number.parseFloat(text) || 0 },
                })
              }
              placeholder="0"
            />
            <InlineNote theme={theme}>{t("mobile_food_custom_hint")}</InlineNote>
          </>
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: "stretch", flexDirection: "column", gap: 10, minHeight: 0 },
  icon: { fontSize: 22 },
  body: { flex: 1, gap: 3 },
  title: { fontSize: 15, fontWeight: "700" },
  muted: { fontSize: 12 },
  kcal: { fontSize: 12, fontWeight: "700" },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: "700" },
});
