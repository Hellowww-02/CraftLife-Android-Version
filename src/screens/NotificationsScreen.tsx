/**
 * M10 — layar Notifications: notifikasi sosial cloud + lokal.
 *
 * Dua sumber ditampilkan terpisah supaya jelas asal-usulnya: sosial cloud
 * (permintaan teman, guild, PvP, Love — dari Supabase lewat jembatan
 * `/api/cloud/notifications`) dan lokal (pusat notifikasi desktop di
 * `/api/notifications`). Menandai dibaca meneruskan ke sumbernya masing-
 * masing; ponsel tidak menghapus apa pun dari server.
 */

import React, { useCallback, useState } from "react";
import { StyleSheet, Text } from "react-native";

import {
  Button,
  Card,
  InlineNote,
  SectionHeader,
} from "../components/ui/primitives";
import { ScreenShell, Stack } from "../components/ui/ScreenShell";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { errorMessage, isNetworkFailure } from "../data/httpApi";
import { useRemote } from "../data/useRemote";
import { parseNotifications } from "../features/social/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const cloudRemote = useRemote("/api/cloud/notifications", (raw) =>
    parseNotifications(raw, "cloud"),
  );
  const localRemote = useRemote("/api/notifications", (raw) =>
    parseNotifications(raw, "local"),
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const api = cloudRemote.app?.api;

  const reloadAll = useCallback(async () => {
    await Promise.all([cloudRemote.reload(), localRemote.reload()]);
  }, [cloudRemote, localRemote]);

  const markRead = useCallback(
    async (path: string, body: unknown) => {
      if (!api || busy) return;
      setBusy(true);
      setNotice(null);
      try {
        await api.post(path, body);
        await reloadAll();
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
    [api, busy, reloadAll],
  );

  if (cloudRemote.loading && !cloudRemote.data && localRemote.loading && !localRemote.data) {
    return (
      <LoadingState theme={theme} title={t("notif_title")} message={t("loading")} />
    );
  }
  if (cloudRemote.error && !cloudRemote.data && localRemote.error && !localRemote.data) {
    return (
      <ErrorState
        theme={theme}
        title={t("notif_title")}
        message={cloudRemote.error || localRemote.error || ""}
        retryLabel={t("web_retry")}
        onRetry={() => void reloadAll()}
      />
    );
  }

  const cloudRows = cloudRemote.data ?? [];
  const localRows = localRemote.data ?? [];

  return (
    <ScreenShell
      theme={theme}
      title={t("notif_title")}
      onRefresh={() => void reloadAll()}
      refreshing={cloudRemote.refreshing}
      offlineNotice={cloudRemote.online ? null : t("mobile_offline_banner")}
    >
      <Stack>
        {notice ? <InlineNote theme={theme}>{notice}</InlineNote> : null}
        <SectionHeader theme={theme} title={t("mobile_notifications_cloud")} />
        {cloudRows.length === 0 ? (
          <EmptyState theme={theme} title={t("mobile_notifications_cloud")} message={t("notif_empty")} />
        ) : (
          cloudRows.map((n) => (
            <Card key={`c-${n.id}`} theme={theme}>
              <Text style={[styles.body, { color: theme.colors.text }]}>
                {n.isRead ? "" : "🔵 "}
                {n.message}
              </Text>
              <Text style={[styles.meta, { color: theme.colors.muted }]}>
                {n.type} · {n.createdAt}
              </Text>
              {!n.isRead ? (
                <Button
                  theme={theme}
                  variant="ghost"
                  label={t("notif_close")}
                  disabled={busy}
                  onPress={() =>
                    void markRead("/api/cloud/notifications/read", { id: n.id })
                  }
                />
              ) : null}
            </Card>
          ))
        )}
        <SectionHeader theme={theme} title={t("mobile_notifications_local")} />
        {localRows.length === 0 ? (
          <EmptyState theme={theme} title={t("mobile_notifications_local")} message={t("notif_empty")} />
        ) : (
          localRows.map((n) => (
            <Card key={`l-${n.id}`} theme={theme}>
              <Text style={[styles.body, { color: theme.colors.text }]}>
                {n.isRead ? "" : "🔵 "}
                {n.message}
              </Text>
              <Text style={[styles.meta, { color: theme.colors.muted }]}>
                {n.type} · {n.createdAt}
              </Text>
              {!n.isRead ? (
                <Button
                  theme={theme}
                  variant="ghost"
                  label={t("notif_close")}
                  disabled={busy}
                  onPress={() =>
                    void markRead("/api/notifications/read", { id: Number(n.id) || n.id })
                  }
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
  body: { fontSize: 14, lineHeight: 20 },
  meta: { fontSize: 11 },
});
