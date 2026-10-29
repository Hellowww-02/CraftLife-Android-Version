/**
 * M10 — layar Friends: daftar teman, permintaan masuk, tambah teman.
 *
 * Status online, jumlah pesan belum dibaca, dan status couple semuanya
 * dibaca dari payload `/api/friends` yang dibentuk server (cache presence
 * cloud + hitungan unread). Menambah/menerima/menolak memakai route yang
 * sama dengan UI web desktop — saat tertaut cloud, permintaan diteruskan
 * server ke Supabase; saat tidak, ia berjalan lokal. Ponsel tidak
 * memutuskan sendiri siapa teman siapa.
 */

import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  Button,
  Card,
  InlineNote,
  SectionHeader,
  TextField,
} from "../components/ui/primitives";
import { ScreenShell, Stack } from "../components/ui/ScreenShell";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { errorMessage, isNetworkFailure } from "../data/httpApi";
import { useRemote } from "../data/useRemote";
import { parseFriends, type FriendRow } from "../features/social/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

export default function FriendsScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const remote = useRemote("/api/friends", parseFriends);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const api = remote.app?.api;

  const run = useCallback(
    async (path: string, body?: unknown) => {
      if (!api || busy) return;
      setBusy(true);
      setNotice(null);
      try {
        await api.post(path, body ?? {});
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
      <LoadingState theme={theme} title={t("nav_friends")} message={t("loading")} />
    );
  }
  if (remote.error && !remote.data) {
    return (
      <ErrorState
        theme={theme}
        title={t("nav_friends")}
        message={remote.error}
        retryLabel={t("web_retry")}
        onRetry={() => void remote.reload()}
      />
    );
  }

  const { friends, requests } = remote.data ?? { friends: [], requests: [] };

  return (
    <ScreenShell
      theme={theme}
      title={t("nav_friends")}
      onRefresh={() => void remote.reload()}
      refreshing={remote.refreshing}
      offlineNotice={remote.online ? null : t("mobile_offline_banner")}
    >
      <Stack>
        <Card theme={theme}>
          <TextField
            theme={theme}
            label={t("cloud_friend_username")}
            value={username}
            onChangeText={setUsername}
            placeholder="username"
          />
          <Button
            theme={theme}
            label={t("cloud_friend_add")}
            disabled={busy || username.trim() === ""}
            onPress={() => {
              void run("/api/friends/request", { username: username.trim() });
              setUsername("");
            }}
          />
        </Card>

        {notice ? <InlineNote theme={theme}>{notice}</InlineNote> : null}

        {requests.length > 0 ? (
          <>
            <SectionHeader theme={theme} title={t("guild_join_requests")} />
            {requests.map((req) => (
              <Card key={req.id} theme={theme}>
                <Text style={[styles.name, { color: theme.colors.text }]}>
                  {req.name}
                </Text>
                <Text style={[styles.meta, { color: theme.colors.muted }]}>
                  @{req.username}
                </Text>
                <View style={styles.actions}>
                  <Button
                    theme={theme}
                    label={t("guild_accept")}
                    disabled={busy}
                    onPress={() => void run(`/api/friends/${req.id}/accept`)}
                  />
                  <Button
                    theme={theme}
                    variant="ghost"
                    label={t("guild_reject")}
                    disabled={busy}
                    onPress={() => void run(`/api/friends/${req.id}/reject`)}
                  />
                </View>
              </Card>
            ))}
          </>
        ) : null}

        <SectionHeader theme={theme} title={t("nav_friends")} />
        {friends.length === 0 ? (
          <EmptyState
            theme={theme}
            title={t("nav_friends")}
            message={t("cloud_friend_username")}
          />
        ) : (
          friends.map((friend) => (
            <FriendCard
              key={friend.id}
              friend={friend}
              busy={busy}
              onChat={() =>
                router.push({
                  pathname: "/more/chat",
                  params: { friendId: friend.id, name: friend.displayName },
                } as never)
              }
              onRemove={() =>
                void run("/api/friends/remove", { friendId: Number(friend.id) })
              }
            />
          ))
        )}
      </Stack>
    </ScreenShell>
  );
}

function FriendCard({
  friend,
  busy,
  onChat,
  onRemove,
}: {
  friend: FriendRow;
  busy: boolean;
  onChat: () => void;
  onRemove: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Card theme={theme}>
      <View style={styles.head}>
        <Text style={styles.avatar}>{friend.avatarEmoji}</Text>
        <View style={styles.headText}>
          <Text style={[styles.name, { color: theme.colors.text }]}>
            {friend.displayName}
            {friend.unreadCount > 0 ? ` · ${friend.unreadCount}` : ""}
          </Text>
          <Text style={[styles.meta, { color: theme.colors.muted }]}>
            @{friend.username} · Lv {friend.level} ·{" "}
            {friend.isOnline
              ? `🟢 ${t("mobile_presence_online")}`
              : `⚪ ${t("mobile_presence_offline")}`}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Button theme={theme} label={t("chat_send_btn")} disabled={busy} onPress={onChat} />
        <Button
          theme={theme}
          variant="ghost"
          label={t("chat_clear_self")}
          disabled={busy}
          onPress={onRemove}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  headText: { flex: 1, gap: 2 },
  avatar: { fontSize: 30 },
  name: { fontSize: 15, fontWeight: "700" },
  meta: { fontSize: 12 },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
});
