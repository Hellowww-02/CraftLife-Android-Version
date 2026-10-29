/**
 * Tab Tasks — Habits / Dailies / Quests.
 *
 * Tiga layar, satu tab. Di desktop ketiganya adalah tiga halaman sidebar yang
 * berbeda; di ponsel tiga entri terpisah berarti tiga ketukan untuk pindah,
 * jadi dipakai segmented control di atas — pola Android baku.
 *
 * Tiap panel tetap modul layar sendiri (`src/screens/*`), bukan komponen
 * inline di sini, supaya bisa dipakai lagi sebagai rute mandiri atau di-deep-
 * link: `craftlife://tasks?tab=dailies`.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import DailiesScreen from "../../src/screens/DailiesScreen";
import HabitsScreen from "../../src/screens/HabitsScreen";
import QuestsScreen from "../../src/screens/QuestsScreen";
import { t } from "../../src/i18n";
import { scale } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme/ThemeProvider";

type Tab = "habits" | "dailies" | "quests";

const TABS: { key: Tab; labelKey: string }[] = [
  { key: "habits", labelKey: "nav_habits" },
  { key: "dailies", labelKey: "nav_dailies" },
  { key: "quests", labelKey: "nav_quests" },
];

export function isTaskTab(value: unknown): value is Tab {
  return value === "habits" || value === "dailies" || value === "quests";
}

export default function TasksScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const active: Tab = isTaskTab(params.tab) ? params.tab : "habits";

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
              onPress={() => router.replace({ pathname: "/(tabs)/tasks", params: { tab: tab.key } })}
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

      {/* `key` memaksa layar dipasang ulang saat tab berganti, jadi tiap panel
          memulai siklus muatnya sendiri dan tidak mewarisi state panel lain. */}
      <View style={styles.panel} key={active}>
        {active === "habits" ? <HabitsScreen /> : null}
        {active === "dailies" ? <DailiesScreen /> : null}
        {active === "quests" ? <QuestsScreen /> : null}
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
