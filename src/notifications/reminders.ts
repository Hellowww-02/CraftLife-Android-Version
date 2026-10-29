/**
 * M08 wave 3 — penjadwalan notifikasi LOKAL untuk pengingat.
 *
 * Kenapa notifikasi lokal, bukan push: pengingat milik satu pengguna di satu
 * ponsel, dan mendorongnya lewat server berarti pengingat tidak berbunyi saat
 * ponsel offline — justru saat paling dibutuhkan. Jadi jadwalnya ditanam di OS
 * (AlarmManager di Android) dan tetap berbunyi walau aplikasi ditutup.
 *
 * Modul ini SENGAJA terpisah dari `features/reminders/model.ts`: ia mengimpor
 * `expo-notifications`, modul native. Kalau model mengimpornya, vitest tidak
 * bisa memuat berkas itu sama sekali (React Native memakai Flow type di
 * entry-nya, dan Rollup menolaknya) — seluruh berkas tes akan memuat NOL tes.
 * Karena itu model tetap murni dan semua sentuhan native dikumpulkan di sini.
 *
 * Sumber kebenaran waktu pengulangan tetap server. Yang dilakukan modul ini
 * hanya menerjemahkan `repeat` + `repeatDays` + jam menjadi trigger OS; kalau
 * server menggeser `reminder_datetime` (mis. setelah `/trigger`), layar
 * memanggil `syncReminders` lagi dan jadwal lama diganti.
 */

import * as Notifications from "expo-notifications";

import {
  parseRepeatDays,
  reminderDate,
  type ReminderRow,
} from "../features/reminders/model";

/** Awalan id, supaya pembatalan massal tidak menyentuh notifikasi lain. */
const ID_PREFIX = "craftlife-reminder-";

/** Batas jadwal. Android membatasi alarm per aplikasi; 200 sudah jauh lebih
 *  dari cukup dan mencegah daftar pengingat panjang memenuhi kuota. */
const MAX_SCHEDULED = 200;

export type NotificationPermission = "granted" | "denied" | "undetermined";

export interface SyncResult {
  permission: NotificationPermission;
  scheduled: number;
  cancelled: number;
}

export function reminderNotificationId(reminderId: string): string {
  return `${ID_PREFIX}${reminderId}`;
}

/**
 * Tampilkan notifikasi walau aplikasi sedang terbuka.
 *
 * Tanpa handler, Android menyembunyikan notifikasi yang datang saat aplikasi
 * di depan — pengingat akan "berbunyi" tanpa suara dan tanpa banner.
 */
export function installForegroundHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function requestPermission(): Promise<NotificationPermission> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return "granted";
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted ? "granted" : asked.canAskAgain ? "undetermined" : "denied";
}

/** Minggu OS: 1..7 dengan 1 = Minggu. Model memakai 0 = Senin. */
export function osWeekdayFromModelIndex(index: number): number {
  const jsDay = (index + 1) % 7; // 0=Sun..6=Sat
  return jsDay + 1; // 1=Sun..7=Sat
}

type TriggerInput = Parameters<typeof Notifications.scheduleNotificationAsync>[0]["trigger"];

/**
 * Bangun trigger untuk satu pengingat.
 *
 * Mengembalikan LEBIH dari satu untuk pengulangan mingguan/kustom, karena
 * satu trigger OS hanya bisa menyatakan satu hari dalam seminggu.
 */
export function buildTriggers(row: ReminderRow): TriggerInput[] {
  const when = reminderDate(row.datetime);
  if (!when) return [];
  const hour = when.getHours();
  const minute = when.getMinutes();

  switch (row.repeat) {
    case "daily":
      return [{ type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute }];
    case "weekly":
      // `weekday` mengikuti tanggal yang tersimpan, bukan hari ini.
      return [
        {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: when.getDay() + 1,
          hour,
          minute,
        },
      ];
    case "yearly":
      return [
        {
          type: Notifications.SchedulableTriggerInputTypes.YEARLY,
          day: when.getDate(),
          month: when.getMonth(),
          hour,
          minute,
        },
      ];
    case "custom": {
      const days = parseRepeatDays(row.repeatDays);
      if (days.length === 0) return [];
      return days.map((index) => ({
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: osWeekdayFromModelIndex(index),
        hour,
        minute,
      }));
    }
    default:
      return [{ type: Notifications.SchedulableTriggerInputTypes.DATE, date: when }];
  }
}

/** Buang semua jadwal milik CraftLife, lalu kembalikan jumlahnya. */
export async function cancelAllReminderNotifications(): Promise<number> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  let cancelled = 0;
  for (const request of all) {
    const id = request.identifier;
    if (typeof id === "string" && id.startsWith(ID_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(id);
      cancelled += 1;
    }
  }
  return cancelled;
}

/**
 * Samakan jadwal OS dengan daftar pengingat.
 *
 * "Buang semua lalu pasang ulang" dipilih daripada mencocokkan satu per satu:
 * mencocokkan berarti membandingkan trigger lama dan baru, dan trigger OS
 * tidak selalu bisa dibaca balik dalam bentuk yang sama. Membangun ulang jauh
 * lebih mudah dipastikan benar, dan daftarnya kecil.
 *
 * Yang diabaikan (dan memang harus): pengingat nonaktif, yang sudah terpicu,
 * dan yang waktunya sudah lewat — menjadwalkan notifikasi di masa lalu akan
 * langsung berbunyi begitu aplikasi dibuka.
 */
export async function syncReminders(
  rows: readonly ReminderRow[],
  serverNow: Date | null,
): Promise<SyncResult> {
  const permission = await requestPermission();
  if (permission !== "granted") {
    return { permission, scheduled: 0, cancelled: 0 };
  }
  const cancelled = await cancelAllReminderNotifications();

  let scheduled = 0;
  const now = serverNow ?? new Date();
  for (const row of rows) {
    if (scheduled >= MAX_SCHEDULED) break;
    if (!row.isActive || row.triggered) continue;
    const when = reminderDate(row.datetime);
    // Pengingat sekali yang sudah lewat dilewati; yang berulang tetap
    // dijadwalkan karena occurrence berikutnya masih akan datang.
    if (row.repeat === "none" && when && when.getTime() <= now.getTime()) continue;

    for (const trigger of buildTriggers(row)) {
      if (scheduled >= MAX_SCHEDULED) break;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: row.title,
          body: row.description || undefined,
          // `data` dipakai kalau nanti notifikasi perlu membuka layar tertentu.
          data: { reminderId: row.id },
          sound: "default",
        },
        trigger,
      });
      scheduled += 1;
    }
  }
  return { permission, scheduled, cancelled };
}
