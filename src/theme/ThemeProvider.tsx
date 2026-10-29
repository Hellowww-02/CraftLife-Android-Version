/**
 * M07 — penyedia tema. 12 tema dari token M06, satu sumber dengan web.
 *
 * Tema dipilih pengguna dan disimpan; kalau belum ada, jatuh ke `modern_dark`
 * karena itulah nilai default `:root` di web. Dengan begitu layar pertama di
 * Android tidak menampilkan warna yang berbeda dari desktop.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

import { DEFAULT_THEME_KEY, getTheme, themeKeys, type Theme } from "./tokens";

interface ThemeContextValue {
  theme: Theme;
  themeKey: string;
  setThemeKey: (key: string) => void;
  availableThemeKeys: string[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  initialThemeKey,
}: {
  children: React.ReactNode;
  initialThemeKey?: string | null;
}) {
  const [themeKey, setThemeKeyState] = useState<string>(initialThemeKey ?? DEFAULT_THEME_KEY);

  const setThemeKey = useCallback((key: string) => {
    // Tema yang tidak dikenal diabaikan, bukan membuat UI kosong.
    if (themeKeys.includes(key)) setThemeKeyState(key);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: getTheme(themeKey), themeKey, setThemeKey, availableThemeKeys: themeKeys }),
    [themeKey, setThemeKey],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme harus dipakai di dalam ThemeProvider");
  return ctx;
}
