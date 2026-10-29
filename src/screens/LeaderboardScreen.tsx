/**
 * M10 — layar Leaderboard: peringkat lokal + cloud.
 *
 * Peringkat lokal dibaca dari `/api/leaderboard` (snapshot pengguna
 * desktop ini); mode cloud memakai `/api/cloud/leaderboard` yang hanya
 * berisi data bila akun tertaut Supabase. Bila belum tertaut, layar
 * mengatakannya apa adanya — bukan menampilkan peringkat karangan.
 */

import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card, Chip, ChipRow, InlineNote } from "../components/ui/primitives";
import { ScreenShell, Stack } from "../components/ui/ScreenShell";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { useRemote } from "../data/useRemote";
import { parseLeaderboard } from "../features/social/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

type Mode = "local" | "cloud_productivity" | "cloud_guild";

export default function LeaderboardScreen() {
  const { theme } = useTheme();
  const [mode, setMode] = useState<Mode>("local");
  const path =
    mode === "local"
      ? "/api/leaderboard"
      : `/api/cloud/leaderboard?mode=${mode}`;
  const remote = useRemote(path, parseLeaderboard);

  if (remote.loading && !remote.data) {
    return (
      <LoadingState theme={theme} title={t("nav_leaderboard")} message={t("loading")} />
    );
  }
  if (remote.error && !remote.data) {
    return (
      <ErrorState
        theme={theme}
        title={t("nav_leaderboard")}
        message={remote.error}
        retryLabel={t("web_retry")}
        onRetry={() => void remote.reload()}
      />
    );
  }

  const rows = remote.data?.rows ?? [];
  const cloudUnlinked = mode !== "local" && remote.data && !remote.data.linked;

  return (
    <ScreenShell
      theme={theme}
      title={t("nav_leaderboard")}
      onRefresh={() => void remote.reload()}
      refreshing={remote.refreshing}
      offlineNotice={remote.online ? null : t("mobile_offline_banner")}
    >
      <Stack>
        <ChipRow>
          <Chip
            theme={theme}
            label={t("mobile_guild_local")}
            selected={mode === "local"}
            onPress={() => setMode("local")}
          />
          <Chip
            theme={theme}
            label="Cloud"
            selected={mode === "cloud_productivity"}
            onPress={() => setMode("cloud_productivity")}
          />
          <Chip
            theme={theme}
            label={t("mobile_guild_online")}
            selected={mode === "cloud_guild"}
            onPress={() => setMode("cloud_guild")}
          />
        </ChipRow>
        {cloudUnlinked ? (
          <InlineNote theme={theme}>{t("mobile_social_need_cloud")}</InlineNote>
        ) : null}
        {rows.length === 0 ? (
          <EmptyState
            theme={theme}
            title={t("nav_leaderboard")}
            message={t("leaderboard_empty")}
          />
        ) : (
          rows.map((row) => (
            <Card key={`${row.rank}-${row.name}`} theme={theme}>
              <View style={styles.head}>
                <Text style={[styles.rank, { color: theme.colors.primary }]}>
                  #{row.rank}
                </Text>
                <View style={styles.headText}>
                  <Text style={[styles.name, { color: theme.colors.text }]}>
                    {row.name}
                  </Text>
                  <Text style={[styles.meta, { color: theme.colors.muted }]}>
                    Lv {row.level}
                    {row.title ? ` · ${row.title}` : ""} · {row.score}
                  </Text>
                </View>
              </View>
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
  rank: { fontSize: 18, fontWeight: "800", minWidth: 44 },
  name: { fontSize: 15, fontWeight: "700" },
  meta: { fontSize: 12 },
});
