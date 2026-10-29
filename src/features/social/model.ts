/**
 * M10 — model murni untuk layar Social (Friends, Chat, Guild, PvP,
 * Leaderboard, Love Space, Notifications).
 *
 * Semua payload di sini dibentuk server: daftar teman + presence + unread
 * dari `/api/friends`, pesan hybrid cloud/lokal dari
 * `/api/friends/{id}/chat`, guild lokal dari `/api/guild`, guild online
 * dari jembatan `/api/cloud/guild-online`, dan Love Space dari
 * `/api/love`. Model hanya menata ulang menjadi baris tampilan — status
 * online, siapa menang PvP, dan apakah sesuatu bisa diklaim diputuskan
 * server; menebaknya di ponsel akan menciptakan sumber kebenaran kedua.
 */

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function asList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is Record<string, unknown> => !!v && typeof v === "object",
  );
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value ? value : fallback;
}

// ── Friends ────────────────────────────────────────────────────────────────

export interface FriendRow {
  id: string;
  displayName: string;
  username: string;
  avatarEmoji: string;
  level: number;
  coupleStatus: string;
  presence: string;
  isOnline: boolean;
  unreadCount: number;
}

export interface FriendRequestRow {
  id: string;
  senderId: string;
  name: string;
  username: string;
}

export function parseFriends(raw: unknown): {
  friends: FriendRow[];
  requests: FriendRequestRow[];
} {
  const data = asRecord(raw);
  const friends = asList(data.friends).map((f) => {
    const presence = str(f.presence, "offline");
    return {
      id: str(f.id),
      displayName: str(f.displayName, str(f.username, "?")),
      username: str(f.username),
      avatarEmoji: str(f.avatarEmoji, "⚔️"),
      level: num(f.level, 1),
      coupleStatus: str(f.coupleStatus, "friend"),
      presence,
      isOnline: presence === "online",
      unreadCount: num(f.unreadCount),
    };
  });
  // Yang online dan yang punya pesan belum dibaca duluan — itu yang dicari.
  friends.sort((a, b) =>
    a.isOnline === b.isOnline
      ? b.unreadCount - a.unreadCount
      : a.isOnline
        ? -1
        : 1,
  );
  const requests = asList(data.friendRequests).map((r) => ({
    id: str(r.id),
    senderId: str(r.senderId),
    name: str(r.name, str(r.username, "?")),
    username: str(r.username),
  }));
  return { friends, requests };
}

// ── Chat ───────────────────────────────────────────────────────────────────

export interface ChatMessageRow {
  id: string;
  text: string;
  isSelf: boolean;
  createdAt: string;
  editedAt: string;
  deletedAt: string;
  replyToId: string | null;
  syncStatus: string;
  reactions: Record<string, number>;
  attachmentCount: number;
}

export function parseChat(raw: unknown): {
  cloudMode: boolean;
  friendTyping: boolean;
  messages: ChatMessageRow[];
} {
  const data = asRecord(raw);
  const messages = asList(data.messages).map((m) => ({
    id: str(m.id),
    text: str(m.text),
    isSelf: m.isSelf === true,
    createdAt: str(m.createdAt),
    editedAt: str(m.editedAt),
    deletedAt: str(m.deletedAt),
    replyToId: m.replyToId ? str(m.replyToId) : null,
    syncStatus: str(m.syncStatus, "synced"),
    reactions:
      m.reactions && typeof m.reactions === "object"
        ? (m.reactions as Record<string, number>)
        : {},
    attachmentCount: Array.isArray(m.attachments) ? m.attachments.length : 0,
  }));
  return {
    cloudMode: data.cloudMode === true,
    friendTyping: data.friendTyping === true,
    messages,
  };
}

// ── Guild (lokal + online) ─────────────────────────────────────────────────

export interface GuildMemberRow {
  id: string;
  name: string;
  role: string;
  level: number;
}

