/**
 * M08 wave 3 — tes model Supplies / Notes / Reminders / Calendar / Pomodoro.
 *
 * Fokusnya aturan backend yang kalau dilanggar menyimpan data salah TANPA
 * error apa pun:
 *
 *  • catatan: `pinned` tidak boleh ikut saat menyimpan isi (backend memakai
 *    None = "jangan ubah", jadi mengirimnya menimpa sematan);
 *  • pengingat: `repeatDays` hanya dikirim untuk pengulangan kustom saat
 *    membuat, tetapi SELALU dikirim saat memperbarui;
 *  • kalender: catatan kosong berarti hapus;
 *  • pomodoro: sisa waktu dihitung dari selisih waktu, bukan jumlah tick;
 *  • supplies: stok tidak boleh negatif lewat transaksi "keluar".
 */

import { describe, expect, it } from "vitest";

import {
  CALENDAR_PATH,
  calendarNotePayload,
  monthCells,
  monthHasNotes,
  monthLabelKey,
  parseCalendarPayload,
  parseHolidaysPayload,
  shiftMonth,
  toYmd,
  WEEKDAY_HEADER_KEYS,
} from "../src/features/calendar/model";
import {
  ATTACHMENT_MAX_BYTES,
  attachmentRejection,
  attachmentUploadBody,
  countByFolder,
  draftError as noteDraftError,
  draftFromNote,
  emptyNoteDraft,
  filterNotes,
  formatFileSize,
  noteCreatePayload,
  notePreview,
  noteUpdatePayload,
  parseNotesPackage,
  sortNotes,
  toNoteRow,
  toNoteRows,
} from "../src/features/notes/model";
import {
  completePayload,
  estimateReward,
  formatClock,
  initialTimerState,
  isFinished,
  pause,
  pomodoroStats,
  progressPercent,
  readReward,
  remainingMs,
  reset,
  resume,
  sessionsOn,
  setFocusMinutes,
  setLabel,
  startBreak,
  startFocus,
  toPomodoroSessions,
} from "../src/features/pomodoro/model";
import {
  countsByState,
  draftError as reminderDraftError,
  draftDatetime,
  emptyReminderDraft,
  minutesUntil,
  parseRepeatDays,
  relativeLabelKey,
  relativeParts,
  reminderCreatePayload,
  reminderDate,
  reminderState,
  reminderUpdatePayload,
  toReminderRows,
  toggleRepeatDay,
  WEEKDAY_LABEL_KEY,
} from "../src/features/reminders/model";
import {
  applyTx,
  draftError as supplyDraftError,
  emptySupplyDraft,
  filterSupplies,
  stockState,
  supplyPayload,
  supplyTotals,
  supplyTxPayload,
  toSupplyRows,
  txDraftFor,
  txError,
} from "../src/features/supplies/model";

// ── Supplies ────────────────────────────────────────────────────────────────

