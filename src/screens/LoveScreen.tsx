/**
 * M10 — layar Love Space: Profil, Kenangan, Check-in, Acara, Bucket, Siklus.
 *
 * Seluruh isi datang dari `/api/love` (snapshot yang dibentuk server dari
 * data lokal + mirror couple cloud). Saat pasangan tertaut cloud, server
 * menyegarkan mirror itu lebih dulu, jadi dua partner melihat data yang
 * sama. Menambah kenangan/acara/bucket dan check-in memakai route POST
 * yang sama dengan desktop — saat tertaut, server meneruskannya ke cloud
 * agar partner ikut melihat. Foto tampil sebagai metadata (judul &
 * tanggal); berkas gambarnya sendiri tetap lewat jalur unduh desktop.
 */

import React, { useCallback, useState } from "react";
import { StyleSheet, Text } from "react-native";

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
import { parseLove } from "../features/social/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

type Tab = "profile" | "memories" | "checkin" | "events" | "bucket" | "cycle";

const MOODS = ["1", "2", "3", "4", "5"];

export default function LoveScreen() {
  const { theme } = useTheme();
  const remote = useRemote("/api/love", parseLove);
  const [tab, setTab] = useState<Tab>("profile");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const api = remote.app?.api;

  const [memoryTitle, setMemoryTitle] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [bucketTitle, setBucketTitle] = useState("");
  const [mood, setMood] = useState("5");
  const [checkinNote, setCheckinNote] = useState("");

  const run = useCallback(
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

  if (remote.loading && !remote.data) {
    return (
      <LoadingState theme={theme} title={t("nav_love")} message={t("loading")} />
    );
  }
  if (remote.error && !remote.data) {
    return (
      <ErrorState
        theme={theme}
        title={t("nav_love")}
        message={remote.error}
        retryLabel={t("web_retry")}
        onRetry={() => void remote.reload()}
      />
    );
  }

  const love = remote.data;
  const today = new Date().toISOString().slice(0, 10);

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "profile", label: t("mobile_love_profile") },
    { key: "memories", label: t("mobile_love_memories") },
    { key: "checkin", label: t("mobile_love_checkin") },
    { key: "events", label: t("mobile_love_events") },
    { key: "bucket", label: t("mobile_love_bucket") },
    { key: "cycle", label: t("mobile_love_cycle") },
  ];

  return (
    <ScreenShell
      theme={theme}
      title={t("nav_love")}
      onRefresh={() => void remote.reload()}
      refreshing={remote.refreshing}
      offlineNotice={remote.online ? null : t("mobile_offline_banner")}
    >
      <Stack>
        <ChipRow>
          {tabs.map((item) => (
            <Chip
              key={item.key}
              theme={theme}
              label={item.label}
              selected={tab === item.key}
              onPress={() => setTab(item.key)}
            />
          ))}
        </ChipRow>
        {notice ? <InlineNote theme={theme}>{notice}</InlineNote> : null}

        {tab === "profile" && love ? (
          <Card theme={theme}>
            <Text style={[styles.name, { color: theme.colors.text }]}>
              {love.myName || "—"} 💖 {love.partnerName || "—"}
            </Text>
            <Text style={[styles.meta, { color: theme.colors.muted }]}>
              {love.startDate} · {t("love_daily_checkin")}: {love.connectionScore}
            </Text>
            <Text style={[styles.meta, { color: theme.colors.muted }]}>
              📷 {love.photos.length} · {love.photos[0]?.caption ?? ""}
            </Text>
          </Card>
        ) : null}

        {tab === "memories" && love ? (
          <>
            {love.memories.length === 0 ? (
              <EmptyState theme={theme} title={t("mobile_love_memories")} message={t("love_bucket_empty")} />
            ) : (
              love.memories.map((m) => (
                <Card key={m.id} theme={theme}>
                  <Text style={[styles.name, { color: theme.colors.text }]}>
                    {m.emoji} {m.title}
                    {m.isFavorite ? " ⭐" : ""}
                  </Text>
                  <Text style={[styles.meta, { color: theme.colors.muted }]}>
                    {m.date} · {m.description}
                  </Text>
                </Card>
              ))
            )}
            <Card theme={theme}>
              <TextField
                theme={theme}
                label={t("mobile_love_memories")}
                value={memoryTitle}
                onChangeText={setMemoryTitle}
                placeholder={t("mobile_love_memories")}
              />
              <Button
                theme={theme}
                label={t("quick_add_add")}
                disabled={busy || memoryTitle.trim() === ""}
                onPress={() => {
                  void run("/api/love/memories", {
                    title: memoryTitle.trim(),
                    date: today,
                  });
                  setMemoryTitle("");
                }}
              />
            </Card>
          </>
        ) : null}

        {tab === "checkin" && love ? (
          <>
            {love.checkins.slice(0, 7).map((c) => (
              <Card key={c.id} theme={theme}>
                <Text style={[styles.name, { color: theme.colors.text }]}>{c.date}</Text>
                <Text style={[styles.meta, { color: theme.colors.muted }]}>
                  😊 {c.myMood}/5 · 💖 {c.partnerMood}/5 · 🔗 {c.connectionScore}/5 · {c.note}
                </Text>
              </Card>
            ))}
            <Card theme={theme}>
              <ChipRow>
                {MOODS.map((m) => (
                  <Chip
                    key={m}
                    theme={theme}
                    label={m}
                    selected={mood === m}
                    onPress={() => setMood(m)}
                  />
                ))}
              </ChipRow>
              <TextField
                theme={theme}
                label={t("love_daily_checkin")}
                value={checkinNote}
                onChangeText={setCheckinNote}
                placeholder={t("love_daily_checkin")}
              />
              <Button
                theme={theme}
                label={t("love_save_checkin")}
                disabled={busy}
                onPress={() =>
                  void run("/api/love/checkin", {
                    date: today,
                    myMood: Number(mood),
                    partnerMood: Number(mood),
                    connectionScore: Number(mood),
                    note: checkinNote.trim(),
                  })
                }
              />
            </Card>
          </>
        ) : null}

        {tab === "events" && love ? (
          <>
            {love.events.map((e) => (
              <Card key={e.id} theme={theme}>
                <Text style={[styles.name, { color: theme.colors.text }]}>
                  {e.isSpecial ? "⭐ " : ""}{e.title}
                </Text>
                <Text style={[styles.meta, { color: theme.colors.muted }]}>
                  {e.date} · {e.category}
                </Text>
              </Card>
            ))}
            <Card theme={theme}>
              <TextField
                theme={theme}
                label={t("mobile_love_events")}
                value={eventTitle}
                onChangeText={setEventTitle}
                placeholder={t("mobile_love_events")}
              />
              <Button
                theme={theme}
                label={t("quick_add_add")}
                disabled={busy || eventTitle.trim() === ""}
                onPress={() => {
                  void run("/api/love/events", {
                    title: eventTitle.trim(),
                    date: today,
                  });
                  setEventTitle("");
                }}
              />
            </Card>
          </>
        ) : null}

        {tab === "bucket" && love ? (
          <>
            {love.bucket.map((b) => (
              <Card key={b.id} theme={theme}>
                <Text style={[styles.name, { color: theme.colors.text }]}>
                  {b.isCompleted ? "✅" : "⬜"} {b.title}
                </Text>
                <Text style={[styles.meta, { color: theme.colors.muted }]}>
                  {b.category} · {b.targetDate}
                </Text>
                <Button
                  theme={theme}
                  variant="ghost"
                  label={b.isCompleted ? t("love_bucket_mark_open") : t("love_bucket_mark_done")}
                  disabled={busy}
                  onPress={() =>
                    void run(`/api/love/bucket/${b.id}/toggle`, {})
                  }
                />
              </Card>
            ))}
            <Card theme={theme}>
              <TextField
                theme={theme}
                label={t("love_bucket_add")}
                value={bucketTitle}
                onChangeText={setBucketTitle}
                placeholder={t("love_bucket_add")}
              />
              <Button
                theme={theme}
                label={t("quick_add_add")}
                disabled={busy || bucketTitle.trim() === ""}
                onPress={() => {
                  void run("/api/love/bucket", { title: bucketTitle.trim() });
                  setBucketTitle("");
                }}
              />
            </Card>
          </>
        ) : null}

        {tab === "cycle" && love ? (
          <>
            <SectionHeader theme={theme} title={t("mobile_love_cycle")} />
            {love.cycles.length === 0 ? (
              <EmptyState theme={theme} title={t("mobile_love_cycle")} message={t("love_bucket_empty")} />
            ) : (
              love.cycles.map((c) => (
                <Card key={c.id} theme={theme}>
                  <Text style={[styles.name, { color: theme.colors.text }]}>
                    {c.startDate} → {c.endDate || "…"}
                  </Text>
                  <Text style={[styles.meta, { color: theme.colors.muted }]}>
                    {c.lengthDays !== null ? `${c.lengthDays} ${t("task_streak_days")}` : ""}
                  </Text>
                </Card>
              ))
            )}
          </>
        ) : null}
      </Stack>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 15, fontWeight: "700" },
  meta: { fontSize: 12 },
});
