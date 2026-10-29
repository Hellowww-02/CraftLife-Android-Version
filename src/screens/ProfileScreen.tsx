/**
 * M08 — layar Profile.
 *
 * Cakupan yang disengaja: identitas + progres karakter + ganti gelar.
 * Bagian keamanan akun (ganti password, backup codes, lock, redeem) TIDAK
 * dibawa ke ponsel di M08 — itu aksi berisiko tinggi yang di desktop pun
 * dilindungi konfirmasi berlapis, dan memindahkannya ke layar kecil tanpa
 * bisa mengujinya di sini akan jadi fitur yang berpura-pura aman.
 *
 * Ganti class juga tidak dibuka: backend menegakkan cooldown
 * (`db_class_change_cooldown`), dan menampilkan tombol yang mungkin ditolak
 * tanpa penjelasan yang benar lebih buruk daripada tidak menampilkannya.
 */

import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet } from "../components/ui/BottomSheet";
import {
  Button,
  Card,
  Chip,
  ChipRow,
  InlineNote,
  ProgressBar,
  SectionHeader,
  TextField,
} from "../components/ui/primitives";
import { ScreenShell, Stack, StatRow, StatTile } from "../components/ui/ScreenShell";
import { ErrorState, LoadingState } from "../components/states";
import { loadPersistedUser } from "../auth/session";
import { getAppData, resolveLocalUserId } from "../data/appData";
import { loadRemote } from "../data/taskActions";
import {
  draftError,
  emptyProfileDraft,
  profileBars,
  profileHeader,
  profilePayload,
  profileStats,
  toTitleOptions,
  toUserSummary,
  type ProfileDraft,
} from "../features/profile/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

const AVATAR_CHOICES = ["⚔️", "🧙", "🏹", "🛡️", "🗡️", "💚"] as const;

