/**
 * Header layar `more/*` — judul terlokalisasi + tombol kembali.
 *
 * Sebelumnya tidak ada layout ini, jadi expo-router menampilkan nama rute
 * mentah ("more/leaderboard") sebagai judul — kesan "prototype" yang
 * dikeluhkan pengguna. Semua judul memakai kunci i18n yang sama dengan
 * label menu (lihat `src/features/menu.ts`).
 */

import { Stack } from "expo-router";
import React from "react";

import { t } from "../../src/i18n";
import { useTheme } from "../../src/theme/ThemeProvider";

export default function MoreLayout() {
  const { theme } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: "800" },
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Stack.Screen name="profile" options={{ title: t("nav_profile") }} />
      <Stack.Screen name="economy" options={{ title: t("nav_economy") }} />
      <Stack.Screen name="supplies" options={{ title: t("nav_supplies") }} />
      <Stack.Screen name="love" options={{ title: t("nav_love") }} />
      <Stack.Screen name="learning" options={{ title: t("nav_learning") }} />
      <Stack.Screen name="pomodoro" options={{ title: t("nav_pomodoro") }} />
      <Stack.Screen name="music" options={{ title: t("nav_music") }} />
      <Stack.Screen name="notes" options={{ title: t("nav_notes") }} />
      <Stack.Screen name="reminders" options={{ title: t("nav_reminders") }} />
      <Stack.Screen name="calendar" options={{ title: t("nav_calendar") }} />
      <Stack.Screen name="crafting" options={{ title: t("nav_crafting") }} />
      <Stack.Screen name="shop" options={{ title: t("nav_shop") }} />
      <Stack.Screen name="pets" options={{ title: t("nav_pets") }} />
      <Stack.Screen name="friends" options={{ title: t("nav_friends") }} />
      <Stack.Screen name="guild" options={{ title: t("nav_guild") }} />
      <Stack.Screen name="achievements" options={{ title: t("nav_achievement") }} />
      <Stack.Screen name="leaderboard" options={{ title: t("nav_leaderboard") }} />
      <Stack.Screen name="settings" options={{ title: t("nav_settings") }} />
      <Stack.Screen name="health" options={{ title: t("nav_health_food") }} />
      <Stack.Screen name="water" options={{ title: t("food_tab_water") }} />
      <Stack.Screen name="chat" options={{ title: t("mobile_chat_title") }} />
      <Stack.Screen name="pvp" options={{ title: t("mobile_pvp_title") }} />
      <Stack.Screen name="notifications" options={{ title: t("notif_title") }} />
      <Stack.Screen name="cloud" options={{ title: t("cloud_group") }} />
    </Stack>
  );
}
