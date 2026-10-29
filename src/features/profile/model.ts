/**
 * M08 — model layar Profile.
 *
 * Sumber bentuk data:
 *   `/api/me`             -> `api_server.py::_row_user`
 *   `/api/profile/titles` -> daftar gelar yang sudah terbuka
 *   `/api/catalog/avatar-classes` -> `db.AVATAR_CLASSES`
 *
 * Yang ditampilkan di ponsel adalah identitas + progres karakter, bukan seluruh
 * halaman Profile desktop (keamanan, backup codes, redeem, lock account tetap
 * di desktop — itu aksi berisiko tinggi yang tidak cocok dikerjakan dari layar
 * kecil, dan tidak ada di cakupan M08).
 */

import { percentOf } from "../tasks/model";

import { toUserSummary, type UserSummary } from "../dashboard/model";

export interface ProfileBar {
  labelKey: string;
  value: number;
  max: number;
  percent: number;
}

export function profileBars(user: UserSummary): ProfileBar[] {
  return [
    {
      labelKey: "dashboard_xp",
      value: user.xp,
      max: user.xpToNextLevel,
      percent: percentOf(user.xp, user.xpToNextLevel),
    },
    {
      labelKey: "dashboard_hp",
      value: user.hp,
      max: user.maxHp,
      percent: percentOf(user.hp, user.maxHp),
    },
    {
      labelKey: "dashboard_mp",
      value: user.mp,
      max: user.maxMp,
      percent: percentOf(user.mp, user.maxMp),
    },
  ];
}

export interface ProfileStat {
  labelKey: string;
  value: string;
}

/**
 * Kartu statistik. `formatMoney` TIDAK dipakai untuk gold: gold adalah mata
 * uang dalam game (bilangan bulat), bukan uang sungguhan. Aturan "uang lewat
 * formatMoney" berlaku untuk Economy (Wave 2) yang memakai kolom `currency`.
 */
export function profileStats(user: UserSummary): ProfileStat[] {
  return [
    { labelKey: "dashboard_gold", value: String(user.gold) },
    { labelKey: "dashboard_streak", value: String(user.longestStreak) },
    { labelKey: "dashboard_level", value: String(user.level) },
  ];
}

export interface ProfileHeader {
  displayName: string;
  avatarEmoji: string;
  level: number;
  title: string;
}

export function profileHeader(user: UserSummary): ProfileHeader {
  return {
    displayName: user.displayName,
    avatarEmoji: user.avatarEmoji,
    level: user.level,
    title: user.selectedTitle,
  };
}

export interface TitleOption {
  key: string;
  label: string;
  selected: boolean;
}

/**
 * `db.get_unlocked_titles` mengembalikan baris DB apa adanya, jadi bentuknya
 * dibaca defensif: `key`/`title`/`name` semua mungkin muncul tergantung versi
 * skema. Gelar tanpa kunci dilewati — memilih gelar kosong akan mengirim
 * string kosong ke `/api/profile/title`.
 */
export function toTitleOptions(
  titles: unknown,
  selectedTitle: string,
): TitleOption[] {
  if (!Array.isArray(titles)) return [];
  const out: TitleOption[] = [];
  for (const item of titles) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    const key =
      typeof t.key === "string" && t.key !== ""
        ? t.key
        : typeof t.title_key === "string"
          ? t.title_key
          : "";
    const label =
      typeof t.label === "string" && t.label !== ""
        ? t.label
        : typeof t.name === "string"
          ? t.name
          : key;
    if (!key) continue;
    out.push({ key, label, selected: key === selectedTitle });
  }
  return out;
}

export interface ClassOption {
  key: string;
  name: string;
  icon: string;
  bonus: string;
  selected: boolean;
}

export function toClassOptions(classes: unknown, activeKey: string): ClassOption[] {
  if (!Array.isArray(classes)) return [];
  const out: ClassOption[] = [];
  for (const item of classes) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const key = typeof c.key === "string" ? c.key : "";
    if (!key) continue;
    out.push({
      key,
      name: typeof c.name === "string" && c.name !== "" ? c.name : key,
      icon: typeof c.icon === "string" ? c.icon : "",
      bonus: typeof c.bonus === "string" ? c.bonus : "",
      selected: key === activeKey,
    });
  }
  return out;
}

/**
 * Draft untuk `POST /api/settings`.
 *
 * Hanya field yang benar-benar dibaca handler itu yang dikirim
 * (`api_server.py:2121`): `displayName`, `bio`, `avatar`, `heroClass`,
 * `language`, `theme`. Mengirim field lain tidak berbahaya tapi juga tidak
 * berpengaruh, dan memberi kesan tersimpan padahal tidak.
 */
export interface ProfileDraft {
  displayName: string;
  bio: string;
  avatar: string;
}

export function emptyProfileDraft(user: UserSummary | null): ProfileDraft {
  return {
    displayName: user?.displayName ?? "",
    bio: "",
    avatar: user?.avatarEmoji ?? "⚔️",
  };
}

export function draftError(draft: ProfileDraft): "empty-name" | null {
  return draft.displayName.trim() === "" ? "empty-name" : null;
}

export function profilePayload(draft: ProfileDraft): Record<string, unknown> {
  return {
    displayName: draft.displayName.trim(),
    bio: draft.bio,
    avatar: draft.avatar,
  };
}

export { toUserSummary };