export interface LocalGuild {
  id: string;
  name: string;
  level: number;
  exp: number;
  maxExp: number;
  members: GuildMemberRow[];
  hasGuild: boolean;
}

export function parseLocalGuild(raw: unknown): LocalGuild {
  const g = asRecord(asRecord(raw).guild);
  const members = asList(g.members).map((m) => ({
    id: str(m.id, str(m.userId)),
    name: str(m.displayName, str(m.username, "?")),
    role: str(m.role, "member"),
    level: num(m.level, 1),
  }));
  const id = str(g.id);
  return {
    id,
    name: str(g.name),
    level: num(g.level, 1),
    exp: num(g.exp),
    maxExp: num(g.maxExp, 100),
    members,
    hasGuild: id !== "",
  };
}

export interface OnlineGuildState {
  linked: boolean;
  guildId: string;
  guildName: string;
  myRole: string;
  canAdmin: boolean;
  members: GuildMemberRow[];
  requests: Array<{ id: string; userId: string; name: string }>;
  messages: ChatMessageRow[];
  battles: Array<Record<string, unknown>>;
  rewards: Array<Record<string, unknown>>;
  guilds: Array<{ id: string; name: string; memberCount: number }>;
}

export function parseOnlineGuild(raw: unknown): OnlineGuildState {
  const data = asRecord(raw);
  const summary = asRecord(data.summary);
  const guildId = str(summary.guild_id, str(summary.id));
  const myRole = str(summary.role, str(summary.my_role));
  const members = asList(data.members).map((m) => ({
    id: str(m.user_id, str(m.id)),
    name: str(m.display_name, str(m.username, "?")),
    role: str(m.role, "member"),
    level: num(m.level, 1),
  }));
  const messages = asList(data.messages).map((m) => ({
    id: str(m.id),
    text: str(m.body, str(m.message)),
    isSelf: m.is_self === true || m.isSelf === true,
    createdAt: str(m.created_at),
    editedAt: str(m.edited_at),
    deletedAt: str(m.deleted_at),
    replyToId: m.reply_to_id ? str(m.reply_to_id) : null,
    syncStatus: "synced",
    reactions:
      m.reactions && typeof m.reactions === "object"
        ? (m.reactions as Record<string, number>)
        : {},
    attachmentCount: 0,
  }));
  return {
    linked: data.linked === true,
    guildId,
    guildName: str(summary.name),
    myRole,
    canAdmin: myRole === "leader" || myRole === "officer",
    members,
    requests: asList(data.requests).map((r) => ({
      id: str(r.id),
      userId: str(r.user_id),
      name: str(r.display_name, str(r.username, "?")),
    })),
    messages,
    battles: asList(data.battles),
    rewards: asList(data.rewards),
    guilds: asList(data.guilds).map((g) => ({
      id: str(g.id),
      name: str(g.name, str(g.id)),
      memberCount: num(g.member_count),
    })),
  };
}

// ── PvP ────────────────────────────────────────────────────────────────────

export interface PvpRow {
  id: string;
  opponentName: string;
  opponentId: string;
  status: string;
  isChallenger: boolean;
  playerScore: number;
  opponentScore: number;
  daysLeft: number;
  rewardXp: number;
  rewardGold: number;
  canRespond: boolean;
  canClaim: boolean;
}

export function parsePvp(raw: unknown): PvpRow[] {
  return asList(asRecord(raw).pvpChallenges).map((c) => {
    const status = str(c.status, "pending");
    return {
      id: str(c.id),
      opponentName: str(c.opponentName, "?"),
      opponentId: str(c.opponentId),
      status,
      isChallenger: c.isChallenger === true,
      playerScore: num(c.playerScore),
      opponentScore: num(c.opponentScore),
      daysLeft: num(c.daysLeft),
      rewardXp: num(c.rewardXp, 100),
      rewardGold: num(c.rewardGold, 50),
      canRespond: status === "pending" && c.isChallenger !== true,
      canClaim: status === "completed",
    };
  });
}

