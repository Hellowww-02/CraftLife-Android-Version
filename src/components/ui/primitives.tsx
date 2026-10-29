/**
 * M08 — komponen dasar antarmuka Android.
 *
 * Tiga aturan yang dipegang semua komponen di sini:
 *
 * 1. **Tidak ada nilai warna hex.** Semua warna dari token M06
 *    (`theme.colors.*`), supaya 12 tema desktop otomatis berlaku di ponsel.
 * 2. **Target sentuh minimal 48dp** (`MIN_TOUCH_TARGET_DP`). Tombol yang
 *    kelihatan kecil boleh, tapi area sentuhnya tidak.
 * 3. **Aksesibilitas eksplisit.** `accessibilityRole` + `accessibilityLabel` +
 *    `accessibilityState` diisi, bukan mengandalkan tebakan TalkBack.
 */

import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { MIN_TOUCH_TARGET_DP, scale, type Theme } from "../../theme/tokens";

// ── Card ────────────────────────────────────────────────────────────────────

export function Card({
  theme,
  children,
  style,
  onPress,
  onLongPress,
  accessibilityLabel,
}: {
  theme: Theme;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
}) {
  const box = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.panel,
          borderColor: theme.colors.border,
          borderRadius: scale.radius.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress && !onLongPress) return box;
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      // delayLongPress pendek: tekan lama adalah pintu ke aksi tambahan
      // (edit/duplikat/hapus), dan menunggu 1 detik terasa rusak di ponsel.
      delayLongPress={280}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      {box}
    </Pressable>
  );
}

export function SectionHeader({
  theme,
  title,
  trailing,
}: {
  theme: Theme;
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.colors.muted }]}>{title}</Text>
      {trailing}
    </View>
  );
}

export function KeyValueRow({
  theme,
  label,
  value,
}: {
  theme: Theme;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.kvRow}>
      <Text style={[styles.kvLabel, { color: theme.colors.muted }]}>{label}</Text>
      <Text style={[styles.kvValue, { color: theme.colors.text }]}>{value}</Text>
    </View>
  );
}

// ── Progress ────────────────────────────────────────────────────────────────

export function ProgressBar({
  theme,
  percent,
  label,
  detail,
  color,
}: {
  theme: Theme;
  percent: number;
  label?: string;
  detail?: string;
  color?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const barColor = color ?? theme.colors.primary;
  return (
    <View style={styles.progressWrap}>
      {label ? (
        <View style={styles.progressHead}>
          <Text style={[styles.progressLabel, { color: theme.colors.muted }]}>{label}</Text>
          {detail ? (
            <Text style={[styles.progressDetail, { color: theme.colors.text }]}>{detail}</Text>
          ) : null}
        </View>
      ) : null}
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: clamped }}
        accessibilityLabel={label}
        style={[
          styles.progressTrack,
          { backgroundColor: theme.colors.bg3, borderRadius: scale.radius.sm },
        ]}
      >
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: barColor,
              borderRadius: scale.radius.sm,
              width: `${clamped}%`,
            },
          ]}
        />
      </View>
    </View>
  );
}

// ── Buttons ─────────────────────────────────────────────────────────────────

export type ButtonVariant = "primary" | "ghost" | "danger";

export function Button({
  theme,
  label,
  onPress,
  variant = "primary",
  disabled,
  icon,
}: {
  theme: Theme;
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  icon?: string;
}) {
  const filled = variant === "primary";
  const danger = variant === "danger";
  const background = filled
    ? danger
      ? theme.colors.accent
      : theme.colors.primary
    : theme.colors.panel;
  const foreground = filled
    ? danger
      ? theme.colors.onAccent
      : theme.colors.onPrimary
    : danger
      ? theme.colors.accent
      : theme.colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderColor: filled ? background : theme.colors.border,
          borderRadius: scale.radius.md,
          minHeight: MIN_TOUCH_TARGET_DP,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[styles.buttonLabel, { color: foreground }]}>
        {icon ? `${icon}  ` : ""}
        {label}
      </Text>
    </Pressable>
  );
}

/** Tombol ikon bundar — target sentuh tetap 48dp meski ikonnya kecil. */
export function IconButton({
  theme,
  icon,
  label,
  onPress,
  selected,
}: {
  theme: Theme;
  icon: string;
  label: string;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: selected === true }}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: selected ? theme.colors.primary : theme.colors.bg3,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          borderRadius: scale.radius.md,
          minHeight: MIN_TOUCH_TARGET_DP,
          minWidth: MIN_TOUCH_TARGET_DP,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text style={styles.iconGlyph} accessibilityElementsHidden>
        {icon}
      </Text>
    </Pressable>
  );
}

// ── Chips & input ───────────────────────────────────────────────────────────

export function Chip({
  theme,
  label,
  selected,
  onPress,
}: {
  theme: Theme;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.primary : theme.colors.bg3,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          borderRadius: scale.radius.sm,
          minHeight: MIN_TOUCH_TARGET_DP,
        },
      ]}
    >
      <Text
        style={[
          styles.chipLabel,
          { color: selected ? theme.colors.onPrimary : theme.colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

export function TextField({
  theme,
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  maxLength,
}: {
  theme: Theme;
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
        multiline={multiline}
        maxLength={maxLength}
        style={[
          styles.input,
          multiline ? styles.inputMultiline : null,
          {
            backgroundColor: theme.colors.bg3,
            borderColor: theme.colors.border,
            borderRadius: scale.radius.md,
            color: theme.colors.text,
            minHeight: multiline ? 88 : MIN_TOUCH_TARGET_DP,
          },
        ]}
      />
    </View>
  );
}

export function InlineNote({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return (
    <View
      style={[
        styles.note,
        {
          backgroundColor: theme.colors.bg3,
          borderColor: theme.colors.border,
          borderRadius: scale.radius.md,
        },
      ]}
    >
      <Text style={[styles.noteText, { color: theme.colors.muted }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pressed: { opacity: 0.85 },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  kvRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  kvLabel: { fontSize: 14 },
  kvValue: { fontSize: 14, fontWeight: "700" },
  progressWrap: { gap: 6 },
  progressHead: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { fontSize: 12, fontWeight: "700" },
  progressDetail: { fontSize: 12, fontWeight: "700" },
  progressTrack: { height: 10, overflow: "hidden", width: "100%" },
  progressFill: { height: "100%" },
  button: {
    alignItems: "center",
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  buttonLabel: { fontSize: 15, fontWeight: "800" },
  iconButton: { alignItems: "center", borderWidth: 1, justifyContent: "center" },
  iconGlyph: { fontSize: 18 },
  chip: { alignItems: "center", borderWidth: 1, justifyContent: "center", paddingHorizontal: 14 },
  chipLabel: { fontSize: 13, fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: "700" },
  input: {
    borderWidth: 1,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  inputMultiline: { paddingTop: 12 },
  note: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  noteText: { fontSize: 13, lineHeight: 19 },
});
