/** Login Supabase Auth. Kredensial tidak pernah menyentuh state React. */

import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { ErrorState } from "../src/components/states";
import { MIN_TOUCH_TARGET_DP, scale } from "../src/theme/tokens";
import { useTheme } from "../src/theme/ThemeProvider";

export default function LoginScreen() {
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (error) {
    return (
      <ErrorState
        theme={theme}
        title="Gagal masuk"
        message={error}
        retryLabel="Coba lagi"
        onRetry={() => setError(null)}
      />
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: theme.colors.bg }]}>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={theme.colors.muted}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.panel,
            borderColor: theme.colors.border,
            borderRadius: scale.radius.md,
            color: theme.colors.text,
            minHeight: MIN_TOUCH_TARGET_DP,
          },
        ]}
      />
      <Text style={[styles.hint, { color: theme.colors.muted }]}>
        Token akses hanya disimpan di memori (K17).
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 12, justifyContent: "center", padding: 24 },
  input: { borderWidth: 1, fontSize: 16, paddingHorizontal: 14 },
  hint: { fontSize: 13 },
});
