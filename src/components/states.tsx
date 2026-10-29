/**
 * M07 — state kosong / memuat / gagal untuk setiap layar.
 *
 * Brief §10 (dikutip roadmap M07) menuntut ketiga state ini ada SEJAK AWAL,
 * bukan ditambal belakangan. Alasannya praktis: layar yang cuma punya state
 * "sukses" akan terlihat rusak begitu datanya kosong atau jaringannya putus,
 * dan itu kondisi yang paling sering terjadi di ponsel.
 *
 * Semua warna dan radius diambil dari token M06 — tidak ada nilai hex di sini.
 */

import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Button } from "./ui/primitives";
import { MIN_TOUCH_TARGET_DP, scale, type Theme } from "../theme/tokens";

export interface StateProps {
  theme: Theme;
  title: string;
  message?: string;
}

function Frame({
  theme,
  children,
}: {
  theme: Theme;
  children: React.ReactNode;
}) {
  return <View style={[styles.frame, { backgroundColor: theme.colors.bg }]}>{children}</View>;
}

export interface EmptyStateProps extends StateProps {
  /** Opsional: ajakan bertindak. Tanpa ini state kosong hanya menjelaskan. */
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ theme, title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <Frame theme={theme}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {message ? (
        <Text style={[styles.message, { color: theme.colors.muted }]}>{message}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.emptyAction}>
          <Button theme={theme} label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </Frame>
  );
}

export function LoadingState({ theme, title, message }: StateProps) {
  return (
    <Frame theme={theme}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {message ? (
        <Text style={[styles.message, { color: theme.colors.muted }]}>{message}</Text>
      ) : null}
    </Frame>
  );
}

export interface ErrorStateProps extends StateProps {
  /** Aksi coba lagi. Wajib ada: error tanpa jalan keluar adalah buntu. */
  onRetry: () => void;
  retryLabel: string;
}

export function ErrorState({ theme, title, message, onRetry, retryLabel }: ErrorStateProps) {
  return (
    <Frame theme={theme}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {message ? (
        <Text style={[styles.message, { color: theme.colors.muted }]}>{message}</Text>
      ) : null}
      <View
        accessibilityRole="button"
        accessible
        onTouchEnd={onRetry}
        style={[
          styles.retry,
          {
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.panel,
            borderRadius: scale.radius.md,
            minHeight: MIN_TOUCH_TARGET_DP,
          },
        ]}
      >
        <Text style={[styles.retryLabel, { color: theme.colors.primary }]}>{retryLabel}</Text>
      </View>
    </Frame>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    flex: 1,
    gap: 8,
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  retry: {
    alignItems: "center",
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 8,
    minWidth: 160,
    paddingHorizontal: 20,
  },
  emptyAction: { marginTop: 8, width: "100%" },
  retryLabel: {
    fontSize: 14,
    fontWeight: "800",
  },
});
