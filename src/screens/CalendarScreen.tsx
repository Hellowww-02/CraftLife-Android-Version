/**
 * M08 wave 3 — layar Calendar.
 *
 * Kisi bulan 6×7 dengan tinggi tetap, catatan per tanggal, dan hari libur
 * nasional dari `GET /api/holidays` (backend mengirim tiga tahun sekaligus).
 *
 * "Hari ini" dan bulan awal berasal dari **jam server**. Kalau jam ponsel
 * salah satu bulan, kalender yang terbuka di bulan yang salah akan terasa
 * seperti bug acak yang tidak bisa direproduksi.
 *
 * Menyimpan catatan kosong = menghapus (`life_api.py:1665`). Itu perilaku
 * desktop dan dipertahankan di sini, jadi tidak ada tombol hapus terpisah yang
 * bisa bertentangan dengannya.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { BottomSheet } from "../components/ui/BottomSheet";
import {
  Button,
  Card,
  InlineNote,
  KeyValueRow,
  SectionHeader,
  TextField,
} from "../components/ui/primitives";
import { ScreenShell, Stack } from "../components/ui/ScreenShell";
import { ErrorState, LoadingState } from "../components/states";
import { errorMessage } from "../data/httpApi";
import { loadRemote } from "../data/taskActions";
import { useRemote } from "../data/useRemote";
import {
  CALENDAR_PATH,
  calendarNotePayload,
  dayDetail,
  monthCells,
  monthHasNotes,
  monthHolidays,
  monthLabelKey,
  parseCalendarPayload,
  parseHolidaysPayload,
  shiftMonth,
  toYmd,
  WEEKDAY_HEADER_KEYS,
} from "../features/calendar/model";
import { getLang, t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

export default function CalendarScreen() {
  const { theme } = useTheme();
  const notes = useRemote(CALENDAR_PATH, parseCalendarPayload);

  const [holidays, setHolidays] = useState<Map<string, string>>(new Map());
  const [cursor, setCursor] = useState<{ year: number; month1: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const todayYmd = useMemo(() => {
    const now = notes.app ? notes.app.clock.nowDate() : null;
    return now ? toYmd(now.getFullYear(), now.getMonth() + 1, now.getDate()) : null;
  }, [notes.app]);

  // Bulan awal = bulan "hari ini" menurut server. Baru dihitung setelah jam
  // server tersedia, supaya tidak sempat membuka bulan yang salah.
  useEffect(() => {
    if (cursor !== null || todayYmd === null) return;
    const now = notes.app?.clock.nowDate();
    if (!now) return;
    setCursor({ year: now.getFullYear(), month1: now.getMonth() + 1 });
  }, [cursor, notes.app, todayYmd]);

  // Hari libur dimuat terpisah: endpoint-nya beda dan isinya jarang berubah.
  useEffect(() => {
    let alive = true;
    const app = notes.app;
    if (!app || cursor === null) return;
    void loadRemote<unknown>(app.api, `/api/holidays?year=${cursor.year}`).then((res) => {
      if (!alive || res.data === null) return;
      const parsed = parseHolidaysPayload(res.data, getLang() === "id" ? "id" : "en");
      if (parsed) setHolidays(parsed);
    });
    return () => {
      alive = false;
    };
  }, [cursor, notes.app]);

  const noteMap = useMemo(() => notes.data ?? new Map<string, string>(), [notes.data]);

  const cells = useMemo(
    () => (cursor ? monthCells(cursor.year, cursor.month1, todayYmd) : []),
    [cursor, todayYmd],
  );
  const marked = useMemo(() => monthHasNotes(cells, noteMap), [cells, noteMap]);
  const holidayList = useMemo(() => monthHolidays(cells, holidays), [cells, holidays]);

  const closeSheet = useCallback(() => setSelected(null), []);

  const openDay = useCallback(
    (ymd: string) => {
      setSelected(ymd);
      setDraftNote(noteMap.get(ymd) ?? "");
    },
    [noteMap],
  );

  const save = useCallback(() => {
    if (selected === null || !notes.app) {
      setNotice(t("web_api_offline"));
      return;
    }
    setBusy(true);
    setNotice(null);
    notes.app.api
      .post("/api/calendar/note", calendarNotePayload(selected, draftNote))
      .then(() => notes.reload())
      .catch((err: unknown) => setNotice(t("error_occurred", { error: errorMessage(err) })))
      .finally(() => {
        setBusy(false);
        setSelected(null);
      });
  }, [draftNote, notes, selected]);

  if (notes.loading || cursor === null) {
    return <LoadingState theme={theme} title={t("calendar_title")} message={t("loading")} />;
  }
  if (!notes.data) {
    return (
      <ErrorState
        theme={theme}
        title={t("app_error_title")}
        message={notes.error ?? t("web_api_offline")}
        onRetry={() => void notes.refresh()}
        retryLabel={t("web_retry")}
      />
    );
  }

  const detail = selected ? dayDetail(selected, noteMap, holidays, todayYmd) : null;
  const offlineNotice = !notes.online ? t("mobile_offline_banner") : notice;

  return (
    <>
      <ScreenShell
        theme={theme}
        title={t("calendar_title")}
        subtitle={`${t(monthLabelKey(cursor.month1))} ${cursor.year}`}
        onRefresh={() => void notes.refresh()}
        refreshing={notes.refreshing}
        offlineNotice={offlineNotice}
      >
        <Card theme={theme} style={styles.monthNav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("mobile_calendar_prev")}
            onPress={() => setCursor(shiftMonth(cursor.year, cursor.month1, -1))}
            style={styles.navButton}
          >
            <Text style={[styles.navGlyph, { color: theme.colors.text }]}>‹</Text>
          </Pressable>
          <Text style={[styles.monthTitle, { color: theme.colors.text }]}>
            {`${t(monthLabelKey(cursor.month1))} ${cursor.year}`}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("mobile_calendar_next")}
            onPress={() => setCursor(shiftMonth(cursor.year, cursor.month1, 1))}
            style={styles.navButton}
          >
            <Text style={[styles.navGlyph, { color: theme.colors.text }]}>›</Text>
          </Pressable>
        </Card>

        <Card theme={theme} style={styles.gridCard}>
          <View style={styles.weekHeader}>
            {WEEKDAY_HEADER_KEYS.map((key) => (
              <Text key={key} style={[styles.weekHeaderCell, { color: theme.colors.muted }]}>
                {t(key)}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((cell) => {
              const isHoliday = holidays.has(cell.ymd);
              const selectedCell = selected === cell.ymd;
              return (
                <Pressable
                  key={cell.ymd}
                  accessibilityRole="button"
                  accessibilityLabel={`${cell.ymd}${marked.has(cell.ymd) ? `, ${t("mobile_calendar_has_note")}` : ""}`}
                  onPress={() => openDay(cell.ymd)}
                  style={[
                    styles.cell,
                    selectedCell ? { backgroundColor: theme.colors.bg3, borderRadius: 8 } : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.cellDay,
                      {
                        color: !cell.inMonth
                          ? theme.colors.muted
                          : cell.isToday
                            ? theme.colors.onPrimary
                            : theme.colors.text,
                      },
                      cell.isToday ? styles.today : null,
                    ]}
                  >
                    {cell.day}
                  </Text>
                  <View style={styles.dots}>
                    {marked.has(cell.ymd) ? (
                      <View style={[styles.dot, { backgroundColor: theme.colors.primary }]} />
                    ) : null}
                    {isHoliday ? (
                      <View style={[styles.dot, { backgroundColor: theme.colors.accent2 }]} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {holidayList.length > 0 ? (
          <Card theme={theme} style={styles.column}>
            <SectionHeader theme={theme} title={t("mobile_calendar_holidays")} />
            <Stack>
              {holidayList.map((h) => (
                <KeyValueRow key={h.ymd} theme={theme} label={h.ymd} value={h.name} />
              ))}
            </Stack>
          </Card>
        ) : null}

        <InlineNote theme={theme}>{t("mobile_calendar_hint")}</InlineNote>
      </ScreenShell>

      <BottomSheet
        theme={theme}
        visible={detail !== null}
        title={detail ? t("calendar_note_title", { date: detail.ymd }) : ""}
        onClose={closeSheet}
        footer={<Button theme={theme} label={t("web_cal_save_note")} onPress={save} disabled={busy} />}
      >
        {detail ? (
          <>
            {detail.holiday ? (
              <InlineNote theme={theme}>{t("calendar_holiday_info", { name: detail.holiday })}</InlineNote>
            ) : null}
            <TextField
              theme={theme}
              label={t("calendar_note_label")}
              value={draftNote}
              onChangeText={setDraftNote}
              placeholder={t("calendar_note_placeholder")}
              multiline
            />
            <InlineNote theme={theme}>{t("mobile_calendar_empty_deletes")}</InlineNote>
          </>
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: "stretch", flexDirection: "column", gap: 8, minHeight: 0 },
  monthNav: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  navButton: { alignItems: "center", justifyContent: "center", minHeight: 44, width: 44 },
  navGlyph: { fontSize: 26, fontWeight: "700" },
  monthTitle: { fontSize: 16, fontWeight: "800" },
  gridCard: { alignItems: "stretch", flexDirection: "column", gap: 6, minHeight: 0 },
  weekHeader: { flexDirection: "row" },
  weekHeaderCell: { flex: 1, fontSize: 11, fontWeight: "800", textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: "14.2857%",
  },
  cellDay: { fontSize: 14, fontWeight: "700" },
  today: { fontWeight: "900" },
  dots: { flexDirection: "row", gap: 3, height: 6 },
  dot: { borderRadius: 3, height: 5, width: 5 },
});
