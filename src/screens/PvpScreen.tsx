/**
 * M10 — layar PvP: tantangan produktivitas melawan teman.
 *
 * Skor dan status tantangan dihitung server (`/api/pvp` dari snapshot
 * desktop; saat tertaut cloud, tantangan berjalan lewat RPC online).
 * Tombol Terima/Tolak/Klaim hanya tampil bila status dari server
 * mengizinkannya — ponsel tidak menilai siapa menang.
 */

import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  Button,
  Card,
  Chip,
  ChipRow,
  InlineNote,
} from "../components/ui/primitives";
import { ScreenShell, Stack } from "../components/ui/ScreenShell";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { errorMessage, isNetworkFailure } from "../data/httpApi";
import { useRemote } from "../data/useRemote";
import { parseFriends, parsePvp } from "../features/social/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

export default function PvpScreen() {
  const { theme } = useTheme();
  const pvpRemote = useRemote("/api/pvp", parsePvp);
  const friendsRemote = useRemote("/api/friends", parseFriends);
  const [selectedFriend, setSelectedFriend] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const api = pvpRemote.app?.api;

  const run = useCallback(
    async (path: string, body?: unknown) => {
      if (!api || busy) return;
      setBusy(true);
      setNotice(null);
      try {
        await api.post(path, body ?? {});
        await pvpRemote.reload();
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
    [api, busy, pvpRemote],
  );

  if (pvpRemote.loading && !pvpRemote.data) {
    return (
      <LoadingState theme={theme} title={t("mobile_pvp_title")} message={t("loading")} />
    );
  }
  if (pvpRemote.error && !pvpRemote.data) {
    return (
      <ErrorState
        theme={theme}
        title={t("mobile_pvp_title")}
        message={pvpRemote.error}
        retryLabel={t("web_retry")}
        onRetry={() => void pvpRemote.reload()}
      />
    );
  }

  const challenges = pvpRemote.data ?? [];
  const friends = friendsRemote.data?.friends ?? [];

  return (
    <ScreenShell
      theme={theme}
      title={t("mobile_pvp_title")}
      onRefresh={() => void pvpRemote.reload()}
      refreshing={pvpRemote.refreshing}
      offlineNotice={pvpRemote.online ? null : t("mobile_offline_banner")}
    >
      <Stack>
        {notice ? <InlineNote theme={theme}>{notice}</InlineNote> : null}
        {friends.length > 0 ? (
          <Card theme={theme}>
            <ChipRow>
              {friends.map((f) => (
                <Chip
                  key={f.id}
                  theme={theme}
                  label={`${f.avatarEmoji} ${f.displayName}`}
                  selected={selectedFriend === f.id}
                  onPress={() => setSelectedFriend(f.id)}
                />
              ))}
            </ChipRow>
            <Button
              theme={theme}
              label={t("cloud_pvp_challenge")}
              disabled={busy || selectedFriend === ""}
              onPress={() =>
                void run("/api/pvp", { friendId: Number(selectedFriend) })
              }
            />
          </Card>
        ) : null}
        {challenges.length === 0 ? (
          <EmptyState
            theme={theme}
            title={t("mobile_pvp_title")}
            message={t("cloud_pvp_empty")}
          />
        ) : (
          challenges.map((c) => (
            <Card key={c.id} theme={theme}>
              <View style={styles.head}>
                <Text style={styles.avatar}>🥊</Text>
                <View style={styles.headText}>
                  <Text style={[styles.name, { color: theme.colors.text }]}>
                    {c.opponentName}
                  </Text>
                  <Text style={[styles.meta, { color: theme.colors.muted }]}>
                    {t("cloud_pvp_score")}: {c.playerScore} — {c.opponentScore} ·{" "}
                    {c.status} · {c.daysLeft}d
                  </Text>
                  <Text style={[styles.meta, { color: theme.colors.muted }]}>
                    {t("cloud_pvp_reward")}: +{c.rewardXp} XP · +{c.rewardGold} G
                  </Text>
                </View>
              </View>
              {c.canRespond ? (
                <View style={styles.actions}>
                  <Button
                    theme={theme}
                    label={t("guild_accept")}
                    disabled={busy}
                    onPress={() => void run(`/api/pvp/${c.id}/respond`, { accept: true })}
                  />
                  <Button
                    theme={theme}
                    variant="ghost"
                    label={t("guild_reject")}
                    disabled={busy}
                    onPress={() => void run(`/api/pvp/${c.id}/respond`, { accept: false })}
                  />
                </View>
              ) : null}
              {c.canClaim ? (
                <Button
                  theme={theme}
                  label={t("cloud_pvp_claim")}
                  disabled={busy}
                  onPress={() => void run(`/api/pvp/${c.id}/claim`)}
                />
              ) : null}
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
  avatar: { fontSize: 28 },
  name: { fontSize: 15, fontWeight: "700" },
  meta: { fontSize: 12 },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
});
