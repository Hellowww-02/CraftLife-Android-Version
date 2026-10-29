/**
 * M08 wave 2 — layar Economy (transaksi masuk/keluar).
 *
 * Aturan uang yang paling mudah salah, diulang di sini karena inilah satu-
 * satunya tempat nominal ditulis ke layar:
 *
 *   • BARIS dari server berisi IDR apa adanya.
 *   • TAMPIL selalu lewat `formatMoney(idr, currency)` dari `@craftlife/core`
 *     (P2). Mata uang pengguna diambil dari `/api/me`.
 *   • SIMPAN mengirim angka yang DIKETIK pengguna dalam mata uang aktifnya;
 *     `life_api.py::_to_idr` yang mengubahnya ke IDR.
 *
 * Kalau salah satu dari tiga itu dilewat, nominal akan salah berlipat setiap
 * kali mata uang pengguna bukan IDR.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionList, BottomSheet, type SheetAction } from "../components/ui/BottomSheet";
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
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { loadRemote, writeTask, type WriteOutcome } from "../data/taskActions";
import {
  draftError as txDraftError,
  emptyTxDraft,
  filterByPeriod,
  groupByDate,
  money,
  PERIOD_LABEL_KEY,
  QUICK_CATEGORIES,
  toTxRows,
  txPayload,
  txTotals,
  type PeriodKey,
  type TxDraft,
  type TxRow,
} from "../features/economy/model";
import { toUserSummary } from "../features/dashboard/model";
import { useTaskList } from "../features/tasks/useTaskList";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

const PERIODS: readonly PeriodKey[] = ["7", "30", "90", "all"] as const;

type SheetMode =
  | { kind: "closed" }
  | { kind: "actions"; row: TxRow }
  | { kind: "form"; draft: TxDraft };

export default function EconomyScreen() {
  const { theme } = useTheme();
  const list = useTaskList<TxRow>("economy", toTxRows);
  const [period, setPeriod] = useState<PeriodKey>("30");
  const [sheet, setSheet] = useState<SheetMode>({ kind: "closed" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // IDR dipakai saat mata uang pengguna belum diketahui. Bukan tebakan
  // sembarangan: database memang menyimpan IDR, jadi fallback ini benar.
  const [currency, setCurrency] = useState("IDR");

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const app = list.app;
        if (!app) return;
        const me = await loadRemote<{ user?: unknown }>(app.api, "/api/me");
        const summary = me.data ? toUserSummary(me.data.user) : null;
        if (alive && summary) setCurrency(summary.currency || "IDR");
      } catch {
        // Mata uang gagal dimuat tidak boleh mematikan layar; tetap IDR.
      }
    })();
    return () => {
      alive = false;
    };
  }, [list.app]);

  const closeSheet = useCallback(() => setSheet({ kind: "closed" }), []);

  const runWrite = useCallback(
    async (outcome: Promise<WriteOutcome>) => {
      setBusy(true);
      try {
        const result = await outcome;
        setNotice(
          result.kind === "failed"
            ? t("error_occurred", { error: result.reason })
            : result.kind === "queued"
              ? t("mobile_saved_offline")
              : null,
        );
        await list.reload();
      } finally {
        setBusy(false);
      }
    },
    [list],
  );

  const remove = useCallback(
    (row: TxRow) => {
      if (!list.app) return;
      closeSheet();
      void runWrite(
        writeTask(
          { api: list.app.api, repo: list.app.repo },
          {
            path: `/api/economy/${row.id}/delete`,
            body: {},
            entityType: "economy",
            entityId: row.id,
            nextPayload: null,
            previousPayload: row,
          },
        ),
      );
    },
    [closeSheet, list, runWrite],
  );

  const saveDraft = useCallback(() => {
    if (sheet.kind !== "form" || !list.app) return;
    const problem = txDraftError(sheet.draft);
    if (problem === "empty-name") {
      setNotice(t("msg_name_empty"));
      return;
    }
    if (problem === "bad-amount") {
      setNotice(t("economy_amount_gt_zero"));
      return;
    }
    const body = txPayload(sheet.draft);
    closeSheet();
    // Transaksi baru butuh id dari server untuk bisa di-outbox, jadi
    // pembuatannya butuh jaringan — sama seperti menambah aktivitas sport.
    setBusy(true);
    list.app.api
      .post("/api/economy", body)
      .then(() => list.refresh())
      .catch((err: unknown) =>
        setNotice(t("error_occurred", { error: err instanceof Error ? err.message : String(err) })),
      )
      .finally(() => setBusy(false));
  }, [closeSheet, list, sheet]);

  const actionsFor = useCallback(
    (row: TxRow): SheetAction[] => [
      {
        key: "delete",
        label: t("task_delete_title"),
        icon: "🗑",
        destructive: true,
        onPress: () => remove(row),
      },
    ],
    [remove],
  );

  const visible = useMemo(
    () => filterByPeriod(list.rows, period, list.dateKey),
    [list.dateKey, list.rows, period],
  );
  const totals = useMemo(() => txTotals(visible), [visible]);
  const groups = useMemo(() => groupByDate(visible), [visible]);

  if (list.loading) {
    return <LoadingState theme={theme} title={t("nav_economy")} message={t("loading")} />;
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

  // Bar "net" memakai total belanja sebagai penyebut supaya lebar bar punya
  // arti (berapa bagian dari pengeluaran yang sudah tertutup pemasukan).
  const covered = totals.expenseIdr > 0 ? totals.incomeIdr / totals.expenseIdr : 0;

  return (
    <>
      <ScreenShell
        theme={theme}
        title={t("nav_economy")}
        subtitle={t("economy_total_label")}
        onRefresh={() => void list.refresh()}
        refreshing={list.refreshing}
        offlineNotice={!list.online ? t("mobile_offline_banner") : notice}
        fab={{
          icon: "+",
          label: t("economy_new_transaction"),
          onPress: () => setSheet({ kind: "form", draft: emptyTxDraft() }),
        }}
      >
        <ChipRow>
          {PERIODS.map((key) => (
            <Chip
              key={key}
              theme={theme}
              label={t(PERIOD_LABEL_KEY[key])}
              selected={period === key}
              onPress={() => setPeriod(key)}
            />
          ))}
        </ChipRow>

        <StatRow>
          <StatTile theme={theme} label={t("economy_total_income_label")} value={money(totals.incomeIdr, currency)} />
          <StatTile theme={theme} label={t("economy_total_expense_label")} value={money(totals.expenseIdr, currency)} accent />
        </StatRow>

        <Card theme={theme} style={styles.column}>
          <ProgressBar
            theme={theme}
            percent={Math.max(0, Math.min(100, Math.round(covered * 100)))}
            label={t("economy_net_balance_label")}
            detail={money(totals.netIdr, currency)}
          />
        </Card>

        {visible.length === 0 ? (
          <EmptyState
            theme={theme}
            title={t("economy_tab_transactions")}
            message={t("economy_empty_transactions")}
            actionLabel={t("economy_new_transaction")}
            onAction={() => setSheet({ kind: "form", draft: emptyTxDraft() })}
          />
        ) : (
          <Stack>
            {groups.map((group) => (
              <View key={group.date} style={styles.group}>
                <SectionHeader
                  theme={theme}
                  title={group.date}
                  trailing={
                    <Text style={[styles.groupNet, { color: theme.colors.muted }]}>
                      {money(group.netIdr, currency)}
                    </Text>
                  }
                />
                <Stack>
                  {group.rows.map((row) => (
                    <Card
                      key={row.id}
                      theme={theme}
                      onLongPress={() => setSheet({ kind: "actions", row })}
                      accessibilityLabel={`${row.name}, ${money(row.amountIdr, currency)}`}
                    >
                      <Text style={styles.icon} accessibilityElementsHidden>
                        {row.icon}
                      </Text>
                      <View style={styles.body}>
                        <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={2}>
                          {row.name}
                        </Text>
                        {row.category !== "" ? (
                          <Text style={[styles.meta, { color: theme.colors.muted }]}>
                            {row.category}
                          </Text>
                        ) : null}
                      </View>
                      <Text
                        style={[
                          styles.amount,
                          // Palet M06 tidak punya warna semantik success/danger
                          // (16 field saja). accent2 dipakai untuk "baik" dan
                          // accent3 untuk "perlu perhatian", sama seperti
                          // DashboardScreen dan SyncStatusBar. Tanda +/- tetap
                          // jadi penanda utama supaya tidak bergantung warna.
                          { color: row.type === "income" ? theme.colors.accent2 : theme.colors.accent3 },
                        ]}
                      >
                        {`${row.type === "income" ? "+" : "−"}${money(row.amountIdr, currency)}`}
                      </Text>
                    </Card>
                  ))}
                </Stack>
              </View>
            ))}
            <InlineNote theme={theme}>{t("mobile_long_press_hint")}</InlineNote>
          </Stack>
        )}
      </ScreenShell>

      <BottomSheet
        theme={theme}
        visible={sheet.kind === "actions"}
        title={sheet.kind === "actions" ? sheet.row.name : ""}
        onClose={closeSheet}
      >
        {sheet.kind === "actions" ? (
          <ActionList theme={theme} actions={actionsFor(sheet.row)} />
        ) : null}
      </BottomSheet>

      <BottomSheet
        theme={theme}
        visible={sheet.kind === "form"}
        title={t("economy_new_transaction")}
        onClose={closeSheet}
        footer={<Button theme={theme} label={t("economy_save_btn")} onPress={saveDraft} disabled={busy} />}
      >
        {sheet.kind === "form" ? (
          <>
            {/* Tanpa label grup: kedua chip sudah memakai kata lengkap
                ("Pemasukan"/"Pengeluaran"), jadi judul di atasnya hanya
                mengulang dan menambah satu baris. */}
            <View style={styles.fieldGroup}>
              <ChipRow>
                <Chip
                  theme={theme}
                  label={t("economy_total_income_label")}
                  selected={sheet.draft.type === "income"}
                  onPress={() => setSheet({ kind: "form", draft: { ...sheet.draft, type: "income" } })}
                />
                <Chip
                  theme={theme}
                  label={t("economy_total_expense_label")}
                  selected={sheet.draft.type === "expense"}
                  onPress={() => setSheet({ kind: "form", draft: { ...sheet.draft, type: "expense" } })}
                />
              </ChipRow>
            </View>
            <TextField
              theme={theme}
              label={t("economy_tx_name_ph")}
              value={sheet.draft.name}
              onChangeText={(name) => setSheet({ kind: "form", draft: { ...sheet.draft, name } })}
              placeholder={t("economy_tx_name_ph")}
            />
            <TextField
              theme={theme}
              label={t("economy_amount_currency_label", { currency })}
              value={sheet.draft.amountInput}
              onChangeText={(amountInput) =>
                setSheet({ kind: "form", draft: { ...sheet.draft, amountInput } })
              }
              placeholder="0"
            />
            <InlineNote theme={theme}>
              {t("mobile_economy_currency_hint", { currency })}
            </InlineNote>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                {t("economy_category_label")}
              </Text>
              <ChipRow>
                {QUICK_CATEGORIES.map((cat) => (
                  <Chip
                    key={cat.value}
                    theme={theme}
                    label={t(cat.labelKey)}
                    selected={sheet.draft.category === cat.value}
                    onPress={() =>
                      setSheet({ kind: "form", draft: { ...sheet.draft, category: cat.value } })
                    }
                  />
                ))}
              </ChipRow>
            </View>
            <TextField
              theme={theme}
              label={t("economy_notes_label")}
              value={sheet.draft.notes}
              onChangeText={(notes) => setSheet({ kind: "form", draft: { ...sheet.draft, notes } })}
              placeholder={t("economy_tx_notes_ph")}
              multiline
            />
          </>
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: "stretch", flexDirection: "column", gap: 10, minHeight: 0 },
  group: { gap: 8 },
  groupNet: { fontSize: 12, fontWeight: "700" },
  icon: { fontSize: 20 },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: "700" },
  meta: { fontSize: 12 },
  amount: { fontSize: 14, fontWeight: "800" },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: "700" },
});
