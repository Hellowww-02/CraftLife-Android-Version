/**
 * M07 — pengelompokan layar "More".
 *
 * Sidebar desktop punya 24 item dan TIDAK disalin 1:1 ke Android (roadmap M07).
 * Lima tab bawah menampung yang paling sering dipakai; sisanya dikelompokkan di
 * layar More memakai label yang sudah ada di katalog i18n (`nav_group_*`,
 * translations.py:4627) supaya tidak menambah string baru tanpa perlu.
 *
 * `route` menunjuk ke file di app/ — deep link mengikuti jalur yang sama, jadi
 * satu rute punya satu arti di tab, di More, dan di deep link.
 */

export interface MoreItem {
  route: string;
  /** Kunci i18n yang sudah ada di translations.py. */
  labelKey: string;
}

export interface MoreGroup {
  labelKey: string;
  items: MoreItem[];
}

export const MORE_GROUPS: MoreGroup[] = [
  {
    labelKey: "nav_group_body",
    items: [
      { route: "/more/health", labelKey: "nav_health_food" },
      { route: "/more/water", labelKey: "food_tab_water" },
    ],
  },
  {
    labelKey: "nav_group_life",
    items: [
      { route: "/more/economy", labelKey: "nav_economy" },
      { route: "/more/supplies", labelKey: "supplies_title" },
      { route: "/more/notes", labelKey: "nav_notes" },
      { route: "/more/calendar", labelKey: "nav_calendar" },
      { route: "/more/pomodoro", labelKey: "nav_pomodoro" },
      { route: "/more/reminders", labelKey: "reminders_title" },
    ],
  },
  {
    labelKey: "nav_group_play",
    items: [
      { route: "/more/shop", labelKey: "nav_shop" },
      { route: "/more/pets", labelKey: "nav_pets" },
      { route: "/more/crafting", labelKey: "nav_crafting" },
      { route: "/more/achievements", labelKey: "nav_achievements" },
      { route: "/more/leaderboard", labelKey: "nav_leaderboard" },
      { route: "/more/music", labelKey: "nav_music" },
      { route: "/more/learning", labelKey: "nav_learning" },
    ],
  },
  {
    labelKey: "nav_group_social",
    items: [
      { route: "/more/friends", labelKey: "nav_friends" },
      { route: "/more/love", labelKey: "nav_love" },
    ],
  },
  {
    labelKey: "nav_group_system",
    items: [
      // M08: Profile masuk More. Ia bukan tab bawah karena frekuensi bukanya
      // jauh lebih rendah dari Dashboard/Tasks, dan menambah tab ke-6 akan
      // membuat label tab terpotong di layar kecil.
      { route: "/more/profile", labelKey: "nav_profile" },
      { route: "/more/settings", labelKey: "nav_settings" },
      { route: "/more/cloud", labelKey: "cloud_account_title" },
    ],
  },
];

/** Semua rute More, dipakai tes untuk memastikan tidak ada yang yatim. */
export const MORE_ROUTES: string[] = MORE_GROUPS.flatMap((g) => g.items.map((i) => i.route));
