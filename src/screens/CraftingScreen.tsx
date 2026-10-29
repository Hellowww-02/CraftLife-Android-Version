/**
 * M09c — layar Crafting: resep craft + enchant perlengkapan.
 *
 * Keterampilan bahan dibaca dari inventaris server; tombol Craft hanya
 * aktif bila semua bahan terpenuhi menurut data itu (bukan tebakan lokal),
 * dan hasil akhirnya tetap diputuskan server lewat `/api/shop/craft` dan
 * `/api/shop/enchant` — jalur Kanal C yang sama dengan desktop.
 */

import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  Button,
  Card,
  InlineNote,
  SectionHeader,
} from "../components/ui/primitives";
import { ScreenShell, Stack } from "../components/ui/ScreenShell";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { errorMessage, isNetworkFailure } from "../data/httpApi";
import { useRemote } from "../data/useRemote";
import {
  parseInventory,
  parseRecipes,
  type RecipeRow,
  type ShopRow,
} from "../features/rpg/model";
import { parseShopItems } from "../features/rpg/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

const ENCHANT_MAX = 5;

export default function CraftingScreen() {
  const { theme } = useTheme();
  const recipesRemote = useRemote("/api/catalog/recipes", (raw) => raw);
  const catalogRemote = useRemote("/api/catalog/shop", (raw) => raw);
  const invRemote = useRemote("/api/inventory", parseInventory);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const inventory = invRemote.data ?? new Map();
  const recipes = useMemo(
    () => parseRecipes(recipesRemote.data, catalogRemote.data, inventory),
    [recipesRemote.data, catalogRemote.data, inventory],
  );
  const enchantable = useMemo(
    () =>
      parseShopItems(catalogRemote.data, inventory).filter(
        (i) => i.ownedQty > 0 && i.enchantLevel < ENCHANT_MAX,
      ),
    [catalogRemote.data, inventory],
  );
  const api = recipesRemote.app?.api;

  const reloadAll = useCallback(async () => {
    await Promise.all([
      recipesRemote.reload(),
      catalogRemote.reload(),
      invRemote.reload(),
    ]);
  }, [recipesRemote, catalogRemote, invRemote]);

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

  if (recipesRemote.loading && !recipesRemote.data) {
    return (
      <LoadingState
        theme={theme}
        title={t("crafting_title")}
        message={t("loading")}
      />
    );
  }
  if (recipesRemote.error && !recipesRemote.data) {
    return (
      <ErrorState
        theme={theme}
        title={t("crafting_title")}
        message={recipesRemote.error}
        retryLabel={t("web_retry")}
        onRetry={() => void reloadAll()}
      />
    );
  }

  return (
    <ScreenShell
      theme={theme}
      title={t("crafting_title")}
      onRefresh={() => void reloadAll()}
      refreshing={recipesRemote.refreshing}
      offlineNotice={recipesRemote.online ? null : t("mobile_offline_banner")}
    >
      <Stack>
        {notice ? <InlineNote theme={theme}>{notice}</InlineNote> : null}
        <SectionHeader theme={theme} title={t("web_craft_title")} />
        {recipes.length === 0 ? (
          <EmptyState
            theme={theme}
            title={t("web_craft_title")}
            message={t("web_inv_empty")}
          />
        ) : (
          recipes.map((recipe) => (
            <RecipeCard
              key={recipe.recipeId}
              recipe={recipe}
              busy={busy}
              onCraft={() =>
                void runCommand("/api/shop/craft", {
                  recipeId: recipe.recipeId,
                })
              }
            />
          ))
        )}
        <SectionHeader theme={theme} title={t("web_enchant")} />
        {enchantable.length === 0 ? (
          <EmptyState
            theme={theme}
            title={t("web_enchant")}
            message={t("web_inv_empty")}
          />
        ) : (
          enchantable.map((item: ShopRow) => (
            <Card key={item.itemId} theme={theme}>
              <View style={styles.head}>
                <Text style={styles.icon}>{item.icon}</Text>
                <View style={styles.headText}>
                  <Text style={[styles.name, { color: theme.colors.text }]}>
                    {item.name}
                  </Text>
                  <Text style={[styles.meta, { color: theme.colors.muted }]}>
                    +{item.enchantLevel} / {ENCHANT_MAX}
                  </Text>
                </View>
                <Button
                  theme={theme}
                  variant="ghost"
                  label={t("web_enchant")}
                  disabled={busy}
                  onPress={() =>
                    void runCommand("/api/shop/enchant", {
                      itemId: item.itemId,
                    })
                  }
                />
              </View>
            </Card>
          ))
        )}
      </Stack>
    </ScreenShell>
  );
}

function RecipeCard({
  recipe,
  busy,
  onCraft,
}: {
  recipe: RecipeRow;
  busy: boolean;
  onCraft: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Card theme={theme}>
      <View style={styles.head}>
        <Text style={styles.icon}>{recipe.resultIcon}</Text>
        <View style={styles.headText}>
          <Text style={[styles.name, { color: theme.colors.text }]}>
            {recipe.resultName}
          </Text>
          <Text style={[styles.meta, { color: theme.colors.muted }]}>
            {recipe.goldCost} G
            {recipe.craftable ? "" : ` · ${t("mobile_craft_missing")}`}
          </Text>
        </View>
      </View>
      {recipe.needs.map((need) => (
        <Text
          key={need.itemId}
          style={[
            styles.meta,
            { color: need.ok ? theme.colors.muted : theme.colors.accent },
          ]}
        >
          {need.icon} {need.name}: {need.have}/{need.need}
        </Text>
      ))}
      <Button
        theme={theme}
        label={t("web_craft_title")}
        disabled={busy || !recipe.craftable}
        onPress={onCraft}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  headText: { flex: 1, gap: 2 },
  icon: { fontSize: 30 },
  name: { fontSize: 15, fontWeight: "700" },
  meta: { fontSize: 12 },
});
