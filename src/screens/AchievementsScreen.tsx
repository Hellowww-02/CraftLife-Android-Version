/**
 * M09c — layar Achievements: progres + klaim reward.
 *
 * Sejak M09b klaim mensyaratkan catatan unlock di server dan angka reward
 * dibaca server dari tabel definisi. Layar ini hanya menampilkan progres
 * yang dilaporkan server (`/api/achievements`) dan mengirim perintah klaim
 * ke route yang sudah ada — tidak ada perhitungan reward di ponsel.
 */

import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  Button,
  Card,
  InlineNote,
  ProgressBar,
} from "../components/ui/primitives";
import { ScreenShell, Stack } from "../components/ui/ScreenShell";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { errorMessage, isNetworkFailure } from "../data/httpApi";
import { useRemote } from "../data/useRemote";
import {
  parseAchievements,
  type AchievementRow,
} from "../features/rpg/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

export default function AchievementsScreen() {
  const { theme } = useTheme();
  const remote = useRemote("/api/achievements", parseAchievements);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const api = remote.app?.api;

  const claim = useCallback(
    async (row: AchievementRow) => {
      if (!api || busy) return;
      setBusy(true);
      setNotice(null);
      try {
        await api.post(`/api/achievements/${row.id}/claim`, {});
        setNotice(t("achievement_claimed_toast", {
          xp: row.xpReward,
          gold: row.goldReward,
        }));
        await remote.reload();
      } catch (error) {
        setNotice(
          isNetworkFailure(error)
            ? t("mobile_rpg_needs_server")
            : errorMessage(error),
        );
      } finally {
        setBusy(false);
      }
    },
    [api, busy, remote],
  );

  if (remote.loading && !remote.data) {
    return (
      <LoadingState
        theme={theme}
        title={t("nav_achievements")}
        message={t("loading")}
      />
    );
  }
  if (remote.error && !remote.data) {
    return (
      <ErrorState
        theme={theme}
        title={t("nav_achievements")}
        message={remote.error}
        retryLabel={t("web_retry")}
        onRetry={() => void remote.reload()}
      />
    );
  }

  const rows = remote.data ?? [];

  return (
    <ScreenShell
      theme={theme}
      title={t("nav_achievements")}
      subtitle={t("achievement_subtitle")}
      onRefresh={() => void remote.reload()}
      refreshing={remote.refreshing}
      offlineNotice={remote.online ? null : t("mobile_offline_banner")}
    >
      <Stack>
        {notice ? <InlineNote theme={theme}>{notice}</InlineNote> : null}
        {rows.length === 0 ? (
          <EmptyState
            theme={theme}
            title={t("nav_achievements")}
            message={t("achievement_empty")}
          />
        ) : (
          rows.map((row) => (
            <Card key={row.id} theme={theme}>
              <View style={styles.head}>
                <Text style={styles.icon}>{row.icon}</Text>
                <View style={styles.headText}>
                  <Text style={[styles.name, { color: theme.colors.text }]}>
                    {row.title}
                  </Text>
                  {row.desc ? (
                    <Text style={[styles.meta, { color: theme.colors.muted }]}>
                      {row.desc}
                    </Text>
                  ) : null}
                </View>
              </View>
              <ProgressBar
                theme={theme}
                percent={row.progressPct}
                label={t("achievement_progress")}
                detail={`${row.progressPct}%`}
              />
              <Text style={[styles.meta, { color: theme.colors.muted }]}>
                {t("achievement_reward")}: +{row.xpReward} XP · +
                {row.goldReward} G
              </Text>
              {row.claimable ? (
                <Button
                  theme={theme}
                  label={t("achievement_claim")}
                  disabled={busy}
                  onPress={() => void claim(row)}
                />
              ) : (
                <Text style={[styles.meta, { color: theme.colors.muted }]}>
                  {row.isClaimed
                    ? t("achievement_claimed")
                    : t("achievement_locked")}
                </Text>
              )}
            </Card>
          ))
        )}
      </Stack>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  headText: { flex: 1, gap: 2 },
  icon: { fontSize: 28 },
  name: { fontSize: 15, fontWeight: "700" },
  meta: { fontSize: 12 },
});
