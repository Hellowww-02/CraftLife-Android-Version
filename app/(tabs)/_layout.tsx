/**
 * Bottom navigation: 5 destinasi + layar "More" yang menampung sisanya.
 *
 * Sengaja 5, bukan 24. Sidebar desktop menampung semua fitur sekaligus karena
 * punya layar lebar; di ponsel itu berarti target sentuh kecil dan menu yang
 * harus di-scroll — persis yang diminta dihindari.
 */

import { Tabs } from "expo-router";
import React from "react";

import { MIN_TOUCH_TARGET_DP } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme/ThemeProvider";

export default function TabsLayout() {
  const { theme } = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: theme.colors.bg2,
          borderTopColor: theme.colors.border,
          height: Math.max(56, MIN_TOUCH_TARGET_DP + 8),
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: "800" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="tasks" options={{ title: "Tasks" }} />
      <Tabs.Screen name="tracker" options={{ title: "Tracker" }} />
      <Tabs.Screen name="social" options={{ title: "Social" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
    </Tabs>
  );
}
