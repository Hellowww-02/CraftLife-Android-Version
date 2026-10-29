/**
 * Menu "More" — katalog fitur 1:1 dengan sidebar desktop.
 *
 * Sumber kebenaran urutan & label: `MainPyQt6.py` → `NavBar._TABS`
 * (disalin juga di web `components/Sidebar.tsx`). Test `menuModel.test.ts`
 * menambatkan urutan ini ke file desktop tersebut, jadi kalau desktop suatu
 * hari menambah menu, test memaksa Android menyusul — parity bukan klaim.
 *
 * Ikon memakai emoji: di Android emoji dirender oleh sistem (tanpa font
 * tambahan), dan data server (habit/achievement/pet/boss) memang ber-emoji —
 * jadi bahasa visualnya sama dengan desktop.
 */

export type MenuItem = {
  /** Kunci stabil untuk test & React key. */
  key: string;
  /** Emoji sebagai ikon baris. */
  icon: string;
  /** Kunci i18n label (harus ada di `messages.json` id + en). */
  labelKey: string;
  /** Pathname rute expo-router. */
  route: string;
  /** Parameter query untuk tab dalam, mis. `/tasks?tab=habits`. */
  params?: Record<string, string>;
};

/**
 * Item menu desktop, urutan persis `NavBar._TABS` MINUS `nav_home`
 * (Beranda sudah menjadi tab bawah, tidak diulang di menu).
 */
export const MORE_MENU_DESKTOP: MenuItem[] = [
  { key: "profile", icon: "🧑‍🚀", labelKey: "nav_profile", route: "/more/profile" },
  { key: "habits", icon: "⚡", labelKey: "nav_habits", route: "/tasks", params: { tab: "habits" } },
  { key: "dailies", icon: "📅", labelKey: "nav_dailies", route: "/tasks", params: { tab: "dailies" } },
  { key: "quests", icon: "🗺️", labelKey: "nav_quests", route: "/tasks", params: { tab: "quests" } },
  { key: "sport", icon: "🏃", labelKey: "nav_sporttrack", route: "/tracker", params: { tab: "sport" } },
  { key: "economy", icon: "💰", labelKey: "nav_economy", route: "/more/economy" },
  { key: "supplies", icon: "📦", labelKey: "nav_supplies", route: "/more/supplies" },
  { key: "health", icon: "🥗", labelKey: "nav_health_food", route: "/tracker", params: { tab: "food" } },
  { key: "love", icon: "❤️", labelKey: "nav_love", route: "/more/love" },
  { key: "learning", icon: "📚", labelKey: "nav_learning", route: "/more/learning" },
  { key: "pomodoro", icon: "⏱️", labelKey: "nav_pomodoro", route: "/more/pomodoro" },
  { key: "music", icon: "🎵", labelKey: "nav_music", route: "/more/music" },
  { key: "notes", icon: "📝", labelKey: "nav_notes", route: "/more/notes" },
  { key: "reminders", icon: "⏰", labelKey: "nav_reminders", route: "/more/reminders" },
  { key: "calendar", icon: "🗓️", labelKey: "nav_calendar", route: "/more/calendar" },
  { key: "crafting", icon: "⚒️", labelKey: "nav_crafting", route: "/more/crafting" },
  { key: "shop", icon: "🛍️", labelKey: "nav_shop", route: "/more/shop" },
  { key: "pets", icon: "🐾", labelKey: "nav_pets", route: "/more/pets" },
  { key: "friends", icon: "👥", labelKey: "nav_friends", route: "/more/friends" },
  { key: "guild", icon: "🛡️", labelKey: "nav_guild", route: "/more/guild" },
  { key: "achievements", icon: "🏆", labelKey: "nav_achievement", route: "/more/achievements" },
  { key: "leaderboard", icon: "🏅", labelKey: "nav_leaderboard", route: "/more/leaderboard" },
  { key: "settings", icon: "⚙️", labelKey: "nav_settings", route: "/more/settings" },
];

/**
 * Tambahan khas ponsel: di desktop bagian dari layar lain (tab di dalam
 * Friends/Guild/HealthFood/Cloud), di ponsel menjadi rute sendiri supaya
 * semuanya terjangkau dari satu menu. Ditaruh SETELAH urutan desktop agar
 * parity urutan desktop tetap bisa dipantek test.
 */
export const MORE_MENU_EXTRAS: MenuItem[] = [
  { key: "water", icon: "💧", labelKey: "food_tab_water", route: "/more/water" },
  { key: "chat", icon: "💬", labelKey: "mobile_chat_title", route: "/more/chat" },
  { key: "pvp", icon: "⚔️", labelKey: "mobile_pvp_title", route: "/more/pvp" },
  { key: "notifications", icon: "🔔", labelKey: "notif_title", route: "/more/notifications" },
  { key: "cloud", icon: "☁️", labelKey: "cloud_group", route: "/more/cloud" },
];

/** Daftar lengkap yang dirender layar More. */
export const MORE_MENU_ALL: MenuItem[] = [...MORE_MENU_DESKTOP, ...MORE_MENU_EXTRAS];