describe("supplies/model", () => {
  const rice = { id: "1", name: "Beras", category: "Dapur", unit: "kg", stock: 2, minStock: 5, price: 12000 };
  const soap = { id: "2", name: "Sabun", category: "Mandi", unit: "pcs", stock: 0, minStock: 0, price: 4000 };
  const pen = { id: "3", name: "Pulpen", category: "Alat tulis", unit: "pcs", stock: 9, minStock: 2, price: 3000, location: "Meja" };

  it("baris tanpa id dibuang; diurutkan A-Z", () => {
    const rows = toSupplyRows([pen, { name: "Tanpa id" }, soap, rice]);
    expect(rows.map((r) => r.name)).toEqual(["Beras", "Pulpen", "Sabun"]);
  });

  it("habis / menipis / aman dibedakan, dan minStock 0 berarti tanpa batas", () => {
    const rows = toSupplyRows([rice, soap, pen]);
    expect(rows.map(stockState)).toEqual(["low", "ok", "out"]);
  });

  it("nilai stok = Σ stok × harga, dalam IDR", () => {
    const totals = supplyTotals(toSupplyRows([rice, soap, pen]));
    expect(totals).toEqual({ items: 3, outCount: 1, lowCount: 1, stockValueIdr: 2 * 12000 + 9 * 3000 });
  });

  it("pencarian menyertakan lokasi dan catatan, bukan hanya nama", () => {
    const rows = toSupplyRows([pen, rice]);
    expect(filterSupplies(rows, "meja", null, false).map((r) => r.id)).toEqual(["3"]);
    expect(filterSupplies(rows, "", null, true).map((r) => r.id)).toEqual(["1"]);
    expect(filterSupplies(rows, "", "Dapur", false).map((r) => r.id)).toEqual(["1"]);
  });

  it("payload memakai minStock camelCase dan harga dalam mata uang pengguna", () => {
    const draft = { ...emptySupplyDraft(), name: "Beras", stock: 5, minStock: 2, priceInput: "12000" };
    const payload = supplyPayload(draft, 12000);
    expect(payload).toMatchObject({ name: "Beras", stock: 5, minStock: 2, price: 12000, unit: "pcs" });
    expect("min_stock" in payload).toBe(false);
    expect(supplyDraftError(emptySupplyDraft())).toBe("empty-name");
    expect(supplyDraftError({ ...draft, stock: -1 })).toBe("bad-stock");
  });

  it("transaksi keluar tidak boleh membuat stok negatif", () => {
    const row = toSupplyRows([rice])[0]!;
    const draft = { ...txDraftFor(row, "out"), qty: 10 };
    expect(txError(draft)).toBe("over-stock");
    expect(txError({ ...draft, qty: 0 })).toBe("bad-qty");
    expect(txError({ ...draft, qty: 1 })).toBeNull();
  });

  it("payload transaksi hanya menyertakan bagian ekonomi kalau diminta", () => {
    const row = toSupplyRows([rice])[0]!;
    expect(supplyTxPayload(txDraftFor(row, "in"), 0)).toEqual({ kind: "in", qty: 1, note: "" });
    expect(
      supplyTxPayload({ ...txDraftFor(row, "in"), logEconomy: true, qty: 3 }, 36000),
    ).toMatchObject({ kind: "in", qty: 3, logEconomy: true, economyAmount: 36000 });
  });

  it("stok hasil transaksi tidak pernah negatif", () => {
    const row = toSupplyRows([soap])[0]!;
    expect(applyTx(row, "out", 5).stock).toBe(0);
    expect(applyTx(row, "in", 2).stock).toBe(2);
  });
});

// ── Notes ───────────────────────────────────────────────────────────────────

