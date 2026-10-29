/**
 * M08 — bottom sheet: pengganti dialog/modal desktop.
 *
 * Kenapa bukan `Alert` atau `Modal` tengah layar? Di Android, aksi kontekstual
 * (edit, duplikat, hapus) idiomatik muncul dari bawah, dekat jempol, dan bisa
 * digeser turun untuk batal. `onRequestClose` dipasang supaya tombol/gestur
 * kembali menutup sheet, bukan menutup seluruh layar — itu perbedaan yang
 * langsung terasa "bukan aplikasi Android" kalau salah.
 */

import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { scale, type Theme } from "../../theme/tokens";

export function BottomSheet({
  theme,
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  theme: Theme;
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Wajib: tanpa ini tombol kembali Android menutup seluruh layar.
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdropWrap}>
        {/* Ketuk di luar = tutup, sama seperti gestur geser turun. */}
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={title}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.bg2,
              borderColor: theme.colors.border,
              borderTopLeftRadius: scale.radius.xl,
              borderTopRightRadius: scale.radius.xl,
            },
          ]}
        >
          <View
            style={[styles.handle, { backgroundColor: theme.colors.border }]}
            accessibilityElementsHidden
          />
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

export interface SheetAction {
  key: string;
  label: string;
  icon?: string;
  destructive?: boolean;
  onPress: () => void;
}

/**
 * Daftar aksi tekan-lama. Dipisah dari `BottomSheet` supaya layar task tidak
 * perlu menyusun ulang daftar yang sama tiga kali (habits/dailies/quests).
 */
export function ActionList({
  theme,
  actions,
}: {
  theme: Theme;
  actions: SheetAction[];
}) {
  return (
    <View style={styles.actions}>
      {actions.map((action) => (
        <Pressable
          key={action.key}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: pressed ? theme.colors.bg3 : "transparent",
              borderRadius: scale.radius.md,
            },
          ]}
        >
          <Text
            style={[
              styles.actionLabel,
              { color: action.destructive ? theme.colors.accent : theme.colors.text },
            ]}
          >
            {action.icon ? `${action.icon}  ` : ""}
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backdropWrap: { flex: 1, justifyContent: "flex-end" },
  backdrop: { backgroundColor: "rgba(0,0,0,0.45)", flex: 1 },
  sheet: {
    borderTopWidth: 1,
    maxHeight: "85%",
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },
  handle: { alignSelf: "center", borderRadius: 2, height: 4, marginBottom: 12, width: 44 },
  title: { fontSize: 17, fontWeight: "800", marginBottom: 12 },
  body: { flexGrow: 0 },
  bodyContent: { gap: 14, paddingBottom: 8 },
  footer: { gap: 10, paddingTop: 12 },
  actions: { gap: 2 },
  action: { minHeight: 48, justifyContent: "center", paddingHorizontal: 12 },
  actionLabel: { fontSize: 15, fontWeight: "700" },
});
