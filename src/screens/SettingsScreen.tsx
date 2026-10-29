/**
 * M08 — layar Settings.
 *
 * Empat bagian, dan batasnya tegas:
 *
 *   Tampilan     -> tema & bahasa disimpan ke server (`POST /api/settings`)
 *                   jadi ikut ke desktop; skala font & kontras tinggi adalah
 *                   preferensi PERANGKAT dan tidak dikirim ke mana-mana.
 *   Sinkronisasi -> status antrean lokal + satu drain nyata lewat SyncService.
 *   Akun         -> nama tampilan + logout.
 *   Tentang      -> versi, dijaga tetap sama dengan desktop oleh K22.
 *
 * Drain di sini memakai `apiTransport` sungguhan, jadi menekan "Sync Sekarang"
 * benar-benar mengirim perubahan yang tertunda dan menarik data terbaru —
 * bukan animasi.
 */

import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import pkg from "../../package.json";
import { BottomSheet } from "../components/ui/BottomSheet";
import { Button, Card, Chip, ChipRow, InlineNote, KeyValueRow, SectionHeader } from "../components/ui/primitives";
import { ScreenShell } from "../components/ui/ScreenShell";
import { LoadingState } from "../components/states";
import { clearSession, loadPersistedUser } from "../auth/session";
import { getAppData, resolveLocalUserId } from "../data/appData";
import { loadRemote } from "../data/taskActions";
import {
  FONT_SCALE_OPTIONS,
  languageOptions,
  SETTINGS_SECTIONS,
  settingsPayload,
  themeOptions,
  toAboutState,
  toAppearanceState,
  type AppearanceState,
} from "../features/settings/model";
import { t, setLang, getLang, type Lang } from "../i18n";
import { deviceProbe } from "../sync/probe";
import { apiTransport } from "../sync/apiTransport";
import { SyncService } from "../sync/syncService";
import { useTheme } from "../theme/ThemeProvider";

const ENTITY_TYPES = ["habits", "dailies", "todos"] as const;

