/**
 * M07 — padanan `web/src/bridge.ts` untuk Android.
 *
 * Di desktop, PyQt menyuntikkan `window.craftlifeNative`. Di Android tidak ada
 * jembatan seperti itu: kemampuan native dipanggil langsung lewat modul Expo.
 * Kontraknya dibuat sama supaya kode fitur tidak perlu tahu platform mana yang
 * sedang berjalan.
 *
 * Catatan kejujuran: roadmap menyebut "3 method bridge.ts", tapi
 * `web/src/bridge.ts` yang ada hanya mengekspor 2 (`pickFile`, `notify`).
 * `openPath` ada di tipe `Native` namun tidak diekspor. Ketiganya diimplementasi
 * di sini karena Android memang butuh share intent.
 *
 * Semua fungsi dirancang TIDAK melempar exception. Kegagalan kemampuan native
 * (izin ditolak, tidak ada app pembuka) dikembalikan sebagai null/false, karena
 * pemanggilnya adalah alur UI dan crash di sana jauh lebih buruk daripada
 * kegagalan yang tenang.
 */

import * as DocumentPicker from "expo-document-picker";
import * as Notifications from "expo-notifications";
import * as Sharing from "expo-sharing";

export interface PickedFile {
  uri: string;
  name: string | null;
  size: number | null;
  mimeType: string | null;
}

export const bridge = {
  /**
   * SAF (Storage Access Framework) lewat expo-document-picker.
   *
   * `accept` di web adalah string MIME seperti "image/*". Di sini diteruskan
   * apa adanya sebagai tipe yang diizinkan.
   */
  async pickFile(accept?: string): Promise<PickedFile | null> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: accept ?? "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return null;
      const asset = result.assets[0];
      if (!asset) return null;
      return {
        uri: asset.uri,
        name: asset.name ?? null,
        size: asset.size ?? null,
        mimeType: asset.mimeType ?? null,
      };
    } catch {
      return null;
    }
  },

  /**
   * Notifikasi lokal. Izin diminta saat dipakai, bukan saat aplikasi dibuka,
   * supaya prompt muncul pada momen yang masuk akal bagi pengguna.
   */
  async notify(title: string, body: string): Promise<boolean> {
    try {
      const status = await Notifications.getPermissionsAsync();
      let granted = status.granted;
      if (!granted && !status.canAskAgain) return false;
      if (!granted) {
        const asked = await Notifications.requestPermissionsAsync();
        granted = asked.granted;
      }
      if (!granted) return false;
      await Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: null,
      });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Padanan `openPath`. Android tidak punya "buka folder", jadi yang paling
   * mendekati adalah share intent: pengguna memilih app tujuan sendiri.
   * Mengembalikan false kalau tidak ada app yang bisa membuka.
   */
  async openPath(uri: string): Promise<boolean> {
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) return false;
      await Sharing.shareAsync(uri);
      return true;
    } catch {
      return false;
    }
  },
};