export default function ProfileScreen() {
  const { theme } = useTheme();
  const [user, setUser] = useState<ReturnType<typeof toUserSummary>>(null);
  const [titles, setTitles] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>({ displayName: "", bio: "", avatar: "⚔️" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (mode: "initial" | "pull") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const userId = await resolveLocalUserId(undefined, loadPersistedUser);
      const app = await getAppData(userId);
      const [me, titleList] = await Promise.all([
        loadRemote<{ user?: unknown }>(app.api, "/api/me"),
        loadRemote<{ titles?: unknown; selectedTitle?: string }>(app.api, "/api/profile/titles"),
      ]);
      setUser(toUserSummary(me.data?.user));
      setTitles(Array.isArray(titleList.data?.titles) ? titleList.data!.titles : []);
      setOnline(me.online);
      setError(me.error);
      const loaded = toUserSummary(me.data?.user);
      if (loaded) setDraft({ ...emptyProfileDraft(loaded), bio: "" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  const save = useCallback(() => {
    if (draftError(draft)) {
      setNotice(t("error_occurred", { error: "empty" }));
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        const userId = await resolveLocalUserId(undefined, loadPersistedUser);
        const app = await getAppData(userId);
        await app.api.post("/api/settings", profilePayload(draft));
        setEditing(false);
        setNotice(t("msg_saved"));
        await load("pull");
      } catch (err) {
        setNotice(t("error_occurred", { error: err instanceof Error ? err.message : String(err) }));
      } finally {
        setBusy(false);
      }
    })();
  }, [draft, load]);

  const chooseTitle = useCallback(
    (key: string) => {
      setBusy(true);
      void (async () => {
        try {
          const userId = await resolveLocalUserId(undefined, loadPersistedUser);
          const app = await getAppData(userId);
          // Handler membaca `body.get("key")` — bukan `titleKey`
          // (`api_server.py:1835`). Nama field yang salah akan membuat gelar
          // kosong terkirim dan gelar lama hilang.
          await app.api.post("/api/profile/title", { key });
          setNotice(t("msg_saved"));
          await load("pull");
        } catch (err) {
          setNotice(t("error_occurred", { error: err instanceof Error ? err.message : String(err) }));
        } finally {
          setBusy(false);
        }
      })();
    },
    [load],
  );

  if (loading && !user) {
    return <LoadingState theme={theme} title={t("page_profile_title")} message={t("loading")} />;
  }
  if (!user) {
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

  const header = profileHeader(user);
  const bars = profileBars(user);
  const stats = profileStats(user);
  const options = toTitleOptions(titles, user.selectedTitle);

  return (
    <>
      <ScreenShell
        theme={theme}
        title={t("page_profile_title")}
        subtitle={t("page_profile_subtitle")}
        onRefresh={() => void load("pull")}
        refreshing={refreshing}
        offlineNotice={!online ? t("mobile_offline_banner") : notice}
        fab={{ icon: "✏️", label: t("dialog_edit_mode", { mode: t("page_profile_title") }), onPress: () => setEditing(true) }}
      >
        <Card theme={theme} style={styles.heroCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarGlyph} accessibilityElementsHidden>
              {header.avatarEmoji}
            </Text>
          </View>
          <View style={styles.grow}>
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
              {header.displayName}
            </Text>
            <Text style={[styles.sub, { color: theme.colors.muted }]} numberOfLines={1}>
              {`${t("dashboard_level")} ${header.level}`}
              {header.title ? `  ·  ${header.title}` : ""}
            </Text>
          </View>
        </Card>

        <Card theme={theme} style={styles.columnCard}>
          {bars.map((bar) => (
            <ProgressBar
              key={bar.labelKey}
              theme={theme}
              percent={bar.percent}
              label={t(bar.labelKey)}
              detail={`${bar.value}/${bar.max}`}
            />
          ))}
        </Card>

        <StatRow>
          {stats.map((stat) => (
            <StatTile key={stat.labelKey} theme={theme} label={t(stat.labelKey)} value={stat.value} />
          ))}
        </StatRow>

        {options.length > 0 ? (
          <>
            <SectionHeader theme={theme} title={t("title_selector_label")} />
            <Card theme={theme} style={styles.columnCard}>
              <ChipRow>
                {options.map((option) => (
                  <Chip
                    key={option.key}
                    theme={theme}
                    label={option.label}
                    selected={option.selected}
                    onPress={() => chooseTitle(option.key)}
                  />
                ))}
              </ChipRow>
            </Card>
          </>
        ) : null}

        <Stack>
          <InlineNote theme={theme}>{t("dashboard_footer")}</InlineNote>
        </Stack>
      </ScreenShell>

      <BottomSheet
        theme={theme}
        visible={editing}
        title={t("dialog_edit_mode", { mode: t("page_profile_title") })}
        onClose={() => setEditing(false)}
        footer={<Button theme={theme} label={t("dialog_save")} onPress={save} disabled={busy} />}
      >
        <TextField
          theme={theme}
          label={t("profile_display_name")}
          value={draft.displayName}
          onChangeText={(displayName) => setDraft({ ...draft, displayName })}
        />
        <TextField
          theme={theme}
          label={t("profile_bio_label")}
          value={draft.bio}
          onChangeText={(bio) => setDraft({ ...draft, bio })}
          placeholder={t("profile_bio")}
          multiline
        />
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>{t("dialog_icon")}</Text>
          <ChipRow>
            {AVATAR_CHOICES.map((icon) => (
              <Chip
                key={icon}
                theme={theme}
                label={icon}
                selected={draft.avatar === icon}
                onPress={() => setDraft({ ...draft, avatar: icon })}
              />
            ))}
          </ChipRow>
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  heroCard: { minHeight: 0 },
  columnCard: { alignItems: "stretch", flexDirection: "column", gap: 10, minHeight: 0 },
  avatar: {
    alignItems: "center",
    borderRadius: 32,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  avatarGlyph: { fontSize: 34 },
  grow: { flex: 1 },
  name: { fontSize: 20, fontWeight: "800" },
  sub: { fontSize: 13 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: "700" },
});
