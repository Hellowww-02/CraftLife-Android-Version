/**
 * M07 — bilah status sinkronisasi.
 *
 * Kenapa ini perlu: aplikasi offline-first yang diam saja saat gagal sinkron
 * membuat pengguna mengira datanya sudah aman di cloud padahal belum. Bilah ini
 * menjawab satu pertanyaan — "dataku sudah sampai mana?" — tanpa perlu membuka
 * layar pengaturan.
 *
 * Empat keadaan, dan yang terpenting adalah `blocked`: pengguna berhak tahu
 * MENGAPA sinkronisasi tidak jalan (offline / hemat baterai / baterai lemah),
 * bukan cuma melihatnya tidak bergerak.
 */

import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { scale, type Theme } from "../theme/tokens";
import type { SyncBlocked } from "../sync/syncService";

export type SyncPhase = "idle" | "syncing" | "blocked" | "error";

export interface SyncStatusBarProps {
  theme: Theme;
  phase: SyncPhase;
  /** Jumlah perubahan yang masih mengantre di outbox. */
  pending: number;
  /** Kenapa tertahan, saat phase === "blocked". */
  blocked?: SyncBlocked;
  /** Pesan kegagalan, saat phase === "error". */
  errorMessage?: string | null;
  lastSyncedAt?: string | null;
  /** Label i18n — diterjemahkan oleh pemanggil, bukan di sini. */
  labels: {
    idle: string;
    syncing: string;
    pendingCount: (n: number) => string;
    offline: string;
    lowPower: string;
    lowBattery: string;
    failed: string;
    never: string;
  };
}

function reasonText(blocked: SyncBlocked | undefined, labels: SyncStatusBarProps["labels"]): string {
  switch (blocked) {
    case "offline":
      return labels.offline;
    case "low_power":
      return labels.lowPower;
    case "low_battery":
      return labels.lowBattery;
    default:
      return labels.idle;
  }
}

export function SyncStatusBar({
  theme,
  phase,
  pending,
  blocked,
  errorMessage,
  lastSyncedAt,
  labels,
}: SyncStatusBarProps) {
  const message =
    phase === "syncing"
      ? labels.syncing
      : phase === "blocked"
        ? reasonText(blocked, labels)
        : phase === "error"
          ? errorMessage || labels.failed
          : pending > 0
            ? labels.pendingCount(pending)
            : lastSyncedAt || labels.never;

  const tone =
    phase === "error"
      ? theme.colors.accent3
      : phase === "blocked"
        ? theme.colors.muted
        : theme.colors.accent;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors.bg2,
          borderBottomColor: theme.colors.border,
          borderRadius: scale.radius.sm,
        },
      ]}
    >
      {phase === "syncing" ? (
        <ActivityIndicator size="small" color={theme.colors.accent} />
      ) : (
        <View style={[styles.dot, { backgroundColor: tone }]} />
      )}
      <Text numberOfLines={1} style={[styles.text, { color: theme.colors.text }]}>
        {message}
      </Text>
      {pending > 0 && phase !== "syncing" ? (
        <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
          <Text style={[styles.badgeText, { color: theme.colors.onPrimary }]}>{pending}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 12,
    marginVertical: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  text: {
    flex: 1,
    fontSize: 13,
  },
  badge: {
    borderRadius: 10,
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
});
