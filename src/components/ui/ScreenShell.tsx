/**
 * M08 — kerangka layar: safe area + gulir + tarik-untuk-menyegarkan + FAB.
 *
 * `RefreshControl` dipasang di sini, bukan per layar, supaya gestur
 * tarik-untuk-menyegarkan ada di SEMUA layar M08 secara konsisten. Di desktop
 * pengguna menekan F5; di ponsel gesturnya menarik layar ke bawah. Tanpa ini,
 * satu-satunya cara menyegarkan adalah menutup dan membuka ulang aplikasi.
 */

import React from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MIN_TOUCH_TARGET_DP, scale, type Theme } from "../../theme/tokens";

import { InlineNote } from "./primitives";

export interface ScreenShellProps {
  theme: Theme;
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Judul besar di dalam isi layar (header navigasi disediakan expo-router). */
  title?: string;
  subtitle?: string;
  /** Pesan pendek saat offline. null = jangan tampilkan apa pun. */
  offlineNotice?: string | null;
  /** Tombol mengambang, mis. "tambah". */
  fab?: { icon: string; label: string; onPress: () => void };
  footer?: React.ReactNode;
  scrollEnabled?: boolean;
}

export function ScreenShell({
  theme,
  children,
  onRefresh,
  refreshing,
  title,
  subtitle,
  offlineNotice,
  fab,
  footer,
  scrollEnabled = true,
}: ScreenShellProps) {
  const insets = useSafeAreaInsets();

  const refreshProps: Pick<ScrollViewProps, "refreshControl"> = onRefresh
    ? {
        refreshControl: (
          <RefreshControl
            refreshing={refreshing === true}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
            progressBackgroundColor={theme.colors.bg2}
          />
        ),
      }
    : {};

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(24, insets.bottom + (fab ? 96 : 24)) },
        ]}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={false}
        {...refreshProps}
      >
        {title ? (
          <View style={styles.head}>
            <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: theme.colors.muted }]}>{subtitle}</Text>
            ) : null}
          </View>
        ) : null}
        {offlineNotice ? <InlineNote theme={theme}>{offlineNotice}</InlineNote> : null}
        {children}
        {footer}
      </ScrollView>

      {fab ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={fab.label}
          onPress={fab.onPress}
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: theme.colors.primary,
              borderRadius: scale.radius.xl,
              bottom: Math.max(20, insets.bottom + 16),
              minHeight: 56,
              minWidth: 56,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[styles.fabGlyph, { color: theme.colors.onPrimary }]}>{fab.icon}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Deretan kartu dengan jarak seragam. */
export function Stack({ children }: { children: React.ReactNode }) {
  return <View style={styles.stack}>{children}</View>;
}

/** Baris statistik kecil (Dashboard/Profile). */
export function StatTile({
  theme,
  label,
  value,
  accent,
}: {
  theme: Theme;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: theme.colors.panel,
          borderColor: theme.colors.border,
          borderRadius: scale.radius.md,
          minHeight: MIN_TOUCH_TARGET_DP,
        },
      ]}
    >
      <Text style={[styles.tileValue, { color: accent ? theme.colors.primary : theme.colors.text }]}>
        {value}
      </Text>
      <Text style={[styles.tileLabel, { color: theme.colors.muted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.statRow}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { gap: 12, paddingHorizontal: 16, paddingTop: 12 },
  head: { gap: 2, marginBottom: 4 },
  title: { fontSize: 24, fontWeight: "800" },
  subtitle: { fontSize: 13, lineHeight: 18 },
  stack: { gap: 10 },
  fab: {
    alignItems: "center",
    elevation: 4,
    justifyContent: "center",
    position: "absolute",
    right: 20,
    shadowColor: "#000",
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 6,
  },
  fabGlyph: { fontSize: 22, fontWeight: "700" },
  tile: {
    alignItems: "center",
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  tileValue: { fontSize: 18, fontWeight: "800" },
  tileLabel: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  statRow: { flexDirection: "row", gap: 10 },
});
