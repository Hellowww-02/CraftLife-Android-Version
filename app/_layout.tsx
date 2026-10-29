/** Root layout: penyedia tema + stack. Deep link memakai skema `craftlife://`. */

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";

import { configureApiAdapter } from "../src/api/adapter";
import { installForegroundHandler } from "../src/notifications/reminders";
import { ThemeProvider, useTheme } from "../src/theme/ThemeProvider";

// Harus terjadi sebelum permintaan API pertama. Di React Native `window.location`
// tidak ada, jadi tanpa adapter ini client akan crash, bukan sekadar gagal.
// Nilainya dibaca dari EXPO_PUBLIC_API_BASE di berkas `.env` (lihat
// `.env.example`) supaya alamat server tidak di-hardcode di sumber.
configureApiAdapter(
  (process.env.EXPO_PUBLIC_API_BASE as string | undefined) ?? "",
);

// M08 wave 3: tanpa handler ini Android menyembunyikan notifikasi yang datang
// saat aplikasi sedang di depan — pengingat akan "berbunyi" tanpa suara dan
// tanpa banner. Dipasang sekali di root, bukan di layar Reminders, supaya
// pengingat yang jatuh tempo saat pengguna membuka layar lain tetap muncul.
installForegroundHandler();

function ThemedStack() {
  const { theme } = useTheme();
  return (
    <>
      <StatusBar style={theme.colors.bg === "#ffffff" ? "dark" : "light"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { fontWeight: "800" },
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      >
        {/* Grup tab menggambar header-nya sendiri; tanpa baris ini header
            luar ikut tampil dengan judul default "(tabs)". */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ThemedStack />
    </ThemeProvider>
  );
}