export default function SettingsScreen() {
  const { theme, themeKey, setThemeKey } = useTheme();
  const router = useRouter();

  const [appearance, setAppearance] = useState<AppearanceState | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(0);
  const [dead, setDead] = useState(0);
  const [deadJobs, setDeadJobs] = useState<Array<{ id: number; entity_type: string; last_error: string | null }>>([]);
  const [conflicts, setConflicts] = useState(0);
  const [pruned, setPruned] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const userId = await resolveLocalUserId(undefined, loadPersistedUser);
      const app = await getAppData(userId);
      const me = await loadRemote<{ user?: unknown }>(app.api, "/api/me");
      const state = toAppearanceState(me.data?.user);
      setAppearance(state);
      setThemeKey(state.themeKey);
      setLang(state.language);
      const user = (me.data?.user ?? {}) as Record<string, unknown>;
      setDisplayName(typeof user.displayName === "string" ? user.displayName : "");
      setPending(await app.outbox.pendingCount(userId));
      setDead(await app.outbox.deadCount(userId));
      setDeadJobs(
        (await app.outbox.deadJobs(userId)).map((j) => ({
          id: j.id,
          entity_type: j.entity_type,
          last_error: j.last_error,
        })),
      );
      try {
        const res = await app.api.get<{ conflicts?: unknown[] }>("/api/cloud/conflicts");
        setConflicts(Array.isArray(res?.conflicts) ? res.conflicts.length : 0);
      } catch {
        setConflicts(0);
      }
    } finally {
      setLoading(false);
    }
  }, [setThemeKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveAppearance = useCallback(
    async (changes: Partial<Pick<AppearanceState, "themeKey" | "language">>) => {
      setBusy(true);
      try {
        const userId = await resolveLocalUserId(undefined, loadPersistedUser);
        const app = await getAppData(userId);
        await app.api.post("/api/settings", settingsPayload(changes));
        setAppearance((prev) => (prev ? { ...prev, ...changes } : prev));
        setNotice(t("msg_saved"));
      } catch (err) {
        setNotice(t("error_occurred", { error: err instanceof Error ? err.message : String(err) }));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const syncNow = useCallback(async () => {
    setBusy(true);
    try {
      const userId = await resolveLocalUserId(undefined, loadPersistedUser);
      const app = await getAppData(userId);
      await app.clock.refresh();
      const service = new SyncService({
        outbox: app.outbox,
        transport: apiTransport(app.api),
        probe: deviceProbe,
        localUserId: userId,
        entityTypes: [...ENTITY_TYPES],
        readWatermark: (entityType) => app.watermarks.get(userId, entityType),
        onCacheRows: async (entityType, rows) => {
          for (const row of rows) {
            const payload = row.payload as Record<string, unknown> | null;
            if (payload && payload.deleted === true) {
              await app.cache.remove(userId, entityType, row.entityLocalId);
            } else {
              await app.cache.put(userId, entityType, row.entityLocalId, row.payload);
            }
          }
        },
        onWatermark: (entityType, watermark) =>
          app.watermarks.advance(userId, entityType, watermark),
      });
      const outcome = await service.drainOnce();
      setPruned(await app.cache.prune(userId));
      setPending(await app.outbox.pendingCount(userId));
      setDead(await app.outbox.deadCount(userId));
      setDeadJobs(
        (await app.outbox.deadJobs(userId)).map((j) => ({
          id: j.id,
          entity_type: j.entity_type,
          last_error: j.last_error,
        })),
      );
      setNotice(
        outcome.blocked
          ? t("mobile_offline_banner")
          : `${t("cloud_sync_status_up_to_date")} · ${outcome.pushed}/${outcome.pulled}`,
      );
    } catch (err) {
      setNotice(t("error_occurred", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  }, []);

  const requeueDead = useCallback(async () => {
    setBusy(true);
    try {
      const userId = await resolveLocalUserId(undefined, loadPersistedUser);
      const app = await getAppData(userId);
      await app.outbox.requeueDead(userId);
      await load();
    } catch (err) {
      setNotice(t("error_occurred", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  }, [load]);

  const resolveConflict = useCallback(
    async (choice: "local" | "cloud") => {
      setBusy(true);
      try {
        const userId = await resolveLocalUserId(undefined, loadPersistedUser);
        const app = await getAppData(userId);
        await app.api.post("/api/cloud/conflict", { choice });
        setConflicts(0);
        await load();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("401") || msg.toLowerCase().includes("auth")) {
          setNotice(t("mobile_auth_expired"));
          router.replace("/login");
          return;
        }
        setNotice(t("error_occurred", { error: msg }));
      } finally {
        setBusy(false);
      }
    },
    [load, router],
  );

  const logout = useCallback(async () => {
    setConfirmLogout(false);
    await clearSession();
    router.replace("/login");
  }, [router]);

  if (loading || !appearance) {
    return <LoadingState theme={theme} title={t("page_settings_title")} message={t("loading")} />;
  }

  const about = toAboutState(pkg.version);
  const labels = Object.fromEntries(SETTINGS_SECTIONS.map((s) => [s.key, t(s.labelKey)]));

  return (
    <>
      <ScreenShell
        theme={theme}
        title={t("page_settings_title")}
        subtitle={t("page_settings_subtitle")}
        onRefresh={() => void load()}
        offlineNotice={notice}
      >
        <SectionHeader theme={theme} title={labels.appearance ?? t("mobile_settings_appearance")} />
        <Card theme={theme} style={styles.columnCard}>
          <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>{t("settings_theme_title")}</Text>
          <ChipRow>
            {themeOptions(themeKey).map((option) => (
              <Chip
                key={option.key}
                theme={theme}
                label={option.label}
                selected={option.selected}
                onPress={() => {
                  setThemeKey(option.key);
                  void saveAppearance({ themeKey: option.key });
                }}
              />
            ))}
          </ChipRow>
        </Card>

        <Card theme={theme} style={styles.columnCard}>
          <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>{t("settings_language")}</Text>
          <ChipRow>
            {languageOptions(appearance.language).map((option) => (
              <Chip
                key={option.key}
                theme={theme}
                label={t(option.labelKey)}
                selected={option.selected}
                onPress={() => {
                  setLang(option.key as Lang);
                  void saveAppearance({ language: option.key });
                }}
              />
            ))}
          </ChipRow>
        </Card>

        <Card theme={theme} style={styles.columnCard}>
          <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
            {`${t("mobile_settings_appearance")} · font`}
          </Text>
          <ChipRow>
            {FONT_SCALE_OPTIONS.map((value) => (
              <Chip
                key={value}
                theme={theme}
                label={`${value}%`}
                selected={appearance.fontScale === value}
                onPress={() => setAppearance({ ...appearance, fontScale: value })}
              />
            ))}
          </ChipRow>
          <ChipRow>
            <Chip
              theme={theme}
              label={t("settings_theme_changed")}
              selected={appearance.highContrast}
              onPress={() => setAppearance({ ...appearance, highContrast: !appearance.highContrast })}
            />
          </ChipRow>
          <InlineNote theme={theme}>{t("settings_change_restart_msg")}</InlineNote>
        </Card>

        <SectionHeader theme={theme} title={labels.sync ?? t("mobile_settings_sync")} />
        <Card theme={theme} style={styles.columnCard}>
          <KeyValueRow theme={theme} label={t("cloud_sync_status_pending", { n: pending })} value={String(pending)} />
          <KeyValueRow theme={theme} label={t("cloud_sync_status_failed", { n: dead })} value={String(dead)} />
          <Button theme={theme} label={t("cloud_sync_now")} onPress={() => void syncNow()} disabled={busy} />
          {pruned > 0 ? (
            <Text style={[styles.meta, { color: theme.colors.muted }]}>
              {t("mobile_recovery_title")}: {pruned}
            </Text>
          ) : null}
        </Card>

        {deadJobs.length > 0 || conflicts > 0 ? (
          <>
            <SectionHeader theme={theme} title={t("mobile_recovery_title")} />
            <Card theme={theme} style={styles.columnCard}>
              {conflicts > 0 ? (
                <>
                  <Text style={[styles.line, { color: theme.colors.text }]}>
                    {t("mobile_recovery_conflicts")}: {conflicts}
                  </Text>
                  <Button
                    theme={theme}
                    label={t("cloud_conflict_keep_local")}
                    onPress={() => void resolveConflict("local")}
                    disabled={busy}
                  />
                  <Button
                    theme={theme}
                    variant="ghost"
                    label={t("cloud_conflict_use_remote")}
                    onPress={() => void resolveConflict("cloud")}
                    disabled={busy}
                  />
                </>
              ) : null}
              {deadJobs.length > 0 ? (
                <>
                  <InlineNote theme={theme}>{t("mobile_recovery_dead_hint")}</InlineNote>
                  {deadJobs.slice(0, 5).map((job) => (
                    <Text key={job.id} style={[styles.meta, { color: theme.colors.muted }]}>
                      {job.entity_type} · {(job.last_error ?? "").slice(0, 90)}
                    </Text>
                  ))}
                  <Button
                    theme={theme}
                    label={t("mobile_recovery_requeue")}
                    onPress={() => void requeueDead()}
                    disabled={busy}
                  />
                </>
              ) : null}
            </Card>
          </>
        ) : null}

        <SectionHeader theme={theme} title={labels.account ?? t("mobile_settings_account")} />
        <Card theme={theme} style={styles.columnCard}>
          <KeyValueRow theme={theme} label={t("profile_display_name")} value={displayName || "—"} />
          <Button theme={theme} label={t("logout")} variant="danger" onPress={() => setConfirmLogout(true)} />
        </Card>

        <SectionHeader theme={theme} title={labels.about ?? t("mobile_settings_about")} />
        <Card theme={theme} style={styles.columnCard}>
          <Text style={[styles.line, { color: theme.colors.text }]}>
            {t(about.versionLabelKey, { version: about.version })}
          </Text>
          <Text style={[styles.meta, { color: theme.colors.muted }]}>{t("dashboard_footer")}</Text>
        </Card>
      </ScreenShell>

      <BottomSheet
        theme={theme}
        visible={confirmLogout}
        title={t("logout")}
        onClose={() => setConfirmLogout(false)}
        footer={
          <Button theme={theme} label={t("logout")} variant="danger" onPress={() => void logout()} />
        }
      >
        <InlineNote theme={theme}>{t("delete_confirm_msg")}</InlineNote>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  columnCard: { alignItems: "stretch", flexDirection: "column", gap: 10, minHeight: 0 },
  fieldLabel: { fontSize: 12, fontWeight: "700" },
  line: { fontSize: 15, fontWeight: "700" },
  meta: { fontSize: 12 },
});
