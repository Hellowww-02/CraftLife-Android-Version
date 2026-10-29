/**
 * Tab More — pintu ke SELURUH fitur, 1:1 dengan sidebar desktop.
 *
 * M07 dulu hanya meninggalkan kerangka ("Fitur layar ini dibangun di M08")
 * yang lupa diganti — layar per layar sudah dibangun di M08–M12, tapi menu
 * inilah yang membuat semuanya terlihat. Sekarang isinya katalog lengkap:
 * emoji + label terjemahan + panah, tiap baris minimal 48dp.
 */

import { type Href, router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { MORE_MENU_ALL, type MenuItem } from "../../src/features/menu";
import { t } from "../../src/i18n";
import { MIN_TOUCH_TARGET_DP } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme/ThemeProvider";

function open(item: MenuItem): void {
  const href = (
    item.params ? { pathname: item.route, params: item.params } : item.route
  ) as Href;
  router.push(href);
}

export default function MoreScreen() {
  const { theme } = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.kicker, { color: theme.colors.muted }]}>
        {t("nav_adventure_menu")}
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.panel, borderColor: theme.colors.border },
        ]}
      >
        {MORE_MENU_ALL.map((item, index) => (
          <Pressable
            key={item.key}
            onPress={() => open(item)}
            accessibilityRole="button"
            accessibilityLabel={t(item.labelKey)}
            style={({ pressed }) => [
              styles.row,
              index > 0 && { borderTopWidth: 1, borderTopColor: theme.colors.border },
              pressed && { backgroundColor: theme.colors.bg2 },
            ]}
          >
            <Text style={styles.icon}>{item.icon}</Text>
            <Text style={[styles.label, { color: theme.colors.text }]} numberOfLines={1}>
              {t(item.labelKey)}
            </Text>
            <Text style={[styles.chevron, { color: theme.colors.muted }]}>›</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  kicker: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  row: {
    minHeight: MIN_TOUCH_TARGET_DP + 8,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  icon: { fontSize: 20, width: 28, textAlign: "center" },
  label: { flex: 1, fontSize: 15, fontWeight: "600" },
  chevron: { fontSize: 22, fontWeight: "700", marginLeft: 4 },
});