describe("notes/model", () => {
  const note = (over: Record<string, unknown> = {}) => ({
    id: "1", title: "Judul", content: "Isi", isPinned: false, isArchived: false,
    updatedAt: "2026-10-01T08:00:00", ...over,
  });

  it("disematkan di atas, lalu yang paling baru diubah", () => {
    const rows = toNoteRows([
      note({ id: "a", updatedAt: "2026-10-01T00:00:00" }),
      note({ id: "b", updatedAt: "2026-10-09T00:00:00" }),
      note({ id: "c", updatedAt: "2026-10-05T00:00:00", isPinned: true }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(toNoteRow({ title: "Tanpa id" })).toBeNull();
  });

  it("preview memakai baris tidak-kosong pertama dan dipotong", () => {
    expect(notePreview("\n\n  \nBaris pertama\nBaris kedua")).toBe("Baris pertama");
    expect(notePreview("x".repeat(200)).length).toBe(140);
  });

  it("filter memisahkan arsip dan folder", () => {
    const rows = toNoteRows([
      note({ id: "a" }),
      note({ id: "b", isArchived: true }),
      note({ id: "c", folderId: "7" }),
    ]);
    expect(filterNotes(rows, { search: "", folderId: null, archived: false }).map((r) => r.id))
      .toEqual(["a", "c"]);
    expect(filterNotes(rows, { search: "", folderId: "7", archived: false }).map((r) => r.id))
      .toEqual(["c"]);
    expect(filterNotes(rows, { search: "", folderId: null, archived: true }).map((r) => r.id))
      .toEqual(["b"]);
    expect(countByFolder(rows).get(null)).toBe(1);
  });

  it("payload simpan TIDAK mengirim pinned", () => {
    const draft = draftFromNote(toNoteRows([note({ isPinned: true })])[0]!);
    const payload = noteUpdatePayload(draft);
    expect("pinned" in payload).toBe(false);
    expect(payload).toMatchObject({ title: "Judul", content: "Isi" });
  });

  it("catatan baru tanpa judul memakai awal isi sebagai judul", () => {
    const draft = { ...emptyNoteDraft(null), content: "Beli susu dan telur" };
    expect(noteCreatePayload(draft).title).toBe("Beli susu dan telur");
    expect(noteDraftError(emptyNoteDraft(null))).toBe("empty");
    expect(noteDraftError(draft)).toBeNull();
  });

  it("lampiran ditolak sebelum diunggah bila jenis/ukuran salah", () => {
    expect(attachmentRejection("catatan.exe", 100)).toBe("bad-type");
    expect(attachmentRejection("foto.png", ATTACHMENT_MAX_BYTES + 1)).toBe("too-large");
    expect(attachmentRejection("foto.PNG", 1000)).toBeNull();
    // Ukuran tidak diketahui -> coba dulu, biarkan server memutuskan.
    expect(attachmentRejection("foto.png", undefined)).toBeNull();
  });

  it("body unggahan membuang parameter charset dari MIME", () => {
    expect(attachmentUploadBody("12", "a.txt", "text/plain; charset=utf-8", "QUJD")).toEqual({
      target: "note_attachment",
      noteId: 12,
      name: "a.txt",
      mime: "text/plain",
      dataBase64: "QUJD",
    });
  });

  it("ukuran berkas diformat bertingkat", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("satu respons dipakai untuk catatan, folder, dan lampiran", () => {
    const pkg = parseNotesPackage({
      notes: [note({ id: "a" })],
      noteFolders: [{ id: "7", name: "Kuliah", icon: "📚" }],
      noteAttachments: [{ id: "9", noteId: "a", fileName: "f.pdf", size: 12, kind: "file" }],
    });
    expect(pkg?.notes).toHaveLength(1);
    expect(pkg?.folders[0]?.name).toBe("Kuliah");
    expect(pkg?.attachments[0]?.fileName).toBe("f.pdf");
    expect(parseNotesPackage(null)).toBeNull();
  });

  it("sortNotes tidak mengubah array masukan", () => {
    const input = toNoteRows([note({ id: "a", isPinned: false }), note({ id: "b", isPinned: true })]);
    const before = input.map((r) => r.id);
    sortNotes(input);
    expect(input.map((r) => r.id)).toEqual(before);
  });
});

// ── Reminders ───────────────────────────────────────────────────────────────

describe("reminders/model", () => {
  const SERVER_NOW = new Date(2026, 9, 13, 8, 0, 0); // 13 Okt 2026 08:00

  it("datetime dibaca sebagai waktu lokal, bukan UTC", () => {
    const d = reminderDate("2026-10-13 08:00:00");
    expect(d?.getHours()).toBe(8);
    expect(d?.getDate()).toBe(13);
    expect(reminderDate("bukan tanggal")).toBeNull();
  });

  it("yang aktif diurutkan lebih dulu, lalu berdasarkan waktu", () => {
    const rows = toReminderRows([
      { id: "1", title: "Nonaktif", datetime: "2026-10-13 07:00:00", isActive: false },
      { id: "2", title: "Nanti", datetime: "2026-10-14 09:00:00" },
      { id: "3", title: "Dulu", datetime: "2026-10-12 09:00:00" },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["3", "2", "1"]);
  });

  it("tanpa jam server tidak ada yang dianggap lewat", () => {
    const rows = toReminderRows([{ id: "1", title: "Lama", datetime: "2020-01-01 00:00:00" }]);
    expect(reminderState(rows[0]!, null)).toBe("upcoming");
    expect(reminderState(rows[0]!, SERVER_NOW)).toBe("due");
    expect(minutesUntil("2020-01-01 00:00:00", null)).toBeNull();
  });

  it("status: aktif/tidak, sudah terpicu, dan akan datang", () => {
    const base = { id: "1", title: "x", datetime: "2026-10-13 09:00:00" };
    expect(reminderState(toReminderRows([base])[0]!, SERVER_NOW)).toBe("upcoming");
    expect(reminderState(toReminderRows([{ ...base, isActive: false }])[0]!, SERVER_NOW)).toBe("off");
    expect(reminderState(toReminderRows([{ ...base, triggered: true }])[0]!, SERVER_NOW)).toBe("done");
    expect(countsByState(toReminderRows([base, { ...base, id: "2", isActive: false }]), SERVER_NOW))
      .toEqual({ upcoming: 1, due: 0, done: 0, off: 1 });
  });

  it("selisih waktu dan label relatifnya", () => {
    expect(minutesUntil("2026-10-13 08:30:00", SERVER_NOW)).toBe(30);
    expect(relativeLabelKey(30)).toBe("mobile_reminder_in_minutes");
    expect(relativeLabelKey(-90)).toBe("mobile_reminder_ago_hours");
    expect(relativeLabelKey(null)).toBe("mobile_reminder_time_unknown");
    expect(relativeParts(90)).toEqual({ value: 2, unitMinutes: 60 });
    expect(relativeParts(60 * 24 * 3)).toEqual({ value: 3, unitMinutes: 60 * 24 });
  });

  it("repeatDays hanya dikirim untuk kustom saat MEMBUAT", () => {
    const base = { ...emptyReminderDraft("2026-10-13", "08:00"), title: "Olahraga" };
    expect(reminderCreatePayload({ ...base, repeat: "daily" })).not.toHaveProperty("repeatDays");
    expect(reminderCreatePayload({ ...base, repeat: "custom", repeatDays: "0,3" }))
      .toMatchObject({ repeat: "custom", repeatDays: "0,3" });
    expect(draftDatetime(base)).toBe("2026-10-13 08:00:00");
    // Nada kustom tidak pernah dikirim: berkasnya belum diunggah.
    expect("soundFile" in reminderCreatePayload(base)).toBe(false);
  });

  it("saat MEMPERBARUI, repeat dan repeatDays selalu ikut", () => {
    const base = { ...emptyReminderDraft("2026-10-13", "08:00"), title: "Olahraga" };
    const payload = reminderUpdatePayload({ ...base, repeat: "weekly" });
    // Backend memperlakukan field yang absen sebagai "jangan ubah"; layar edit
    // memang menampilkan keduanya, jadi keduanya harus dinyatakan.
    expect(payload).toMatchObject({ repeat: "weekly", repeatDays: "" });
    expect("repeat" in payload).toBe(true);
  });

  it("validasi draf", () => {
    expect(reminderDraftError(emptyReminderDraft("2026-10-13"))).toBe("empty-title");
    const titled = { ...emptyReminderDraft("2026-10-13"), title: "x" };
    expect(reminderDraftError({ ...titled, date: "13/10/2026" })).toBe("bad-date");
    expect(reminderDraftError({ ...titled, time: "25:00" })).toBe("bad-time");
    expect(reminderDraftError(titled)).toBeNull();
  });

  it("hari kustom memakai konvensi Senin=0 dan bisa dibalik", () => {
    expect(parseRepeatDays("3,0, 1 ")).toEqual([0, 1, 3]);
    expect(parseRepeatDays("9,x")).toEqual([]);
    expect(toggleRepeatDay("0,2", 2)).toBe("0");
    expect(toggleRepeatDay("0", 6)).toBe("0,6");
    expect(WEEKDAY_LABEL_KEY).toHaveLength(7);
    expect(WEEKDAY_LABEL_KEY[0]).toBe("day_mon_short");
  });
});

// ── Calendar ────────────────────────────────────────────────────────────────

describe("calendar/model", () => {
  it("rutenya endpoint agregat kalender", () => {
    expect(CALENDAR_PATH).toBe("/api/calendar");
  });

  it("kisi selalu 42 kotak, Senin di kiri", () => {
    // 1 Oktober 2026 adalah Jumat (getDay 4) -> indeks 3 kalau Senin=0.
    const cells = monthCells(2026, 10, "2026-10-13");
    expect(cells).toHaveLength(42);
    expect(cells[0]?.weekday).toBe(0);
    expect(cells[3]?.ymd).toBe("2026-10-01");
    expect(cells[3]?.inMonth).toBe(true);
    expect(cells[0]?.inMonth).toBe(false);
    expect(cells.find((c) => c.isToday)?.ymd).toBe("2026-10-13");
    expect(WEEKDAY_HEADER_KEYS[0]).toBe("day_mon_short");
  });

  it("tanpa tanggal server tidak ada kotak yang dianggap hari ini", () => {
    expect(monthCells(2026, 10, null).some((c) => c.isToday)).toBe(false);
  });

  it("kunci bulan memakai dua digit", () => {
    expect(monthLabelKey(1)).toBe("month_01");
    expect(monthLabelKey(10)).toBe("month_10");
    expect(monthLabelKey(12)).toBe("month_12");
  });

  it("pindah bulan melintasi batas tahun", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month1: 12 });
    expect(shiftMonth(2025, 12, 1)).toEqual({ year: 2026, month1: 1 });
  });

  it("tanggal tanpa format sah dibuang", () => {
    const map = parseCalendarPayload({
      calendarNotes: [
        { date: "2026-10-13", note: "Rapat" },
        { date: "bukan-tanggal", note: "x" },
        { note: "tanpa tanggal" },
      ],
    });
    expect(map?.size).toBe(1);
    expect(map?.get("2026-10-13")).toBe("Rapat");
    expect(parseCalendarPayload(null)).toBeNull();
  });

  it("nama libur dipilih menurut bahasa, dengan cadangan", () => {
    const raw = { holidays: [{ date: "2026-08-17", nameId: "Kemerdekaan", nameEn: "" }] };
    expect(parseHolidaysPayload(raw, "id")?.get("2026-08-17")).toBe("Kemerdekaan");
    // nameEn kosong -> jatuh ke nameId, bukan string kosong.
    expect(parseHolidaysPayload(raw, "en")?.get("2026-08-17")).toBe("Kemerdekaan");
  });

  it("catatan kosong dikirim sebagai string kosong (= hapus)", () => {
    expect(calendarNotePayload("2026-10-13", "   ")).toEqual({ date: "2026-10-13", note: "" });
    expect(calendarNotePayload("2026-10-13", " Rapat ")).toEqual({ date: "2026-10-13", note: "Rapat" });
  });

  it("penanda hari hanya menghitung catatan yang tidak kosong", () => {
    const cells = monthCells(2026, 10, null);
    const notes = new Map([["2026-10-05", "Rapat"], ["2026-10-06", "   "]]);
    expect([...monthHasNotes(cells, notes)]).toEqual(["2026-10-05"]);
    expect(toYmd(2026, 1, 5)).toBe("2026-01-05");
  });
});

// ── Pomodoro ────────────────────────────────────────────────────────────────

describe("pomodoro/model", () => {
  const T0 = 1_000_000;

  it("sisa waktu dihitung dari selisih waktu, bukan jumlah tick", () => {
    const running = startFocus(initialTimerState(25), T0);
    // Tick telat 40 detik: sisa waktu tetap benar karena berbasis endsAt.
    expect(remainingMs(running, T0 + 60_000)).toBe(24 * 60_000);
    expect(remainingMs(running, T0 + 25 * 60_000)).toBe(0);
    expect(isFinished(running, T0 + 25 * 60_000)).toBe(true);
    expect(isFinished(running, T0)).toBe(false);
  });

  it("sisa waktu tidak pernah negatif", () => {
    const running = startFocus(initialTimerState(1), T0);
    expect(remainingMs(running, T0 + 999_999_999)).toBe(0);
    expect(progressPercent(running, T0 + 999_999_999)).toBe(100);
  });

  it("jeda lalu lanjut mempertahankan sisa waktu", () => {
    const running = startFocus(initialTimerState(25), T0);
    const paused = pause(running, T0 + 5 * 60_000);
    expect(paused.phase).toBe("paused");
    expect(remainingMs(paused, T0 + 99 * 60_000)).toBe(20 * 60_000);
    const resumed = resume(paused, T0 + 60 * 60_000);
    expect(resumed.phase).toBe("focus");
    expect(remainingMs(resumed, T0 + 60 * 60_000)).toBe(20 * 60_000);
    expect(remainingMs(resumed, T0 + 60 * 60_000 + 20 * 60_000)).toBe(0);
  });

  it("durasi tidak bisa diubah di tengah sesi berjalan", () => {
    const running = startFocus(initialTimerState(25), T0);
    expect(setFocusMinutes(running, 45).focusMinutes).toBe(25);
    expect(setFocusMinutes(initialTimerState(25), 45).focusMinutes).toBe(45);
    expect(setFocusMinutes(initialTimerState(25), -3).focusMinutes).toBe(1);
  });

  it("label tersimpan dan ikut di payload", () => {
    const state = setLabel(startFocus(initialTimerState(25), T0), "  Menulis laporan ");
    expect(completePayload(state)).toEqual({ durationMinutes: 25, label: "Menulis laporan" });
  });

  it("istirahat memakai panjangnya sendiri dan kembali lewat reset", () => {
    const brk = startBreak(startFocus(initialTimerState(25), T0), T0);
    expect(brk.phase).toBe("break");
    expect(remainingMs(brk, T0)).toBe(5 * 60_000);
    const back = reset(brk);
    expect(back.phase).toBe("idle");
    expect(back.focusMinutes).toBe(25);
  });

  it("perkiraan hadiah memakai rumus backend (1 XP/menit, 1 Gold/5 menit, min 2)", () => {
    expect(estimateReward(25)).toEqual({ xp: 25, gold: 5 });
    expect(estimateReward(1)).toEqual({ xp: 1, gold: 2 });
    expect(estimateReward(7)).toEqual({ xp: 7, gold: 2 });
  });

  it("hasil server dibaca dari field snake_case", () => {
    expect(readReward({ result: { xp_gained: 25, gold_gained: 5 } })).toEqual({ xp: 25, gold: 5 });
    expect(readReward({ result: {} })).toBeNull();
    expect(readReward(null)).toBeNull();
  });

  it("jam diformat mm:ss dan dibulatkan ke atas", () => {
    expect(formatClock(0)).toBe("00:00");
    // 59,4 detik dibulatkan KE ATAS jadi 60 detik -> 01:00, bukan 00:59.
    // Membulatkan ke bawah akan menampilkan 00:00 sesaat sebelum sesi selesai.
    expect(formatClock(59_400)).toBe("01:00");
    expect(formatClock(25 * 60_000)).toBe("25:00");
  });

  it("riwayat terbaru dulu dan bisa disaring per tanggal", () => {
    const rows = toPomodoroSessions([
      { id: "1", durationMinutes: 25, completedAt: "2026-10-12 09:00:00", xpEarned: 25, goldEarned: 5 },
      { id: "2", durationMinutes: 15, completedAt: "2026-10-13 09:00:00", xpEarned: 15, goldEarned: 3 },
      // Baris TANPA id dibuang: tanpa id ia tidak bisa di-cache, di-outbox,
      // maupun dipakai sebagai key React.
      { durationMinutes: 25, completedAt: "2026-10-11 09:00:00" },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["2", "1"]);
    expect(sessionsOn(rows, "2026-10-13").map((r) => r.id)).toEqual(["2"]);
    expect(pomodoroStats(rows)).toEqual({ sessions: 2, minutes: 40, xp: 40, gold: 8 });

    // Baris ber-id tapi tanpa tanggal TETAP muncul (nol), bukan hilang diam-diam:
    // sesi itu nyata dan XP-nya sudah masuk, hanya waktunya yang tidak diketahui.
    const noDate = toPomodoroSessions([{ id: "9", xpEarned: 5, goldEarned: 2 }]);
    expect(noDate).toHaveLength(1);
    expect(noDate[0]?.completedAt).toBe("");
    expect(sessionsOn(noDate, "2026-10-13")).toHaveLength(0);
  });
});
