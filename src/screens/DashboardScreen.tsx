/**
 * M08 — layar Dashboard (tab Beranda).
 *
 * Sumber data: `/api/me` + `/api/dashboard/summary`. Keduanya ringkasan, bukan
 * entitas yang di-outbox, jadi dibaca langsung dari server; kalau offline,
 * ringkasan terakhir yang masih ada di memori ditampilkan dengan penanda
 * offline. Tidak ada angka yang dikarang saat jaringan putus.
 *
 * Yang sengaja TIDAK dibawa dari desktop: grafik korelasi tidur↔produktivitas
 * (butuh lebar supaya terbaca) dan grid widget yang bisa diatur (P5 dashboard
 * widgets adalah fitur desktop; menyalinnya ke layar sempit menghasilkan kartu
 * sebesar prangko).
 */

import { useCallback, useEffect, useState } from "react";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card, InlineNote, ProgressBar } from "../components/ui/primitives";
import { ScreenShell, Stack, StatRow, StatTile } from "../components/ui/ScreenShell";
import { ErrorState, LoadingState } from "../components/states";
import { getAppData, resolveLocalUserId } from "../data/appData";
import { loadRemote } from "../data/taskActions";
import { loadPersistedUser } from "../auth/session";
import {
  toCalorieInfo,
  toDashboardStats,
  toHealthSummary,
  toInsightLines,
  toRankInfo,
  toRecentLog,
  toTodayProgress,
  toUserSummary,
} from "../features/dashboard/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

interface DashboardData {
  user: ReturnType<typeof toUserSummary>;
  rank: ReturnType<typeof toRankInfo>;
  stats: ReturnType<typeof toDashboardStats>;
  today: ReturnType<typeof toTodayProgress>;
  calories: ReturnType<typeof toCalorieInfo>;
  health: ReturnType<typeof toHealthSummary>;
  insights: ReturnType<typeof toInsightLines>;
  activity: ReturnType<typeof toRecentLog>;
}

