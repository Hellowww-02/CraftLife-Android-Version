/**
 * M08 wave 3 — layar Supplies (stok barang).
 *
 * Tiga aksi utama, semuanya pola mobile:
 *   • tap kartu  → sheet transaksi stok (masuk / keluar);
 *   • tekan lama → sheet aksi (edit, transaksi, hapus);
 *   • FAB        → tambah barang.
 *
 * Harga mengikuti aturan mata uang yang sama dengan Economy: baris dari server
 * berisi IDR, tampilan lewat `formatMoney`, dan yang dikirim saat menyimpan
 * adalah angka dalam mata uang pengguna (`_to_idr` yang mengonversi).
 */

import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionList, BottomSheet, type SheetAction } from "../components/ui/BottomSheet";
import {
  Button,
  Card,
  Chip,
  ChipRow,
  InlineNote,
  ProgressBar,
  TextField,
} from "../components/ui/primitives";
import { ScreenShell, Stack, StatRow, StatTile } from "../components/ui/ScreenShell";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { useCurrency } from "../data/useCurrency";
import { writeTask, type WriteOutcome } from "../data/taskActions";
import { money } from "../features/economy/model";
import {
  applyTx,
  categoryNames,
  draftError as supplyDraftError,
  draftFromRow,
  emptySupplyDraft,
  filterSupplies,
  lowStockRows,
  stockState,
  supplyPayload,
  supplyTotals,
  supplyTxPayload,
  toSupplyRows,
  txError,
  txDraftFor,
  type SupplyDraft,
  type SupplyRow,
  type SupplyTxDraft,
} from "../features/supplies/model";
import { useTaskList } from "../features/tasks/useTaskList";
import { t } from "../i18n";
import { parseMoneyInput } from "@craftlife/core";
import { useTheme } from "../theme/ThemeProvider";

type SheetMode =
  | { kind: "closed" }
  | { kind: "actions"; row: SupplyRow }
  | { kind: "tx"; draft: SupplyTxDraft }
  | { kind: "form"; draft: SupplyDraft };

