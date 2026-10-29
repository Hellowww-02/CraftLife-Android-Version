/**
 * M10 — layar Guild: guild lokal + guild online (cloud).
 *
 * Dua dunia yang memang terpisah di CraftLife dan tidak dicampur layar ini:
 * guild LOKAL (di perangkat/desktop yang sama, boss & chat dari
 * `/api/guild*`) dan guild ONLINE (lintas pengguna lewat Supabase, dari
 * jembatan `/api/cloud/guild-online`). Di guild online, role, transfer
 * kepemimpinan, kick, dan ban diputuskan RPC server — tombol admin hanya
 * tampil bila payload server menyebut peranmu leader/officer, dan server
 * tetap memvalidasi ulang setiap perintah. Chat online memakai route yang
 * sama; pesan tampil dari payload server, bukan karangan lokal.
 */

import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  Button,
  Card,
  Chip,
  ChipRow,
  InlineNote,
  SectionHeader,
  TextField,
} from "../components/ui/primitives";
import { ScreenShell, Stack } from "../components/ui/ScreenShell";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { errorMessage, isNetworkFailure } from "../data/httpApi";
import { useRemote } from "../data/useRemote";
import {
  parseLocalGuild,
  parseOnlineGuild,
  type GuildMemberRow,
} from "../features/social/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

type Tab = "local" | "online";

export default function GuildScreen() {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>("local");
  return (
    <ScreenShell theme={theme} title={t("nav_guild")}>
      <Stack>
        <ChipRow>
          <Chip
            theme={theme}
            label={t("mobile_guild_local")}
            selected={tab === "local"}
            onPress={() => setTab("local")}
          />
          <Chip
            theme={theme}
            label={t("mobile_guild_online")}
            selected={tab === "online"}
            onPress={() => setTab("online")}
          />
        </ChipRow>
        {tab === "local" ? <LocalGuildSection /> : <OnlineGuildSection />}
      </Stack>
    </ScreenShell>
  );
}

