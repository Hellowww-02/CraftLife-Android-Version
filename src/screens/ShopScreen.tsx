/**
 * M09c — layar Shop: katalog beli + inventaris (pakai/equip/jual).
 *
 * Harga dan kepemilikan selalu dari server (`/api/catalog/shop` +
 * `/api/inventory`); pembelian adalah perintah Kanal C yang dijalankan
 * lewat `/api/shop/*` — jalur yang sama yang sejak Phase 5B mengantre
 * transaksi cloud-nya di desktop. Layar tidak menghitung harga sendiri.
 */

import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  Button,
  Card,
  Chip,
  ChipRow,
  InlineNote,
} from "../components/ui/primitives";
import { ScreenShell, Stack } from "../components/ui/ScreenShell";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { errorMessage, isNetworkFailure } from "../data/httpApi";
import { useRemote } from "../data/useRemote";
import {
  parseInventory,
  parseShopItems,
  type ShopRow,
} from "../features/rpg/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

type Tab = "items" | "inventory";

export default function ShopScreen() {
  const { theme } = useTheme();
  const catalogRemote = useRemote("/api/catalog/shop", (raw) => raw);
  const invRemote = useRemote("/api/inventory", parseInventory);
  const [tab, setTab] = useState<Tab>("items");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const inventory = invRemote.data ?? new Map();
  const items = useMemo(
    () => parseShopItems(catalogRemote.data, inventory),
    [catalogRemote.data, inventory],
  );
  const owned = useMemo(() => items.filter((i) => i.ownedQty > 0), [items]);
  const api = catalogRemote.app?.api;

  const reloadAll = useCallback(async () => {
    await Promise.all([catalogRemote.reload(), invRemote.reload()]);
  }, [catalogRemote, invRemote]);

  const runCommand = useCallback(
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

  if (catalogRemote.loading && !catalogRemote.data) {
    return (
      <LoadingState theme={theme} title={t("nav_shop")} message={t("loading")} />
    );
  }
  if (catalogRemote.error && !catalogRemote.data) {
    return (
      <ErrorState
        theme={theme}
        title={t("nav_shop")}
        message={catalogRemote.error}
        retryLabel={t("web_retry")}
        onRetry={() => void reloadAll()}
      />
    );
  }

  const visible = tab === "items" ? items : owned;

  return (
    <ScreenShell
      theme={theme}
      title={t("nav_shop")}
      onRefresh={() => void reloadAll()}
      refreshing={catalogRemote.refreshing}
      offlineNotice={catalogRemote.online ? null : t("mobile_offline_banner")}
    >
      <Stack>
        <ChipRow>
          <Chip
            theme={theme}
            label={t("shop_tab_items")}
            selected={tab === "items"}
            onPress={() => setTab("items")}
          />
          <Chip
            theme={theme}
            label={t("shop_tab_inventory")}
            selected={tab === "inventory"}
            onPress={() => setTab("inventory")}
          />
        </ChipRow>
        {notice ? <InlineNote theme={theme}>{notice}</InlineNote> : null}
        {visible.length === 0 ? (
          <EmptyState
            theme={theme}
            title={t("nav_shop")}
            message={t("web_inv_empty")}
          />
        ) : (
          visible.map((item) => (
            <ShopCard
              key={item.itemId}
              item={item}
              tab={tab}
              busy={busy}
              onAction={(path, body) => void runCommand(path, body)}
            />
          ))
        )}
      </Stack>
    </ScreenShell>
  );
}

function ShopCard({
  item,
  tab,
  busy,
  onAction,
}: {
  item: ShopRow;
  tab: Tab;
  busy: boolean;
  onAction: (path: string, body: unknown) => void;
}) {
  const { theme } = useTheme();
  return (
    <Card theme={theme}>
      <View style={styles.head}>
        <Text style={styles.icon}>{item.icon}</Text>
        <View style={styles.headText}>
          <Text style={[styles.name, { color: theme.colors.text }]}>
            {item.name}
          </Text>
          <Text style={[styles.meta, { color: theme.colors.muted }]}>
            {item.type} · {item.cost} G
            {item.ownedQty > 0
              ? ` · ${t("mobile_shop_owned", { n: item.ownedQty })}`
              : ""}
            {item.enchantLevel > 0 ? ` · +${item.enchantLevel}` : ""}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        {tab === "items" ? (
          <Button
            theme={theme}
            label={item.ownedQty > 0 ? t("web_buy_more") : t("shop_buy")}
            disabled={busy}
            onPress={() =>
              onAction("/api/shop/buy", { itemId: item.itemId, quantity: 1 })
            }
          />
        ) : (
          <>
            <Button
              theme={theme}
              variant="ghost"
              label={t("web_use_item")}
              disabled={busy}
              onPress={() => onAction("/api/shop/use", { itemId: item.itemId })}
            />
            <Button
              theme={theme}
              variant="ghost"
              label={item.equipped ? t("web_unequip") : t("web_equip")}
              disabled={busy}
              onPress={() =>
                onAction("/api/shop/equip", {
                  itemId: item.itemId,
                  equipped: !item.equipped,
                })
              }
            />
            <Button
              theme={theme}
              variant="ghost"
              label={t("shop_sell")}
              disabled={busy}
              onPress={() => onAction("/api/shop/sell", { itemId: item.itemId })}
            />
          </>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  headText: { flex: 1, gap: 2 },
  icon: { fontSize: 30 },
  name: { fontSize: 15, fontWeight: "700" },
  meta: { fontSize: 12 },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
});