export default function SuppliesScreen() {
  const { theme } = useTheme();
  const list = useTaskList<SupplyRow>("supplies", toSupplyRows);
  const currency = useCurrency(list.app);

  const [sheet, setSheet] = useState<SheetMode>({ kind: "closed" });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [onlyLow, setOnlyLow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const closeSheet = useCallback(() => setSheet({ kind: "closed" }), []);

  const categories = useMemo(() => categoryNames(list.rows), [list.rows]);
  const totals = useMemo(() => supplyTotals(list.rows), [list.rows]);
  const visible = useMemo(
    () => filterSupplies(list.rows, search, category, onlyLow),
    [category, list.rows, onlyLow, search],
  );

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

  /** Harga tersimpan adalah IDR; untuk diedit ia harus ditampilkan dalam
   *  mata uang pengguna lebih dulu, kalau tidak angkanya terkonversi dua kali
   *  saat disimpan kembali. */
  const priceTextFor = useCallback(
    (row: SupplyRow) => {
      const value = currency === "IDR" ? row.priceIdr : row.priceIdr;
      return value === 0 ? "" : String(Math.round(value));
    },
    [currency],
  );

  const remove = useCallback(
    (row: SupplyRow) => {
      if (!list.app) return;
      closeSheet();
      void runWrite(
        writeTask(
          { api: list.app.api, repo: list.app.repo },
          {
            path: `/api/supplies/${row.id}/delete`,
            body: {},
            entityType: "supplies",
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
    if (supplyDraftError(sheet.draft)) {
      setNotice(t("supplies_err_name"));
      return;
    }
    const price = parseMoneyInput(sheet.draft.priceInput) ?? 0;
    const draft = sheet.draft;
    closeSheet();
    if (draft.id === null) {
      // Barang baru butuh id dari server untuk bisa di-outbox.
      setBusy(true);
      list.app.api
        .post("/api/supplies", supplyPayload(draft, price))
        .then(() => list.refresh())
        .catch((err: unknown) =>
          setNotice(t("error_occurred", { error: err instanceof Error ? err.message : String(err) })),
        )
        .finally(() => setBusy(false));
      return;
    }
    void runWrite(
      writeTask(
        { api: list.app.api, repo: list.app.repo },
        {
          path: `/api/supplies/${draft.id}/update`,
          body: supplyPayload(draft, price),
          entityType: "supplies",
          entityId: draft.id,
          nextPayload: { ...draft, id: draft.id, priceIdr: price },
          previousPayload: list.rows.find((row) => row.id === draft.id) ?? null,
        },
      ),
    );
  }, [closeSheet, list, runWrite, sheet]);

  const saveTx = useCallback(() => {
    if (sheet.kind !== "tx" || !list.app) return;
    const draft = sheet.draft;
    const problem = txError(draft);
    if (problem === "bad-qty") {
      setNotice(t("supplies_err_qty"));
      return;
    }
    if (problem === "over-stock") {
      setNotice(t("supplies_err_stock"));
      return;
    }
    const amount = parseMoneyInput(draft.economyAmountInput) ?? 0;
    const row = draft.row;
    closeSheet();
    void runWrite(
      writeTask(
        { api: list.app.api, repo: list.app.repo },
        {
          path: `/api/supplies/${row.id}/tx`,
          body: supplyTxPayload(draft, amount),
          entityType: "supplies",
          entityId: row.id,
          nextPayload: applyTx(row, draft.kind, draft.qty),
          previousPayload: row,
        },
      ),
    );
  }, [closeSheet, list, runWrite, sheet]);

  const actionsFor = useCallback(
    (row: SupplyRow): SheetAction[] => [
      {
        key: "in",
        label: t("supplies_stock_in"),
        icon: "＋",
        onPress: () => setSheet({ kind: "tx", draft: txDraftFor(row, "in") }),
      },
      {
        key: "out",
        label: t("supplies_stock_out"),
        icon: "－",
        onPress: () => setSheet({ kind: "tx", draft: txDraftFor(row, "out") }),
      },
      {
        key: "edit",
        label: t("supplies_edit"),
        icon: "✎",
        onPress: () => setSheet({ kind: "form", draft: draftFromRow(row, priceTextFor(row)) }),
      },
      {
        key: "delete",
        label: t("supplies_delete"),
        icon: "🗑",
        destructive: true,
        onPress: () => remove(row),
      },
    ],
    [priceTextFor, remove],
  );

  if (list.loading) {
    return <LoadingState theme={theme} title={t("supplies_title")} message={t("loading")} />;
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

  const low = lowStockRows(list.rows);
  const lowPercent = totals.items > 0 ? Math.round((low.length / totals.items) * 100) : 0;

  return (
    <>
      <ScreenShell
        theme={theme}
        title={t("supplies_title")}
        subtitle={t("supplies_subtitle")}
        onRefresh={() => void list.refresh()}
        refreshing={list.refreshing}
        offlineNotice={!list.online ? t("mobile_offline_banner") : notice}
        fab={{
          icon: "+",
          label: t("supplies_add"),
          onPress: () => setSheet({ kind: "form", draft: emptySupplyDraft() }),
        }}
      >
        <StatRow>
          <StatTile theme={theme} label={t("supplies_stat_items")} value={String(totals.items)} />
          <StatTile
            theme={theme}
            label={t("supplies_stat_low")}
            value={String(low.length)}
            accent={low.length > 0}
          />
          <StatTile
            theme={theme}
            label={t("supplies_stat_value")}
            value={money(totals.stockValueIdr, currency)}
          />
        </StatRow>

        {low.length > 0 ? (
          <Card theme={theme} style={styles.column}>
            <InlineNote theme={theme}>{t("supplies_low_banner", { n: low.length })}</InlineNote>
            <ProgressBar
              theme={theme}
              percent={lowPercent}
              label={t("supplies_stat_low")}
              detail={`${low.length}/${totals.items}`}
              color={theme.colors.accent3}
            />
          </Card>
        ) : null}

        <TextField
          theme={theme}
          label={t("supplies_search_ph")}
          value={search}
          onChangeText={setSearch}
          placeholder={t("supplies_search_ph")}
        />

        <ChipRow>
          <Chip
            theme={theme}
            label={t("supplies_all_categories")}
            selected={category === null}
            onPress={() => setCategory(null)}
          />
          {categories.map((name) => (
            <Chip
              key={name}
              theme={theme}
              label={name}
              selected={category === name}
              onPress={() => setCategory(category === name ? null : name)}
            />
          ))}
          <Chip
            theme={theme}
            label={t("supplies_stat_low")}
            selected={onlyLow}
            onPress={() => setOnlyLow(!onlyLow)}
          />
        </ChipRow>

        {visible.length === 0 ? (
          <EmptyState
            theme={theme}
            title={t("supplies_title")}
            message={list.rows.length === 0 ? t("supplies_empty") : t("notes_search_result", { count: 0 })}
            actionLabel={t("supplies_add")}
            onAction={() => setSheet({ kind: "form", draft: emptySupplyDraft() })}
          />
        ) : (
          <Stack>
            {visible.map((row) => {
              const state = stockState(row);
              return (
                <Card
                  key={row.id}
                  theme={theme}
                  onPress={() => setSheet({ kind: "tx", draft: txDraftFor(row, "in") })}
                  onLongPress={() => setSheet({ kind: "actions", row })}
                  accessibilityLabel={`${row.name}, ${t("supplies_col_stock")} ${row.stock} ${row.unit}`}
                >
                  <View style={styles.body}>
                    <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={2}>
                      {row.name}
                    </Text>
                    <Text style={[styles.meta, { color: theme.colors.muted }]} numberOfLines={1}>
                      {[row.category, row.location].filter((v) => v !== "").join(" · ") || t("notes_no_folder")}
                    </Text>
                  </View>
                  <View style={styles.right}>
                    <Text
                      style={[
                        styles.stock,
                        {
                          color:
                            state === "ok" ? theme.colors.text : theme.colors.accent3,
                        },
                      ]}
                    >
                      {`${row.stock} ${row.unit}`}
                    </Text>
                    <Text style={[styles.meta, { color: theme.colors.muted }]}>
                      {money(row.priceIdr, currency)}
                    </Text>
                  </View>
                </Card>
              );
            })}
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
        visible={sheet.kind === "tx"}
        title={t("supplies_tx_title")}
        onClose={closeSheet}
        footer={<Button theme={theme} label={t("btn_save")} onPress={saveTx} disabled={busy} />}
      >
        {sheet.kind === "tx" ? (
          <>
            <InlineNote theme={theme}>
              {t("supplies_stock_now", {
                stock: sheet.draft.row.stock,
                unit: sheet.draft.row.unit,
              })}
            </InlineNote>
            <ChipRow>
              <Chip
                theme={theme}
                label={t("supplies_tx_in")}
                selected={sheet.draft.kind === "in"}
                onPress={() => setSheet({ kind: "tx", draft: { ...sheet.draft, kind: "in" } })}
              />
              <Chip
                theme={theme}
                label={t("supplies_tx_out")}
                selected={sheet.draft.kind === "out"}
                onPress={() => setSheet({ kind: "tx", draft: { ...sheet.draft, kind: "out" } })}
              />
            </ChipRow>
            <TextField
              theme={theme}
              label={t("supplies_qty_lbl")}
              value={String(sheet.draft.qty)}
              onChangeText={(text) =>
                setSheet({
                  kind: "tx",
                  draft: { ...sheet.draft, qty: Number.parseFloat(text.replace(",", ".")) || 0 },
                })
              }
              placeholder="1"
            />
            <TextField
              theme={theme}
              label={t("supplies_note_ph")}
              value={sheet.draft.note}
              onChangeText={(note) => setSheet({ kind: "tx", draft: { ...sheet.draft, note } })}
              placeholder={t("supplies_note_ph")}
            />
            <ChipRow>
              <Chip
                theme={theme}
                label={t("supplies_restock_expense")}
                selected={sheet.draft.logEconomy}
                onPress={() =>
                  setSheet({ kind: "tx", draft: { ...sheet.draft, logEconomy: !sheet.draft.logEconomy } })
                }
              />
            </ChipRow>
            {sheet.draft.logEconomy ? (
              <>
                <TextField
                  theme={theme}
                  label={t("economy_amount_currency_label", { currency })}
                  value={sheet.draft.economyAmountInput}
                  onChangeText={(economyAmountInput) =>
                    setSheet({ kind: "tx", draft: { ...sheet.draft, economyAmountInput } })
                  }
                  placeholder="0"
                />
                <TextField
                  theme={theme}
                  label={t("supplies_economy_category_ph")}
                  value={sheet.draft.economyCategory}
                  onChangeText={(economyCategory) =>
                    setSheet({ kind: "tx", draft: { ...sheet.draft, economyCategory } })
                  }
                  placeholder={t("supplies_economy_category_ph")}
                />
                <InlineNote theme={theme}>{t("supplies_economy_linked")}</InlineNote>
              </>
            ) : null}
          </>
        ) : null}
      </BottomSheet>

      <BottomSheet
        theme={theme}
        visible={sheet.kind === "form"}
        title={sheet.kind === "form" && sheet.draft.id ? t("supplies_dlg_title_edit") : t("supplies_dlg_title_add")}
        onClose={closeSheet}
        footer={<Button theme={theme} label={t("btn_save")} onPress={saveDraft} disabled={busy} />}
      >
        {sheet.kind === "form" ? (
          <>
            <TextField
              theme={theme}
              label={t("supplies_name_ph")}
              value={sheet.draft.name}
              onChangeText={(name) => setSheet({ kind: "form", draft: { ...sheet.draft, name } })}
              placeholder={t("supplies_name_ph")}
            />
            <TextField
              theme={theme}
              label={t("supplies_category_ph")}
              value={sheet.draft.category}
              onChangeText={(categoryValue) =>
                setSheet({ kind: "form", draft: { ...sheet.draft, category: categoryValue } })
              }
              placeholder={t("supplies_category_ph")}
            />
            <TextField
              theme={theme}
              label={t("supplies_unit_ph")}
              value={sheet.draft.unit}
              onChangeText={(unit) => setSheet({ kind: "form", draft: { ...sheet.draft, unit } })}
              placeholder={t("supplies_unit_ph")}
            />
            <TextField
              theme={theme}
              label={t("supplies_stock_lbl")}
              value={String(sheet.draft.stock)}
              onChangeText={(text) =>
                setSheet({
                  kind: "form",
                  draft: { ...sheet.draft, stock: Number.parseFloat(text.replace(",", ".")) || 0 },
                })
              }
              placeholder="0"
            />
            <TextField
              theme={theme}
              label={t("supplies_min_lbl")}
              value={String(sheet.draft.minStock)}
              onChangeText={(text) =>
                setSheet({
                  kind: "form",
                  draft: { ...sheet.draft, minStock: Number.parseFloat(text.replace(",", ".")) || 0 },
                })
              }
              placeholder="0"
            />
            <TextField
              theme={theme}
              label={t("economy_amount_currency_label", { currency })}
              value={sheet.draft.priceInput}
              onChangeText={(priceInput) =>
                setSheet({ kind: "form", draft: { ...sheet.draft, priceInput } })
              }
              placeholder="0"
            />
            <TextField
              theme={theme}
              label={t("supplies_location_ph")}
              value={sheet.draft.location}
              onChangeText={(location) => setSheet({ kind: "form", draft: { ...sheet.draft, location } })}
              placeholder={t("supplies_location_ph")}
            />
            <TextField
              theme={theme}
              label={t("supplies_notes_ph")}
              value={sheet.draft.notes}
              onChangeText={(notes) => setSheet({ kind: "form", draft: { ...sheet.draft, notes } })}
              placeholder={t("supplies_notes_ph")}
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
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: "700" },
  meta: { fontSize: 12 },
  right: { alignItems: "flex-end", gap: 2 },
  stock: { fontSize: 15, fontWeight: "800" },
});
