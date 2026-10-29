/**
 * M08 wave 3 — layar Pomodoro.
 *
 * Penghitung mundurnya memakai **selisih waktu**, bukan jumlah tick: di ponsel
 * `setInterval` tidak dijamin tepat 1 detik (bisa melambat saat CPU sibuk atau
 * layar mati), jadi penghitung berbasis tick akan membuat "sesi 25 menit"
 * benar-benar berlangsung 27 menit. Dengan menyimpan `endsAt`, sisa waktu
 * selalu benar berapa pun telatnya tick.
 *
 * Fase istirahat murni lokal: backend tidak punya konsep istirahat, jadi ia
 * tidak dicatat dan tidak disinkronkan. Yang dicatat hanya sesi fokus.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

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
import { errorMessage } from "../data/httpApi";
import {
  completePayload,
  estimateReward,
  FOCUS_PRESETS_MIN,
  formatClock,
  initialTimerState,
  isFinished,
  pause,
  pomodoroStats,
  progressPercent,
  readReward,
  remainingMs,
  reset,
  resume,
  sessionsOn,
  setFocusMinutes,
  setLabel,
  startBreak,
  startFocus,
  toPomodoroSessions,
  type TimerState,
} from "../features/pomodoro/model";
import { useTaskList } from "../features/tasks/useTaskList";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

const TICK_MS = 500;

export default function PomodoroScreen() {
  const { theme } = useTheme();
  const list = useTaskList("pomodoro", toPomodoroSessions);

  const [timer, setTimer] = useState<TimerState>(() => initialTimerState(25));
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reward, setReward] = useState<{ xp: number; gold: number; minutes: number } | null>(null);
  // Penjaga supaya satu sesi yang selesai tidak dicatat dua kali: efek bisa
  // berjalan ulang saat komponen dirender ulang, dan `POST` yang terkirim dua
  // kali berarti XP ganda.
  const completing = useRef(false);

  useEffect(() => {
    if (timer.phase !== "focus" && timer.phase !== "break") return;
    const id = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [timer.phase]);

  const finish = useCallback(() => {
    if (completing.current) return;
    if (!list.app) return;
    completing.current = true;
    const payload = completePayload(timer);
    const minutes = Number(payload.durationMinutes) || 25;
    setBusy(true);
    setNotice(null);
    list.app.api
      .post<unknown>("/api/pomodoro/complete", payload)
      .then((raw) => {
        // Kalau respons server tidak memuat XP/Gold, dipakai perkiraan dari
        // rumus yang sama (`database.py:13038`). Angka ini hanya untuk pesan
        // di layar; yang benar-benar masuk ke saldo tetap keputusan server,
        // dan daftar riwayat di bawah akan menampilkannya setelah refresh.
        const parsed = readReward(raw);
        const fallback = estimateReward(minutes);
        setReward({
          xp: parsed?.xp ?? fallback.xp,
          gold: parsed?.gold ?? fallback.gold,
          minutes,
        });
        return list.refresh();
      })
      .catch((err: unknown) => setNotice(t("error_occurred", { error: errorMessage(err) })))
      .finally(() => {
        setBusy(false);
        setTimer((prev) => startBreak(prev, Date.now()));
        setNowMs(Date.now());
        completing.current = false;
      });
  }, [list, timer]);

  // Fokus selesai -> catat. Istirahat selesai -> kembali ke siap fokus.
  useEffect(() => {
    if (!isFinished(timer, nowMs)) return;
    if (timer.phase === "focus") finish();
    else setTimer((prev) => reset(prev));
  }, [finish, nowMs, timer]);

  const todayYmd = list.dateKey;
  const today = useMemo(
    () => (todayYmd ? sessionsOn(list.rows, todayYmd) : []),
    [list.rows, todayYmd],
  );
  const todayStats = useMemo(() => pomodoroStats(today), [today]);
  const totalStats = useMemo(() => pomodoroStats(list.rows), [list.rows]);

  if (list.loading) {
    return <LoadingState theme={theme} title={t("pomodoro_title_plain")} message={t("loading")} />;
  }
  if (!list.online && list.rows.length === 0 && list.error) {
    return (
      <ErrorState
        theme={theme}
        title={t("app_error_title")}
        message={list.error}
        onRetry={() => void list.refresh()}
        retryLabel={t("web_retry")}
      />
    );
  }

  const running = timer.phase === "focus" || timer.phase === "break";
  const estimate = estimateReward(timer.focusMinutes);

  return (
    <ScreenShell
      theme={theme}
      title={t("pomodoro_title_plain")}
      subtitle={t("pomodoro_subtitle")}
      onRefresh={() => void list.refresh()}
      refreshing={list.refreshing}
      offlineNotice={!list.online ? t("mobile_offline_banner") : notice}
    >
      <Card theme={theme} style={styles.timerCard}>
        <Text style={[styles.stateLabel, { color: theme.colors.muted }]}>
          {timer.phase === "focus"
            ? t("pomodoro_state_focus")
            : timer.phase === "break"
              ? t("pomodoro_state_break")
              : t("pomodoro_state_idle")}
        </Text>
        <Text
          style={[
            styles.clock,
            { color: timer.phase === "break" ? theme.colors.accent2 : theme.colors.text },
          ]}
          accessibilityLabel={formatClock(remainingMs(timer, nowMs))}
        >
          {formatClock(remainingMs(timer, nowMs))}
        </Text>
        <ProgressBar
          theme={theme}
          percent={progressPercent(timer, nowMs)}
          label={
            timer.phase === "break"
              ? t("pomodoro_break_label")
              : `${t("pomodoro_focus_label")} · ${timer.focusMinutes} ${t("pomodoro_minutes_unit")}`
          }
          detail={`+${estimate.xp} XP / +${estimate.gold} G`}
          color={timer.phase === "break" ? theme.colors.accent2 : theme.colors.primary}
        />
        {reward ? (
          <InlineNote theme={theme}>
            {t("pomodoro_complete_msg", { xp: reward.xp, gold: reward.gold, mins: reward.minutes })}
          </InlineNote>
        ) : null}
      </Card>

      {timer.phase === "idle" || timer.phase === "paused" ? (
        <>
          <ChipRow>
            {FOCUS_PRESETS_MIN.map((mins) => (
              <Chip
                key={mins}
                theme={theme}
                label={`${mins} ${t("pomodoro_minutes_unit")}`}
                selected={timer.focusMinutes === mins}
                onPress={() => setTimer((prev) => setFocusMinutes(prev, mins))}
              />
            ))}
          </ChipRow>
          <TextField
            theme={theme}
            label={t("pomodoro_task_label")}
            value={timer.label}
            onChangeText={(label) => setTimer((prev) => setLabel(prev, label))}
            placeholder={t("pomodoro_task_placeholder")}
          />
        </>
      ) : null}

      <Card theme={theme} style={styles.buttonRow}>
        {timer.phase === "idle" ? (
          <Button
            theme={theme}
            label={t("pomodoro_start")}
            onPress={() => {
              setReward(null);
              setNowMs(Date.now());
              setTimer((prev) => startFocus(prev, Date.now()));
            }}
          />
        ) : null}
        {timer.phase === "focus" || timer.phase === "break" ? (
          <Button
            theme={theme}
            label={t("pomodoro_pause")}
            onPress={() => setTimer((prev) => pause(prev, Date.now()))}
          />
        ) : null}
        {timer.phase === "paused" ? (
          <>
            <Button
              theme={theme}
              label={t("pomodoro_resume")}
              onPress={() => {
                setNowMs(Date.now());
                setTimer((prev) => resume(prev, Date.now()));
              }}
            />
            <Button
              theme={theme}
              variant="ghost"
              label={t("pomodoro_give_up")}
              onPress={() => {
                completing.current = false;
                setTimer((prev) => reset(prev));
              }}
            />
          </>
        ) : null}
        {running ? (
          <Button
            theme={theme}
            variant="ghost"
            label={t("pomodoro_reset")}
            onPress={() => {
              completing.current = false;
              setTimer((prev) => reset(prev));
            }}
            disabled={busy}
          />
        ) : null}
      </Card>

      <StatRow>
        <StatTile
          theme={theme}
          label={t("pomodoro_today")}
          value={t("pomodoro_stat_sessions", { n: todayStats.sessions })}
          accent
        />
        <StatTile
          theme={theme}
          label={t("pomodoro_today")}
          value={t("pomodoro_stat_minutes", { n: todayStats.minutes })}
        />
        <StatTile
          theme={theme}
          label={t("pomodoro_total")}
          value={t("pomodoro_stat_sessions", { n: totalStats.sessions })}
        />
      </StatRow>

      <SectionHeader theme={theme} title={t("pomodoro_recent")} />
      {list.rows.length === 0 ? (
        <InlineNote theme={theme}>{t("pomodoro_no_recent")}</InlineNote>
      ) : (
        <Stack>
          {list.rows.slice(0, 12).map((row) => (
            <Card key={row.id} theme={theme}>
              <View style={styles.body}>
                <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
                  {row.label !== "" ? row.label : t("pomodoro_focus_chamber")}
                </Text>
                <Text style={[styles.meta, { color: theme.colors.muted }]}>
                  {`${row.completedAt} · ${row.durationMinutes} ${t("pomodoro_minutes_unit")}`}
                </Text>
              </View>
              <Text style={[styles.reward, { color: theme.colors.accent2 }]}>
                {`+${row.xpEarned} XP · +${row.goldEarned} G`}
              </Text>
            </Card>
          ))}
        </Stack>
      )}

      <InlineNote theme={theme}>{t("mobile_pomodoro_break_local")}</InlineNote>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  timerCard: { alignItems: "stretch", flexDirection: "column", gap: 10, minHeight: 0 },
  stateLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 0.6 },
  clock: { fontSize: 52, fontWeight: "900", textAlign: "center", fontVariant: ["tabular-nums"] },
  buttonRow: { alignItems: "stretch", flexDirection: "column", gap: 10, minHeight: 0 },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: "700" },
  meta: { fontSize: 12 },
  reward: { fontSize: 13, fontWeight: "800" },
});
