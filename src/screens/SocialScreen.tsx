/**
 * M10 — hub Social (tab Social).
 *
 * Pintu masuk semua fitur sosial: Teman & Chat, Guild, PvP, Leaderboard,
 * Love Space, dan Notifikasi. Angka yang ditampilkan (jumlah teman,
 * notifikasi belum dibaca) selalu dari server — hub tidak menebak. Saat
 * hub dibuka, ponsel juga mengirim heartbeat presence dan mencoba
 * mendaftarkan token push; keduanya gagal-diam bila cloud belum tertaut.
 */

import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card, SectionHeader } from "../components/ui/primitives";
import { ScreenShell, Stack } from "../components/ui/ScreenShell";
import { useRemote } from "../data/useRemote";
import { parseFriends, parseNotifications } from "../features/social/model";
import { t } from "../i18n";
import { heartbeatPresence, registerPushToken } from "../notifications/push";
import { useTheme } from "../theme/ThemeProvider";

export default function SocialScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const friendsRemote = useRemote("/api/friends", parseFriends);
  const notifRemote = useRemote("/api/cloud/notifications", (raw) =>
    parseNotifications(raw, "cloud"),
  );
  const app = friendsRemote.app;

  useEffect(() => {
    if (!app) return;
    void heartbeatPresence(app);
    void registerPushToken(app);
  }, [app]);

  const friendCount = friendsRemote.data?.friends.length ?? 0;
  const requestCount = friendsRemote.data?.requests.length ?? 0;
  const unread = (notifRemote.data ?? []).filter((n) => !n.isRead).length;

  const links: Array<{ icon: string; label: string; hint: string; path: string }> = [
    {
      icon: "👥",
      label: t("nav_friends"),
      hint: `${friendCount} · ${requestCount} ${t("guild_join_requests")}`,
      path: "/more/friends",
    },
    { icon: "⚔️", label: t("nav_guild"), hint: t("mobile_guild_online"), path: "/more/guild" },
    { icon: "🥊", label: t("mobile_pvp_title"), hint: t("cloud_pvp_challenge"), path: "/more/pvp" },
    { icon: "🏆", label: t("nav_leaderboard"), hint: t("web_leaderboard"), path: "/more/leaderboard" },
    { icon: "💖", label: t("nav_love"), hint: t("mobile_love_memories"), path: "/more/love" },
    {
      icon: "🔔",
      label: t("notif_title"),
      hint: unread > 0 ? `${unread} ${t("mobile_notifications_cloud")}` : t("mobile_notifications_cloud"),
      path: "/more/notifications",
    },
  ];

  return (
    <ScreenShell
      theme={theme}
      title={t("nav_friends")}
      onRefresh={() => {
        void friendsRemote.reload();
        void notifRemote.reload();
      }}
      refreshing={friendsRemote.refreshing}
      offlineNotice={friendsRemote.online ? null : t("mobile_offline_banner")}
    >
      <Stack>
        <SectionHeader theme={theme} title={t("nav_friends")} />
        {links.map((link) => (
          <Card key={link.path} theme={theme}>
            <View style={styles.row}>
              <Text style={styles.icon}>{link.icon}</Text>
              <View style={styles.text}>
                <Text style={[styles.label, { color: theme.colors.text }]}>
                  {link.label}
                </Text>
                <Text style={[styles.hint, { color: theme.colors.muted }]}>
                  {link.hint}
                </Text>
              </View>
              <Text
                style={[styles.go, { color: theme.colors.primary }]}
                onPress={() => router.push(link.path as never)}
              >
                →
              </Text>
            </View>
          </Card>
        ))}
      </Stack>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { fontSize: 26 },
  text: { flex: 1, gap: 2 },
  label: { fontSize: 15, fontWeight: "700" },
  hint: { fontSize: 12 },
  go: { fontSize: 20, fontWeight: "800", paddingHorizontal: 8 },
});