// ── Leaderboard ────────────────────────────────────────────────────────────

export interface LeaderboardRow {
  rank: number;
  name: string;
  level: number;
  score: number;
  title: string;
}

export function parseLeaderboard(raw: unknown): {
  linked: boolean;
  rows: LeaderboardRow[];
} {
  const data = asRecord(raw);
  const src = Array.isArray(data.leaderboard) ? data.leaderboard : data.rows;
  return {
    linked: data.linked === true,
    rows: asList(src).map((r, i) => ({
      rank: num(r.rank, i + 1),
      name: str(r.displayName, str(r.username, "?")),
      level: num(r.level, 1),
      score: num(r.score, num(r.xp, num(r.total_xp))),
      title: str(r.title),
    })),
  };
}

// ── Love Space ─────────────────────────────────────────────────────────────

export interface LoveState {
  partnerName: string;
  myName: string;
  startDate: string;
  connectionScore: number;
  memories: Array<{ id: string; title: string; date: string; description: string; emoji: string; isFavorite: boolean }>;
  checkins: Array<{ id: string; date: string; myMood: number; partnerMood: number; connectionScore: number; note: string }>;
  events: Array<{ id: string; title: string; date: string; category: string; isSpecial: boolean }>;
  bucket: Array<{ id: string; title: string; isCompleted: boolean; category: string; targetDate: string }>;
  cycles: Array<{ id: string; startDate: string; endDate: string; lengthDays: number | null }>;
  photos: Array<{ id: string; caption: string; photoDate: string }>;
}

export function parseLove(raw: unknown): LoveState {
  const love = asRecord(asRecord(raw).loveSpace);
  return {
    partnerName: str(love.partnerName),
    myName: str(love.myName),
    startDate: str(love.startDate),
    connectionScore: num(love.connectionScore),
    memories: asList(love.memories).map((m) => ({
      id: str(m.id),
      title: str(m.title),
      date: str(m.date),
      description: str(m.description),
      emoji: str(m.emoji, "💖"),
      isFavorite: m.isFavorite === true,
    })),
    checkins: asList(love.checkins).map((c) => ({
      id: str(c.id),
      date: str(c.date),
      myMood: num(c.myMood, 3),
      partnerMood: num(c.partnerMood, 3),
      connectionScore: num(c.connectionScore, 3),
      note: str(c.note),
    })),
    events: asList(love.events).map((e) => ({
      id: str(e.id),
      title: str(e.title),
      date: str(e.date),
      category: str(e.category, "date"),
      isSpecial: e.isSpecial === true,
    })),
    bucket: asList(love.bucketList).map((b) => ({
      id: str(b.id),
      title: str(b.title),
      isCompleted: b.isCompleted === true,
      category: str(b.category, "dream"),
      targetDate: str(b.targetDate),
    })),
    cycles: asList(love.cycles).map((c) => ({
      id: str(c.id),
      startDate: str(c.startDate),
      endDate: str(c.endDate),
      lengthDays: typeof c.lengthDays === "number" ? c.lengthDays : null,
    })),
    photos: asList(love.photos).map((p) => ({
      id: str(p.id),
      caption: str(p.caption),
      photoDate: str(p.photoDate),
    })),
  };
}

// ── Notifications ──────────────────────────────────────────────────────────

export interface NotificationRow {
  id: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  source: "cloud" | "local";
}

export function parseNotifications(raw: unknown, source: "cloud" | "local"): NotificationRow[] {
  const data = asRecord(raw);
  return asList(data.notifications).map((n) => ({
    id: str(n.id),
    message: str(n.message, str(n.body, str(n.title))),
    type: str(n.type, str(n.notification_type, "info")),
    isRead: n.isRead === true || n.is_read === true,
    createdAt: str(n.createdAt, str(n.created_at)),
    source,
  }));
}