export default function DashboardScreen() {
  const { theme } = useTheme();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "pull") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const userId = await resolveLocalUserId(undefined, loadPersistedUser);
      const app = await getAppData(userId);
      await app.clock.refresh();
      const [me, summary] = await Promise.all([
        loadRemote<{ user?: unknown }>(app.api, "/api/me"),
        loadRemote<Record<string, unknown>>(app.api, "/api/dashboard/summary"),
      ]);
      const user = toUserSummary(me.data?.user);
      const body = summary.data ?? {};
      setData({
        user,
        rank: toRankInfo(body.rank),
        stats: toDashboardStats(body.stats),
        today: toTodayProgress(body.stats),
        calories: toCalorieInfo(body),
        health: toHealthSummary(body.healthSummary),
        insights: toInsightLines(body.insights),
        activity: toRecentLog(body.recentLog),
      });
      setOnline(me.online && summary.online);
      setError(summary.error ?? me.error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  if (loading && !data) {
    return <LoadingState theme={theme} title={t("nav_dashboard")} message={t("loading")} />;
  }
  if (!data) {
    return (
      <ErrorState
        theme={theme}
        title={t("app_error_title")}
        message={error ?? ""}
        onRetry={() => void load("initial")}
        retryLabel={t("web_retry")}
      />
    );
  }

  const { user, rank, stats, today, calories, health, insights, activity } = data;

  return (
    <ScreenShell
      theme={theme}
      title={user ? t("dashboard_greeting", { name: user.displayName }) : t("nav_dashboard")}
      subtitle={rank ? t(rank.descKey) : undefined}
      onRefresh={() => void load("pull")}
      refreshing={refreshing}
      offlineNotice={!online ? t("mobile_offline_banner") : null}
      footer={
        <Text style={[styles.footer, { color: theme.colors.muted }]}>{t("dashboard_footer")}</Text>
      }
    >
      {rank ? (
        <Card theme={theme} style={styles.columnCard}>
          <View style={styles.rankRow}>
            <Text style={styles.rankIcon} accessibilityElementsHidden>
              {rank.icon}
            </Text>
            <View style={styles.grow}>
              <Text style={[styles.rankName, { color: theme.colors.text }]}>{t(rank.nameKey)}</Text>
              <Text style={[styles.rankScore, { color: theme.colors.muted }]}>
                {t("rank_footer_progress", { score: rank.score, max: rank.maxScore })}
              </Text>
            </View>
          </View>
          <ProgressBar theme={theme} percent={rank.percent} />
        </Card>
      ) : null}

      {user ? (
        <Card theme={theme} style={styles.columnCard}>
          <ProgressBar
            theme={theme}
            percent={Math.round((user.xp / Math.max(1, user.xpToNextLevel)) * 100)}
            label={`${t("dashboard_level")} ${user.level}`}
            detail={`${user.xp}/${user.xpToNextLevel}`}
          />
          <View style={styles.bars}>
            <ProgressBar
              theme={theme}
              percent={Math.round((user.hp / Math.max(1, user.maxHp)) * 100)}
              label={t("dashboard_hp")}
              detail={`${user.hp}/${user.maxHp}`}
              color={theme.colors.accent}
            />
            <ProgressBar
              theme={theme}
              percent={Math.round((user.mp / Math.max(1, user.maxMp)) * 100)}
              label={t("dashboard_mp")}
              detail={`${user.mp}/${user.maxMp}`}
              color={theme.colors.accent2}
            />
          </View>
        </Card>
      ) : null}

      <Text style={[styles.section, { color: theme.colors.muted }]}>
        {t("mobile_today_progress")}
      </Text>
      <Card theme={theme} style={styles.columnCard}>
        {today.map((row) => (
          <ProgressBar
            key={row.labelKey}
            theme={theme}
            percent={row.percent}
            label={t(row.labelKey)}
            detail={`${row.done}/${row.total}`}
          />
        ))}
      </Card>

      <StatRow>
        <StatTile theme={theme} label={t("dashboard_gold")} value={String(user?.gold ?? 0)} accent />
        <StatTile theme={theme} label={t("dashboard_streak")} value={String(stats.maxStreak)} />
        <StatTile
          theme={theme}
          label={t("dashboard_boss_killed")}
          value={String(stats.bossesKilled)}
        />
      </StatRow>

      <Card theme={theme} style={styles.columnCard}>
        <ProgressBar
          theme={theme}
          percent={calories.percent}
          label={t("dashboard_calories")}
          detail={`${calories.today}/${calories.goal}`}
        />
      </Card>

      {health ? (
        <>
          <Text style={[styles.section, { color: theme.colors.muted }]}>
            {t("dashboard_health_summary")}
          </Text>
          <StatRow>
            <StatTile theme={theme} label={t("dashboard_avg_steps")} value={String(health.avgSteps)} />
            <StatTile theme={theme} label={t("dashboard_avg_sleep")} value={`${health.avgSleep}h`} />
            <StatTile theme={theme} label={t("dashboard_days_recorded")} value={String(health.daysRecorded)} />
          </StatRow>
        </>
      ) : null}

      <Text style={[styles.section, { color: theme.colors.muted }]}>{t("insights_title")}</Text>
      {insights.length === 0 ? (
        <InlineNote theme={theme}>{t("insights_no_data")}</InlineNote>
      ) : (
        <Card theme={theme} style={styles.columnCard}>
          {insights.map((line) => (
            <Text key={line.key} style={[styles.line, { color: theme.colors.text }]}>
              {t(line.key, line.params)}
            </Text>
          ))}
        </Card>
      )}

      <Text style={[styles.section, { color: theme.colors.muted }]}>
        {t("dashboard_recent_activity")}
      </Text>
      {activity.length === 0 ? (
        <InlineNote theme={theme}>{t("dashboard_no_activity")}</InlineNote>
      ) : (
        <Stack>
          {activity.map((entry, index) => (
            <Card key={`${entry.time}-${index}`} theme={theme} style={styles.activityCard}>
              <Text style={[styles.time, { color: theme.colors.muted }]}>{entry.time}</Text>
              <View style={styles.grow}>
                <Text style={[styles.line, { color: theme.colors.text }]} numberOfLines={1}>
                  {entry.action}
                </Text>
                {entry.detail ? (
                  <Text style={[styles.meta, { color: theme.colors.muted }]} numberOfLines={1}>
                    {entry.detail}
                  </Text>
                ) : null}
              </View>
            </Card>
          ))}
        </Stack>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  columnCard: { alignItems: "stretch", flexDirection: "column", gap: 10, minHeight: 0 },
  bars: { gap: 8 },
  rankRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  rankIcon: { fontSize: 30 },
  rankName: { fontSize: 17, fontWeight: "800" },
  rankScore: { fontSize: 12 },
  grow: { flex: 1 },
  section: { fontSize: 12, fontWeight: "800", letterSpacing: 0.6, marginTop: 10, textTransform: "uppercase" },
  line: { fontSize: 14, lineHeight: 20 },
  meta: { fontSize: 12 },
  time: { fontSize: 12, fontWeight: "800", width: 44 },
  activityCard: { minHeight: 0, paddingVertical: 10 },
  footer: { fontSize: 12, marginTop: 18, textAlign: "center" },
});
