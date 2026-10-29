/**
 * Tab Tracker — Sport / Food / Health.
 *
 * Sama seperti tab Tasks: tiga layar desktop dijadikan satu tab dengan
 * segmented control, karena di ponsel tiga entri sidebar berarti tiga
 * ketukan hanya untuk berpindah.
 *
 * Deep link: `craftlife://tracker?tab=food`.
 *
 * Catatan scope yang disengaja: **Air tidak diberi tab sendiri.** Di desktop,
 * "Water" adalah tab kedua di dalam HealthFoodView; di ponsel ia menjadi satu
 * kartu di panel Food. Alasannya, air dan makanan dibaca dari satu endpoint
 * yang sama (`/api/healthfood/day`) dan saling menjelaskan (kalori bersih =
 * makanan − olahraga). Memecahnya jadi dua tab berarti dua layar yang
 * memuat data identik.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import FoodScreen from "../../src/screens/FoodScreen";
import HealthScreen from "../../src/screens/HealthScreen";
import SportScreen from "../../src/screens/SportScreen";
import { t } from "../../src/i18n";
import { scale } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme/ThemeProvider";

export type TrackerTab = "sport" | "food" | "health";

const TABS: { key: TrackerTab; labelKey: string }[] = [
  { key: "sport", labelKey: "nav_sport" },
  { key: "food", labelKey: "nav_health_food" },
  { key: "health", labelKey: "health_daily_targets" },
];

export function isTrackerTab(value: unknown): value is TrackerTab {
  return value === "sport" || value === "food" || value === "health";
}

export default function TrackerScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const active: TrackerTab = isTrackerTab(params.tab) ? params.tab : "sport";

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <View
        style={[
          styles.segment,
          {
            backgroundColor: theme.colors.bg2,
            borderColor: theme.colors.border,
            borderRadius: scale.radius.md,
          },
        ]}
      >
        {TABS.map((tab) => {
          const selected = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityLabel={t(tab.labelKey)}
              accessibilityState={{ selected }}
              onPress={() => router.replace({ pathname: "/(tabs)/tracker", params: { tab: tab.key } })}
              style={[
                styles.segmentItem,
                selected
                  ? { backgroundColor: theme.colors.primary, borderRadius: scale.radius.sm }
                  : null,
              ]}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  { color: selected ? theme.colors.onPrimary : theme.colors.muted },
                ]}
              >
                {t(tab.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* `key` memaksa panel dipasang ulang saat tab berganti, jadi tiap panel
          menjalankan siklus muatnya sendiri dan tidak mewarisi state panel
          lain (persis seperti tab Tasks). */}
      <View style={styles.panel} key={active}>
        {active === "sport" ? <SportScreen /> : null}
        {active === "food" ? <FoodScreen /> : null}
        {active === "health" ? <HealthScreen /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  segment: {
    borderWidth: 1,
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 8,
    padding: 3,
  },
  segmentItem: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 40,
  },
  segmentLabel: { fontSize: 13, fontWeight: "800" },
  panel: { flex: 1 },
});
