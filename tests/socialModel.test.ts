/**
 * M10 — tes model Social.
 *
 * Yang dicegah: ponsel menebak status sosial. Teman yang "online" harus
 * benar-benar berstatus online di payload server; tombol admin guild
 * online hanya boleh muncul bila server menyebut peranmu leader/officer;
 * klaim PvP hanya untuk tantangan yang server tandai selesai.
 */

import { describe, expect, it } from "vitest";

import {
  parseChat,
  parseFriends,
  parseLeaderboard,
  parseLove,
  parseNotifications,
  parseOnlineGuild,
  parsePvp,
} from "../src/features/social/model";

describe("friends", () => {
  it("online dan unread duluan; presence dibaca dari server", () => {
    const { friends, requests } = parseFriends({
      friends: [
        { id: "1", displayName: "A", presence: "offline", unreadCount: 5 },
        { id: "2", displayName: "B", presence: "online", unreadCount: 0 },
      ],
      friendRequests: [{ id: "r1", senderId: "9", name: "C", username: "c" }],
    });
    expect(friends[0]?.id).toBe("2");
    expect(friends[0]?.isOnline).toBe(true);
    expect(friends[1]?.isOnline).toBe(false);
    expect(requests).toHaveLength(1);
  });
});

describe("chat", () => {
  it("membawa typing, reaksi, dan penanda lampiran dari payload", () => {
    const chat = parseChat({
      cloudMode: true,
      friendTyping: true,
      messages: [
        {
          id: "m1",
          text: "halo",
          isSelf: false,
          reactions: { "❤️": 2 },
          attachments: [{ id: 1 }],
          syncStatus: "synced",
        },
      ],
    });
    expect(chat.friendTyping).toBe(true);
    expect(chat.messages[0]?.reactions["❤️"]).toBe(2);
    expect(chat.messages[0]?.attachmentCount).toBe(1);
  });
});

describe("guild online", () => {
  it("tombol admin hanya untuk leader/officer menurut server", () => {
    const member = parseOnlineGuild({
      linked: true,
      summary: { guild_id: "g1", name: "Naga", role: "member" },
      members: [],
    });
    expect(member.canAdmin).toBe(false);
    const leader = parseOnlineGuild({
      linked: true,
      summary: { guild_id: "g1", name: "Naga", role: "leader" },
      members: [{ user_id: "u2", role: "member" }],
    });
    expect(leader.canAdmin).toBe(true);
    expect(leader.guildId).toBe("g1");
    const unlinked = parseOnlineGuild({ linked: false });
    expect(unlinked.linked).toBe(false);
    expect(unlinked.guildId).toBe("");
  });
});

describe("pvp", () => {
  it("respond hanya untuk tantangan pending dari lawan; klaim hanya yang selesai", () => {
    const rows = parsePvp({
      pvpChallenges: [
        { id: "1", opponentName: "A", status: "pending", isChallenger: false },
        { id: "2", opponentName: "B", status: "pending", isChallenger: true },
        { id: "3", opponentName: "C", status: "completed", isChallenger: true },
      ],
    });
    expect(rows[0]?.canRespond).toBe(true);
    expect(rows[1]?.canRespond).toBe(false);
    expect(rows[2]?.canClaim).toBe(true);
  });
});

describe("leaderboard & love & notifications", () => {
  it("leaderboard memakai urutan server dan menandai unlinked", () => {
    const lb = parseLeaderboard({
      linked: false,
      rows: [{ username: "a", level: 3, score: 10 }],
    });
    expect(lb.linked).toBe(false);
    expect(lb.rows[0]).toMatchObject({ rank: 1, name: "a", score: 10 });
  });

  it("love membaca profil + keenam koleksi tab", () => {
    const love = parseLove({
      loveSpace: {
        partnerName: "Sinta",
        myName: "Budi",
        memories: [{ id: "1", title: "Piknik", date: "2026-01-01" }],
        bucketList: [{ id: "2", title: "Ke Jepang", isCompleted: false }],
        checkins: [{ id: "3", date: "2026-10-01", myMood: 5 }],
        events: [],
        cycles: [{ id: "4", startDate: "2026-10-01", lengthDays: 28 }],
        photos: [],
      },
    });
    expect(love.partnerName).toBe("Sinta");
    expect(love.memories).toHaveLength(1);
    expect(love.bucket[0]?.isCompleted).toBe(false);
    expect(love.cycles[0]?.lengthDays).toBe(28);
  });

  it("notifikasi membedakan sudah/belum dibaca dari kedua ejaan server", () => {
    const rows = parseNotifications(
      {
        notifications: [
          { id: "1", message: "a", is_read: false },
          { id: "2", message: "b", isRead: true },
        ],
      },
      "cloud",
    );
    expect(rows[0]?.isRead).toBe(false);
    expect(rows[1]?.isRead).toBe(true);
    expect(rows[0]?.source).toBe("cloud");
  });
});
