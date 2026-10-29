/**
 * M10 — layar Chat dengan satu teman.
 *
 * Payload `/api/friends/{id}/chat` bersifat hybrid dan itu keputusan
 * server: bila kedua pihak tertaut cloud, pesan datang dari cache cloud
 * (lengkap dengan reaksi, status sinkron, dan indikator mengetik); bila
 * tidak, dari pesan lokal desktop. Layar ini menampilkan keduanya dengan
 * bentuk yang sama. Pesan baru dicek berkala (polling) karena "realtime"
 * ponsel mengalir lewat server desktop — Supabase Realtime tetap milik
 * sesi desktop, dan ponsel menerima hasilnya lewat payload yang sama.
 * Lampiran belum bisa dikirim dari Android; pesan ber-lampiran dari
 * desktop tampil dengan penanda jumlah lampiran.
 */

import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  Button,
  Card,
  InlineNote,
  TextField,
} from "../components/ui/primitives";
import { ScreenShell, Stack } from "../components/ui/ScreenShell";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { errorMessage, isNetworkFailure } from "../data/httpApi";
import { useRemote } from "../data/useRemote";
import { parseChat, type ChatMessageRow } from "../features/social/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

const REACTIONS = ["❤️", "👍", "😂", "🔥"];
const POLL_MS = 6000;

export default function ChatScreen({
  friendId,
  friendName,
}: {
  friendId: string;
  friendName: string;
}) {
  const { theme } = useTheme();
  const remote = useRemote(`/api/friends/${friendId}/chat`, parseChat);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessageRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const api = remote.app?.api;

  useEffect(() => {
    const timer = setInterval(() => void remote.reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [remote]);

  const post = useCallback(
    async (path: string, body: unknown) => {
      if (!api || busy) return;
      setBusy(true);
      setNotice(null);
      try {
        await api.post(path, body);
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

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const body: Record<string, unknown> = { text };
    if (replyTo) body.replyToId = replyTo.id;
    setReplyTo(null);
    void post(`/api/friends/${friendId}/chat`, body);
  }, [draft, replyTo, post, friendId]);

  if (remote.loading && !remote.data) {
    return (
      <LoadingState theme={theme} title={friendName} message={t("loading")} />
    );
  }
  if (remote.error && !remote.data) {
    return (
      <ErrorState
        theme={theme}
        title={friendName}
        message={remote.error}
        retryLabel={t("web_retry")}
        onRetry={() => void remote.reload()}
      />
    );
  }

  const { messages, friendTyping } = remote.data ?? {
    messages: [],
    friendTyping: false,
  };

  return (
    <ScreenShell
      theme={theme}
      title={friendName}
      onRefresh={() => void remote.reload()}
      refreshing={remote.refreshing}
      offlineNotice={remote.online ? null : t("mobile_offline_banner")}
    >
      <Stack>
        {friendTyping ? (
          <InlineNote theme={theme}>{t("cloud_chat_typing")}</InlineNote>
        ) : null}
        {notice ? <InlineNote theme={theme}>{notice}</InlineNote> : null}
        {replyTo ? (
          <InlineNote theme={theme}>
            {t("chat_replying_to")}: {replyTo.text.slice(0, 60)}
          </InlineNote>
        ) : null}
        {messages.length === 0 ? (
          <EmptyState
            theme={theme}
            title={friendName}
            message={t("chat_input_placeholder")}
          />
        ) : (
          messages.map((message) => (
            <Card key={message.id} theme={theme}>
              <Text
                style={[
                  styles.body,
                  {
                    color: theme.colors.text,
                    textAlign: message.isSelf ? "right" : "left",
                  },
                ]}
              >
                {message.deletedAt ? t("chat_message_deleted") : message.text}
              </Text>
              <Text style={[styles.meta, { color: theme.colors.muted }]}>
                {message.isSelf ? t("chat_you") : friendName} · {message.createdAt}
                {message.attachmentCount > 0 ? ` · 📎 ${message.attachmentCount}` : ""}
                {message.syncStatus !== "synced" ? ` · ${t("chat_pending")}` : ""}
              </Text>
              {Object.keys(message.reactions).length > 0 ? (
                <Text style={[styles.meta, { color: theme.colors.muted }]}>
                  {Object.entries(message.reactions)
                    .map(([emoji, count]) => `${emoji} ${count}`)
                    .join("  ")}
                </Text>
              ) : null}
              <View style={styles.actions}>
                {REACTIONS.map((emoji) => (
                  <Text
                    key={emoji}
                    style={styles.react}
                    onPress={() =>
                      void post(`/api/friends/messages/${message.id}/reaction`, {
                        reaction: emoji,
                      })
                    }
                  >
                    {emoji}
                  </Text>
                ))}
                <Text
                  style={[styles.reply, { color: theme.colors.primary }]}
                  onPress={() => setReplyTo(message)}
                >
                  {t("chat_reply")}
                </Text>
              </View>
            </Card>
          ))
        )}
        <Card theme={theme}>
          <TextField
            theme={theme}
            label={t("chat_input_placeholder")}
            value={draft}
            onChangeText={setDraft}
            placeholder={t("chat_input_placeholder")}
            multiline
          />
          <Button
            theme={theme}
            label={t("chat_send_btn")}
            disabled={busy || draft.trim() === ""}
            onPress={send}
          />
        </Card>
      </Stack>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 20 },
  meta: { fontSize: 11 },
  actions: { flexDirection: "row", gap: 14, alignItems: "center" },
  react: { fontSize: 18, paddingVertical: 2 },
  reply: { fontSize: 12, fontWeight: "700" },
});