function useCommand(reload: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  return {
    busy,
    notice,
    run: async (
      api: { post: (path: string, body?: unknown) => Promise<unknown> } | undefined,
      path: string,
      body?: unknown,
    ) => {
      if (!api || busy) return;
      setBusy(true);
      setNotice(null);
      try {
        await api.post(path, body ?? {});
        await reload();
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
  };
}

function LocalGuildSection() {
  const { theme } = useTheme();
  const guildRemote = useRemote("/api/guild", parseLocalGuild);
  const messagesRemote = useRemote("/api/guild/messages", (raw) => raw);
  const bossesRemote = useRemote("/api/guild/bosses", (raw) => raw);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");

  const reloadAll = useCallback(async () => {
    await Promise.all([
      guildRemote.reload(),
      messagesRemote.reload(),
      bossesRemote.reload(),
    ]);
  }, [guildRemote, messagesRemote, bossesRemote]);
  const cmd = useCommand(reloadAll);
  const api = guildRemote.app?.api;
  const guild = guildRemote.data;

  if (guildRemote.loading && !guildRemote.data) {
    return <LoadingState theme={theme} title={t("nav_guild")} message={t("loading")} />;
  }
  if (guildRemote.error && !guildRemote.data) {
    return (
      <ErrorState
        theme={theme}
        title={t("nav_guild")}
        message={guildRemote.error}
        retryLabel={t("web_retry")}
        onRetry={() => void reloadAll()}
      />
    );
  }

  const messages =
    messagesRemote.data &&
    typeof messagesRemote.data === "object" &&
    Array.isArray((messagesRemote.data as { messages?: unknown }).messages)
      ? ((messagesRemote.data as { messages: Array<Record<string, unknown>> }).messages ?? [])
      : [];
  const bosses =
    bossesRemote.data &&
    typeof bossesRemote.data === "object" &&
    Array.isArray((bossesRemote.data as { bosses?: unknown }).bosses)
      ? ((bossesRemote.data as { bosses: Array<Record<string, unknown>> }).bosses ?? [])
      : [];

  return (
    <Stack>
      {cmd.notice ? <InlineNote theme={theme}>{cmd.notice}</InlineNote> : null}
      {!guild?.hasGuild ? (
        <Card theme={theme}>
          <Text style={[styles.meta, { color: theme.colors.muted }]}>
            {t("guild_no_guild")}
          </Text>
          <TextField
            theme={theme}
            label={t("guild_name")}
            value={name}
            onChangeText={setName}
            placeholder={t("guild_name")}
          />
          <Button
            theme={theme}
            label={t("guild_create_btn")}
            disabled={cmd.busy || name.trim() === ""}
            onPress={() => void cmd.run(api, "/api/guild/create", { name: name.trim() })}
          />
        </Card>
      ) : (
        <>
          <Card theme={theme}>
            <Text style={[styles.name, { color: theme.colors.text }]}>
              {guild.name}
            </Text>
            <Text style={[styles.meta, { color: theme.colors.muted }]}>
              Lv {guild.level} · EXP {guild.exp}/{guild.maxExp}
            </Text>
            <Button
              theme={theme}
              variant="ghost"
              label={t("guild_leave_btn")}
              disabled={cmd.busy}
              onPress={() => void cmd.run(api, "/api/guild/leave")}
            />
          </Card>
          <SectionHeader theme={theme} title={t("guild_members", { count: guild.members.length })} />
          {guild.members.map((member) => (
            <MemberRow key={member.id} member={member} />
          ))}
          <SectionHeader theme={theme} title={t("guild_boss_battle")} />
          {bosses.slice(0, 8).map((boss) => (
            <Card key={String(boss.id)} theme={theme}>
              <View style={styles.head}>
                <Text style={styles.avatar}>{String(boss.icon ?? "🐉")}</Text>
                <View style={styles.headText}>
                  <Text style={[styles.name, { color: theme.colors.text }]}>
                    {String(boss.name ?? boss.id)}
                  </Text>
                  <Text style={[styles.meta, { color: theme.colors.muted }]}>
                    {String(boss.tier ?? "")}
                  </Text>
                </View>
                <Button
                  theme={theme}
                  variant="ghost"
                  label={t("guild_start_boss")}
                  disabled={cmd.busy}
                  onPress={() =>
                    void cmd.run(api, "/api/guild/boss/start", { bossId: boss.id })
                  }
                />
              </View>
            </Card>
          ))}
          <Button
            theme={theme}
            label={t("web_boss_attack")}
            disabled={cmd.busy}
            onPress={() =>
              void cmd.run(api, "/api/guild/boss/attack", { action: "light" })
            }
          />
          <SectionHeader theme={theme} title={t("guild_chat_title")} />
          {messages.map((m) => (
            <Text key={String(m.id)} style={[styles.meta, { color: theme.colors.text }]}>
              {String(m.senderName ?? "")}: {String(m.text ?? "")}
            </Text>
          ))}
          <Card theme={theme}>
            <TextField
              theme={theme}
              label={t("chat_input_placeholder")}
              value={draft}
              onChangeText={setDraft}
              placeholder={t("chat_input_placeholder")}
            />
            <Button
              theme={theme}
              label={t("chat_send_btn")}
              disabled={cmd.busy || draft.trim() === ""}
              onPress={() => {
                void cmd.run(api, "/api/guild/messages", { text: draft.trim() });
                setDraft("");
              }}
            />
          </Card>
        </>
      )}
    </Stack>
  );
}

function OnlineGuildSection() {
  const { theme } = useTheme();
  const remote = useRemote("/api/cloud/guild-online", parseOnlineGuild);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const reload = useCallback(async () => {
    await remote.reload();
  }, [remote]);
  const cmd = useCommand(reload);
  const api = remote.app?.api;
  const state = remote.data;

  if (remote.loading && !remote.data) {
    return <LoadingState theme={theme} title={t("mobile_guild_online")} message={t("loading")} />;
  }
  if (!state || !state.linked) {
    return (
      <EmptyState
        theme={theme}
        title={t("mobile_guild_online")}
        message={t("mobile_social_need_cloud")}
      />
    );
  }

  const gid = state.guildId;

  return (
    <Stack>
      {cmd.notice ? <InlineNote theme={theme}>{cmd.notice}</InlineNote> : null}
      {!gid ? (
        <>
          <Card theme={theme}>
            <TextField
              theme={theme}
              label={t("guild_name")}
              value={name}
              onChangeText={setName}
              placeholder={t("guild_name")}
            />
            <Button
              theme={theme}
              label={t("guild_create_btn")}
              disabled={cmd.busy || name.trim() === ""}
              onPress={() =>
                void cmd.run(api, "/api/cloud/guild-online/create", { name: name.trim() })
              }
            />
          </Card>
          <SectionHeader theme={theme} title={t("mobile_guild_online")} />
          {state.guilds.map((g) => (
            <Card key={g.id} theme={theme}>
              <View style={styles.head}>
                <View style={styles.headText}>
                  <Text style={[styles.name, { color: theme.colors.text }]}>{g.name}</Text>
                  <Text style={[styles.meta, { color: theme.colors.muted }]}>
                    {g.memberCount} {t("guild_members", { count: g.memberCount })}
                  </Text>
                </View>
                <Button
                  theme={theme}
                  variant="ghost"
                  label={t("guild_request_btn")}
                  disabled={cmd.busy}
                  onPress={() =>
                    void cmd.run(api, "/api/cloud/guild-online/join", { guildId: g.id })
                  }
                />
              </View>
            </Card>
          ))}
        </>
      ) : (
        <>
          <Card theme={theme}>
            <Text style={[styles.name, { color: theme.colors.text }]}>{state.guildName}</Text>
            <Text style={[styles.meta, { color: theme.colors.muted }]}>
              {state.myRole} · {state.members.length}
            </Text>
            <Button
              theme={theme}
              variant="ghost"
              label={t("guild_leave_btn")}
              disabled={cmd.busy}
              onPress={() =>
                void cmd.run(api, "/api/cloud/guild-online/leave", { guildId: gid })
              }
            />
          </Card>

          {state.canAdmin && state.requests.length > 0 ? (
            <>
              <SectionHeader theme={theme} title={t("guild_join_requests")} />
              {state.requests.map((req) => (
                <Card key={req.id} theme={theme}>
                  <Text style={[styles.name, { color: theme.colors.text }]}>{req.name}</Text>
                  <View style={styles.actions}>
                    <Button
                      theme={theme}
                      label={t("guild_accept")}
                      disabled={cmd.busy}
                      onPress={() =>
                        void cmd.run(api, "/api/cloud/guild-online/respond", {
                          requestId: req.id,
                          accept: true,
                        })
                      }
                    />
                    <Button
                      theme={theme}
                      variant="ghost"
                      label={t("guild_reject")}
                      disabled={cmd.busy}
                      onPress={() =>
                        void cmd.run(api, "/api/cloud/guild-online/respond", {
                          requestId: req.id,
                          accept: false,
                        })
                      }
                    />
                  </View>
                </Card>
              ))}
            </>
          ) : null}

          <SectionHeader theme={theme} title={t("guild_members", { count: state.members.length })} />
          {state.members.map((member) => (
            <View key={member.id}>
              <MemberRow member={member} />
              {state.canAdmin ? (
                <View style={styles.actions}>
                  <Button
                    theme={theme}
                    variant="ghost"
                    label={t("guild_leader_transfer")}
                    disabled={cmd.busy}
                    onPress={() =>
                      void cmd.run(api, "/api/cloud/guild-online/transfer", {
                        guildId: gid,
                        userId: member.id,
                      })
                    }
                  />
                  <Button
                    theme={theme}
                    variant="ghost"
                    label={t("guild_kick")}
                    disabled={cmd.busy}
                    onPress={() =>
                      void cmd.run(api, "/api/cloud/guild-online/kick", {
                        guildId: gid,
                        userId: member.id,
                      })
                    }
                  />
                  <Button
                    theme={theme}
                    variant="danger"
                    label={t("guild_admin_warning")}
                    disabled={cmd.busy}
                    onPress={() =>
                      void cmd.run(api, "/api/cloud/guild-online/ban", {
                        guildId: gid,
                        userId: member.id,
                      })
                    }
                  />
                </View>
              ) : null}
            </View>
          ))}

          <SectionHeader theme={theme} title={t("guild_boss_battle")} />
          <Button
            theme={theme}
            label={t("guild_start_boss")}
            disabled={cmd.busy}
            onPress={() =>
              void cmd.run(api, "/api/cloud/guild-online/boss-start", { guildId: gid })
            }
          />
          {state.rewards.map((reward, i) => (
            <Card key={String(reward.id ?? i)} theme={theme}>
              <Text style={[styles.meta, { color: theme.colors.text }]}>
                🎁 {String(reward.boss_name ?? reward.battle_id ?? "")}
              </Text>
              <Button
                theme={theme}
                variant="ghost"
                label={t("guild_claim")}
                disabled={cmd.busy}
                onPress={() =>
                  void cmd.run(api, "/api/cloud/guild-online/boss-claim", {
                    battleId: String(reward.battle_id ?? reward.id ?? ""),
                  })
                }
              />
            </Card>
          ))}

          <SectionHeader theme={theme} title={t("guild_chat_title")} />
          {state.messages.map((m) => (
            <Text key={m.id} style={[styles.meta, { color: theme.colors.text }]}>
              {m.text}
            </Text>
          ))}
          <Card theme={theme}>
            <TextField
              theme={theme}
              label={t("chat_input_placeholder")}
              value={draft}
              onChangeText={setDraft}
              placeholder={t("chat_input_placeholder")}
            />
            <Button
              theme={theme}
              label={t("chat_send_btn")}
              disabled={cmd.busy || draft.trim() === ""}
              onPress={() => {
                void cmd.run(api, "/api/cloud/guild-online/message", {
                  guildId: gid,
                  text: draft.trim(),
                });
                setDraft("");
              }}
            />
          </Card>
        </>
      )}
    </Stack>
  );
}

function MemberRow({ member }: { member: GuildMemberRow }) {
  const { theme } = useTheme();
  return (
    <Card theme={theme}>
      <Text style={[styles.name, { color: theme.colors.text }]}>
        {member.name}
      </Text>
      <Text style={[styles.meta, { color: theme.colors.muted }]}>
        {member.role} · Lv {member.level}
      </Text>
    </Card>
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
