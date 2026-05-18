import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.BACKEND_DB_PATH || path.join(__dirname, "data", "db.json");
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const USE_POSTGRES = Boolean(DATABASE_URL);

const DB_VERSION = 5;

const DEFAULT_DB = {
  version: DB_VERSION,
  users: [],
  appStates: {},
  servers: {},
  memberships: {},
  serverMessages: {},
  invites: [],
  friendRequests: [],
  integrations: {},
  twitchEventSubMessages: {},
  twitchSubscriberPerkGrants: {},
  twitchCreatorLiveStates: {},
};

let dbCache = null;
let writeQueue = Promise.resolve();
let pgPool = null;
let storageStatsCache = {
  filePath: DB_PATH,
  fileBytes: 0,
  lastModifiedMs: 0,
};

function now() {
  return Date.now();
}

function normalizeNick(name) {
  return String(name || "").trim().toLowerCase();
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function sanitizeString(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function isId(value, max = 96) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value) && value.length > 0 && value.length <= max;
}

function validateNick(name) {
  const value = sanitizeString(name, 64);
  if (value.length < 2 || value.length > 32) return false;
  return /^[\p{L}\p{N}_\-. ]+$/u.test(value);
}

function validatePassword(password) {
  if (typeof password !== "string") return false;
  if (password.length < 8 || password.length > 128) return false;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  return hasLetter && hasNumber;
}

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString("hex");
}

function verifyPassword(password, salt, hashHex) {
  const expected = Buffer.from(hashHex, "hex");
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function defaultAppState() {
  return {
    dms: [],
    dmMessages: {},
    settings: null,
    todos: [],
    language: null,
    lastView: null,
  };
}

function sanitizeAppState(payload) {
  const raw = payload && typeof payload === "object" ? payload : {};
  const todos = Array.isArray(raw.todos)
    ? raw.todos
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const id = typeof item.id === "string" ? item.id.slice(0, 80) : "";
        const text = typeof item.text === "string" ? item.text.trim().slice(0, 240) : "";
        const done = Boolean(item.done);
        const createdAt = Number(item.createdAt || now());
        if (!id || !text) return null;
        return {
          id,
          text,
          done,
          createdAt: Number.isFinite(createdAt) ? createdAt : now(),
        };
      })
      .filter(Boolean)
    : [];

  const language = raw.language === "ru" || raw.language === "en" ? raw.language : null;
  const lastView = raw.lastView === "landing" || raw.lastView === "app" ? raw.lastView : null;

  return {
    dms: Array.isArray(raw.dms) ? raw.dms : [],
    dmMessages: raw.dmMessages && typeof raw.dmMessages === "object"
      ? raw.dmMessages
      : (raw.messages && typeof raw.messages === "object" ? raw.messages : {}),
    settings: raw.settings && typeof raw.settings === "object" ? raw.settings : null,
    todos,
    language,
    lastView,
  };
}

function sanitizeChannel(channel) {
  if (!channel || typeof channel !== "object") return null;
  const id = sanitizeString(channel.id, 96);
  const name = sanitizeString(channel.name, 80);
  const type = channel.type === "voice" ? "voice" : "text";
  if (!id || !name || !isId(id)) return null;
  return {
    id,
    name,
    type,
    description: sanitizeString(channel.description || "", 200) || undefined,
    slowModeSec: Number.isFinite(Number(channel.slowModeSec)) ? Math.max(0, Math.floor(Number(channel.slowModeSec))) : 0,
    userLimit: Number.isFinite(Number(channel.userLimit)) ? Math.max(0, Math.floor(Number(channel.userLimit))) : 0,
    bitrateKbps: Number.isFinite(Number(channel.bitrateKbps)) ? Math.max(32, Math.floor(Number(channel.bitrateKbps))) : 1200,
  };
}

function sanitizeServer(server, fallbackOwnerId = "") {
  if (!server || typeof server !== "object") return null;
  const id = sanitizeString(server.id, 96);
  const name = sanitizeString(server.name, 80);
  if (!id || !name || !isId(id)) return null;

  const rawChannels = Array.isArray(server.channels) ? server.channels : [];
  const channels = rawChannels.map((channel) => sanitizeChannel(channel)).filter(Boolean);
  if (channels.length === 0) return null;

  return {
    id,
    name,
    description: sanitizeString(server.description || "", 220) || "",
    iconUrl: sanitizeString(server.iconUrl || "", 300) || "",
    isPrivate: Boolean(server.isPrivate),
    ownerId: sanitizeString(server.ownerId || fallbackOwnerId, 96),
    channels,
    createdAt: Number.isFinite(Number(server.createdAt)) ? Number(server.createdAt) : now(),
    updatedAt: Number.isFinite(Number(server.updatedAt)) ? Number(server.updatedAt) : now(),
  };
}

function sanitizeMessage(msg) {
  if (!msg || typeof msg !== "object") return null;
  const id = sanitizeString(msg.id, 120);
  const senderId = sanitizeString(msg.senderId, 96);
  const senderName = sanitizeString(msg.senderName, 80) || "User";
  const content = String(msg.content || "").slice(0, 4000);
  const timestamp = Number(msg.timestamp || now());
  if (!id || !senderId || !content) return null;
  return {
    id,
    senderId,
    senderName,
    content,
    timestamp: Number.isFinite(timestamp) ? timestamp : now(),
    reactions: Array.isArray(msg.reactions) ? msg.reactions : undefined,
    isPinned: Boolean(msg.isPinned),
  };
}

function sanitizeInvite(invite) {
  if (!invite || typeof invite !== "object") return null;
  const code = sanitizeString(invite.code, 16).toUpperCase();
  const serverId = sanitizeString(invite.serverId, 96);
  const createdBy = sanitizeString(invite.createdBy, 96);
  if (!code || !serverId || !createdBy) return null;
  return {
    code,
    serverId,
    serverName: sanitizeString(invite.serverName || "", 80) || "Server",
    createdBy,
    createdAt: Number.isFinite(Number(invite.createdAt)) ? Number(invite.createdAt) : now(),
    expiresAt: invite.expiresAt ? Number(invite.expiresAt) : null,
    maxUses: invite.maxUses ? Number(invite.maxUses) : null,
    uses: Number.isFinite(Number(invite.uses)) ? Number(invite.uses) : 0,
    revoked: Boolean(invite.revoked),
  };
}

function sanitizeFriendRequest(request) {
  if (!request || typeof request !== "object") return null;
  const id = sanitizeString(request.id, 120);
  const fromUserId = sanitizeString(request.fromUserId, 96);
  const toUserId = sanitizeString(request.toUserId, 96);
  const status = request.status === "accepted" || request.status === "rejected" ? request.status : "pending";
  if (!id || !fromUserId || !toUserId || fromUserId === toUserId) return null;
  return {
    id,
    fromUserId,
    toUserId,
    status,
    createdAt: Number.isFinite(Number(request.createdAt)) ? Number(request.createdAt) : now(),
    updatedAt: Number.isFinite(Number(request.updatedAt)) ? Number(request.updatedAt) : now(),
  };
}

function sanitizeTwitchSettings(settings) {
  const raw = settings && typeof settings === "object" ? settings : {};
  return {
    streamModeEnabled: Boolean(raw.streamModeEnabled),
    autoDetectLive: raw.autoDetectLive !== false,
    autoAnnounceLive: Boolean(raw.autoAnnounceLive),
    hideSensitiveOverlay: raw.hideSensitiveOverlay !== false,
    showTwitchPresence: raw.showTwitchPresence !== false,
    mirrorScreenShare: Boolean(raw.mirrorScreenShare),
  };
}

function sanitizeTwitchEventSubSubscription(subscription) {
  if (!subscription || typeof subscription !== "object") return null;
  const type = sanitizeString(subscription.type || "", 120);
  if (!type) return null;
  const createdAt = Number(subscription.createdAt || subscription.created_at || now());
  const updatedAt = Number(subscription.updatedAt || now());
  return {
    id: sanitizeString(subscription.id || "", 160),
    type,
    version: sanitizeString(subscription.version || "1", 20) || "1",
    status: sanitizeString(subscription.status || "unknown", 120) || "unknown",
    condition: subscription.condition && typeof subscription.condition === "object"
      ? {
        broadcaster_user_id: sanitizeString(subscription.condition.broadcaster_user_id || "", 96),
      }
      : {},
    createdAt: Number.isFinite(createdAt) ? createdAt : now(),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : now(),
    error: sanitizeString(subscription.error || "", 240),
  };
}

function sanitizeTwitchEventSubSubscriptions(value) {
  return Array.isArray(value)
    ? value.map((item) => sanitizeTwitchEventSubSubscription(item)).filter(Boolean).slice(0, 20)
    : [];
}

function sanitizeTwitchCreatorProgram(program) {
  const raw = program && typeof program === "object" ? program : {};
  const minimumTier = String(raw.minimumTier || "1000");
  const rewardKind = String(raw.rewardKind || "badge");
  const updatedAt = Number(raw.updatedAt || now());
  const eventSubLastSyncedAt = Number(raw.eventSubLastSyncedAt || 0);

  return {
    enabled: Boolean(raw.enabled),
    subscriberPerksEnabled: Boolean(raw.subscriberPerksEnabled),
    minimumTier: ["1000", "2000", "3000"].includes(minimumTier) ? minimumTier : "1000",
    allowGiftedSubscriptions: raw.allowGiftedSubscriptions !== false,
    autoVerifySubscribers: raw.autoVerifySubscribers !== false,
    eventSubEnabled: Boolean(raw.eventSubEnabled),
    rewardKind: ["badge", "role", "early_access", "cosmetic", "custom"].includes(rewardKind) ? rewardKind : "badge",
    rewardName: sanitizeString(raw.rewardName || "Astral Creator Badge", 80),
    rewardDescription: sanitizeString(
      raw.rewardDescription || "A non-transferable Astral perk for Twitch channel subscribers.",
      240,
    ),
    communityName: sanitizeString(raw.communityName || "", 80),
    announcementChannelId: sanitizeString(raw.announcementChannelId || "", 96),
    eventSubSubscriptions: sanitizeTwitchEventSubSubscriptions(raw.eventSubSubscriptions),
    eventSubLastSyncedAt: Number.isFinite(eventSubLastSyncedAt) ? eventSubLastSyncedAt : 0,
    eventSubLastError: sanitizeString(raw.eventSubLastError || "", 240),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : now(),
  };
}

function sanitizeTwitchIntegration(integration) {
  if (!integration || typeof integration !== "object") return null;
  const providerUserId = sanitizeString(integration.providerUserId, 96);
  const login = sanitizeString(integration.login, 80).toLowerCase();
  const displayName = sanitizeString(integration.displayName || login, 80);
  if (!providerUserId || !login) return null;

  const expiresAt = Number(integration.expiresAt || 0);
  const connectedAt = Number(integration.connectedAt || now());
  const updatedAt = Number(integration.updatedAt || connectedAt);

  return {
    providerUserId,
    login,
    displayName: displayName || login,
    profileImageUrl: sanitizeString(integration.profileImageUrl || "", 500),
    accessToken: sanitizeString(integration.accessToken || "", 2048),
    refreshToken: sanitizeString(integration.refreshToken || "", 2048),
    scopes: Array.isArray(integration.scopes)
      ? integration.scopes.map((scope) => sanitizeString(scope, 120)).filter(Boolean).slice(0, 30)
      : [],
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
    connectedAt: Number.isFinite(connectedAt) ? connectedAt : now(),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : now(),
    settings: sanitizeTwitchSettings(integration.settings),
    creatorProgram: sanitizeTwitchCreatorProgram(integration.creatorProgram),
  };
}

function sanitizeIntegrationsMap(value, validUserIds = null) {
  const raw = value && typeof value === "object" ? value : {};
  const next = {};
  for (const [userId, userIntegrations] of Object.entries(raw)) {
    if (!isId(userId, 96)) continue;
    if (validUserIds && !validUserIds.has(userId)) continue;
    if (!userIntegrations || typeof userIntegrations !== "object") continue;

    const twitch = sanitizeTwitchIntegration(userIntegrations.twitch);
    if (twitch) next[userId] = { twitch };
  }
  return next;
}

function sanitizeTwitchEventSubMessage(message) {
  if (!message || typeof message !== "object") return null;
  const id = sanitizeString(message.id || message.messageId || "", 160);
  if (!id) return null;
  const receivedAt = Number(message.receivedAt || now());
  return {
    id,
    messageType: sanitizeString(message.messageType || "", 80),
    subscriptionType: sanitizeString(message.subscriptionType || "", 120),
    subscriptionId: sanitizeString(message.subscriptionId || "", 160),
    broadcasterUserId: sanitizeString(message.broadcasterUserId || "", 96),
    status: sanitizeString(message.status || "", 120),
    duplicate: Boolean(message.duplicate),
    receivedAt: Number.isFinite(receivedAt) ? receivedAt : now(),
  };
}

function sanitizeTwitchEventSubMessagesMap(value) {
  const raw = value && typeof value === "object" ? value : {};
  const rows = Object.values(raw)
    .map((item) => sanitizeTwitchEventSubMessage(item))
    .filter(Boolean)
    .sort((a, b) => b.receivedAt - a.receivedAt)
    .slice(0, 2500);
  return Object.fromEntries(rows.map((item) => [item.id, item]));
}

function twitchGrantKey(creatorUserId, viewerTwitchUserId) {
  return `${sanitizeString(creatorUserId, 96)}:${sanitizeString(viewerTwitchUserId, 96)}`;
}

function sanitizeTwitchSubscriberPerkGrant(grant, validUserIds = null) {
  if (!grant || typeof grant !== "object") return null;
  const creatorUserId = sanitizeString(grant.creatorUserId || "", 96);
  const creatorTwitchUserId = sanitizeString(grant.creatorTwitchUserId || "", 96);
  const viewerTwitchUserId = sanitizeString(grant.viewerTwitchUserId || "", 96);
  if (!creatorUserId || !creatorTwitchUserId || !viewerTwitchUserId) return null;
  if (validUserIds && !validUserIds.has(creatorUserId)) return null;

  const viewerUserId = sanitizeString(grant.viewerUserId || "", 96);
  const createdAt = Number(grant.createdAt || now());
  const grantedAt = Number(grant.grantedAt || 0);
  const revokedAt = Number(grant.revokedAt || 0);
  const updatedAt = Number(grant.updatedAt || now());
  const lastEventAt = Number(grant.lastEventAt || updatedAt);
  const tier = String(grant.tier || "1000");
  const rewardKind = String(grant.rewardKind || "badge");

  return {
    id: twitchGrantKey(creatorUserId, viewerTwitchUserId),
    creatorUserId,
    creatorTwitchUserId,
    creatorLogin: sanitizeString(grant.creatorLogin || "", 80).toLowerCase(),
    creatorDisplayName: sanitizeString(grant.creatorDisplayName || grant.creatorLogin || "", 80),
    viewerUserId: viewerUserId && (!validUserIds || validUserIds.has(viewerUserId)) ? viewerUserId : "",
    viewerTwitchUserId,
    viewerLogin: sanitizeString(grant.viewerLogin || "", 80).toLowerCase(),
    viewerDisplayName: sanitizeString(grant.viewerDisplayName || grant.viewerLogin || "", 80),
    active: grant.active !== false,
    tier: ["1000", "2000", "3000"].includes(tier) ? tier : "1000",
    isGift: Boolean(grant.isGift),
    rewardKind: ["badge", "role", "early_access", "cosmetic", "custom"].includes(rewardKind) ? rewardKind : "badge",
    rewardName: sanitizeString(grant.rewardName || "Astral Creator Badge", 80),
    rewardDescription: sanitizeString(grant.rewardDescription || "", 240),
    source: sanitizeString(grant.source || "eventsub", 80),
    messageId: sanitizeString(grant.messageId || "", 160),
    createdAt: Number.isFinite(createdAt) ? createdAt : now(),
    grantedAt: Number.isFinite(grantedAt) ? grantedAt : 0,
    revokedAt: Number.isFinite(revokedAt) ? revokedAt : 0,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : now(),
    lastEventAt: Number.isFinite(lastEventAt) ? lastEventAt : now(),
  };
}

function sanitizeTwitchSubscriberPerkGrantsMap(value, validUserIds = null) {
  const raw = value && typeof value === "object" ? value : {};
  const next = {};
  for (const item of Object.values(raw)) {
    const grant = sanitizeTwitchSubscriberPerkGrant(item, validUserIds);
    if (grant) next[grant.id] = grant;
  }
  return next;
}

function sanitizeTwitchCreatorLiveState(state, validUserIds = null) {
  if (!state || typeof state !== "object") return null;
  const creatorUserId = sanitizeString(state.creatorUserId || "", 96);
  const twitchUserId = sanitizeString(state.twitchUserId || "", 96);
  if (!creatorUserId || !twitchUserId) return null;
  if (validUserIds && !validUserIds.has(creatorUserId)) return null;

  const startedAt = Number(state.startedAt || 0);
  const endedAt = Number(state.endedAt || 0);
  const updatedAt = Number(state.updatedAt || now());

  return {
    creatorUserId,
    twitchUserId,
    login: sanitizeString(state.login || "", 80).toLowerCase(),
    displayName: sanitizeString(state.displayName || state.login || "", 80),
    isLive: Boolean(state.isLive),
    streamId: sanitizeString(state.streamId || "", 160),
    streamType: sanitizeString(state.streamType || "", 60),
    startedAt: Number.isFinite(startedAt) ? startedAt : 0,
    endedAt: Number.isFinite(endedAt) ? endedAt : 0,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : now(),
  };
}

function sanitizeTwitchCreatorLiveStatesMap(value, validUserIds = null) {
  const raw = value && typeof value === "object" ? value : {};
  const next = {};
  for (const item of Object.values(raw)) {
    const state = sanitizeTwitchCreatorLiveState(item, validUserIds);
    if (state) next[state.creatorUserId] = state;
  }
  return next;
}

function inviteStatus(invite, nowTs = now()) {
  if (invite.revoked) return "revoked";
  if (invite.expiresAt && invite.expiresAt <= nowTs) return "expired";
  if (invite.maxUses && invite.uses >= invite.maxUses) return "used_up";
  return "active";
}

function isServerMember(db, userId, serverId) {
  const members = db.memberships?.[serverId];
  if (!members || typeof members !== "object") return false;
  return typeof members[userId] === "string";
}

function getMemberRole(db, userId, serverId) {
  const members = db.memberships?.[serverId];
  if (!members || typeof members !== "object") return null;
  const role = members[userId];
  if (role === "owner" || role === "admin" || role === "member") return role;
  return null;
}

function canManageServer(db, userId, serverId) {
  const role = getMemberRole(db, userId, serverId);
  return role === "owner" || role === "admin";
}

function canViewServer(db, userId, server) {
  return isServerMember(db, userId, server.id);
}

function getServerMembersCount(db, serverId) {
  const members = db.memberships?.[serverId];
  if (!members || typeof members !== "object") return 0;
  return Object.keys(members).length;
}

function getUserById(db, userId) {
  return db.users.find((user) => user.id === userId) || null;
}

function areUsersFriends(db, leftUserId, rightUserId) {
  return db.friendRequests.some((request) => (
    request.status === "accepted"
    && (
      (request.fromUserId === leftUserId && request.toUserId === rightUserId)
      || (request.fromUserId === rightUserId && request.toUserId === leftUserId)
    )
  ));
}

function ensureMembership(db, serverId, userId, role = "member") {
  if (!db.memberships[serverId] || typeof db.memberships[serverId] !== "object") {
    db.memberships[serverId] = {};
  }
  db.memberships[serverId][userId] = role;
}

function ensureUserState(userId) {
  const db = ensureDbLoaded();
  if (!db.appStates[userId]) db.appStates[userId] = defaultAppState();
  return db.appStates[userId];
}

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    createdAt: user.createdAt,
  };
}

function toPublicInvite(invite) {
  return {
    code: invite.code,
    serverId: invite.serverId,
    serverName: invite.serverName,
    createdBy: invite.createdBy,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
    maxUses: invite.maxUses,
    uses: invite.uses,
    revoked: invite.revoked,
    status: inviteStatus(invite),
  };
}

function buildVisibleSharedState(db, userId) {
  const visibleServers = [];
  const channelIdSet = new Set();

  for (const server of Object.values(db.servers)) {
    if (!canViewServer(db, userId, server)) continue;
    visibleServers.push({
      id: server.id,
      name: server.name,
      description: server.description || undefined,
      iconUrl: server.iconUrl || undefined,
      isPrivate: Boolean(server.isPrivate),
      channels: server.channels.map((channel) => ({ ...channel })),
    });
    for (const channel of server.channels) channelIdSet.add(channel.id);
  }

  const messages = {};
  for (const [channelId, list] of Object.entries(db.serverMessages || {})) {
    if (!channelIdSet.has(channelId)) continue;
    messages[channelId] = Array.isArray(list) ? list : [];
  }

  return {
    servers: visibleServers.sort((a, b) => a.name.localeCompare(b.name)),
    messages,
  };
}

function migrateLegacyDb(parsed) {
  const next = {
    version: DB_VERSION,
    users: Array.isArray(parsed.users) ? parsed.users : [],
    appStates: parsed && typeof parsed.appStates === "object" && parsed.appStates !== null ? parsed.appStates : {},
    servers: {},
    memberships: {},
    serverMessages: {},
    invites: [],
    friendRequests: [],
    integrations: {},
    twitchEventSubMessages: {},
    twitchSubscriberPerkGrants: {},
    twitchCreatorLiveStates: {},
  };

  if (Array.isArray(parsed.invites)) {
    for (const item of parsed.invites) {
      const invite = sanitizeInvite(item);
      if (invite) next.invites.push(invite);
    }
  }
  if (Array.isArray(parsed.friendRequests)) {
    for (const item of parsed.friendRequests) {
      const request = sanitizeFriendRequest(item);
      if (request) next.friendRequests.push(request);
    }
  }
  next.integrations = sanitizeIntegrationsMap(parsed.integrations);
  next.twitchEventSubMessages = sanitizeTwitchEventSubMessagesMap(parsed.twitchEventSubMessages);
  next.twitchSubscriberPerkGrants = sanitizeTwitchSubscriberPerkGrantsMap(parsed.twitchSubscriberPerkGrants);
  next.twitchCreatorLiveStates = sanitizeTwitchCreatorLiveStatesMap(parsed.twitchCreatorLiveStates);

  const rawShared = parsed && typeof parsed.sharedState === "object" && parsed.sharedState !== null ? parsed.sharedState : {};
  const rawServers = Array.isArray(rawShared.servers) ? rawShared.servers : [];
  const rawMessages = rawShared.messages && typeof rawShared.messages === "object" ? rawShared.messages : {};

  for (const rawServer of rawServers) {
    const safeServer = sanitizeServer(rawServer, "");
    if (!safeServer) continue;
    safeServer.ownerId = safeServer.ownerId || "";
    safeServer.isPrivate = Boolean(safeServer.isPrivate);
    next.servers[safeServer.id] = safeServer;
  }

  for (const [channelId, rawList] of Object.entries(rawMessages)) {
    if (!isId(channelId)) continue;
    if (!Array.isArray(rawList)) continue;
    const list = rawList.map((msg) => sanitizeMessage(msg)).filter(Boolean);
    if (list.length > 0) next.serverMessages[channelId] = list.slice(-600);
  }

  if (parsed && typeof parsed.servers === "object" && parsed.servers !== null) {
    for (const rawServer of Object.values(parsed.servers)) {
      const safeServer = sanitizeServer(rawServer, "");
      if (!safeServer) continue;
      next.servers[safeServer.id] = safeServer;
    }
  }

  if (parsed && typeof parsed.memberships === "object" && parsed.memberships !== null) {
    next.memberships = parsed.memberships;
  }

  if (parsed && typeof parsed.serverMessages === "object" && parsed.serverMessages !== null) {
    for (const [channelId, rawList] of Object.entries(parsed.serverMessages)) {
      if (!isId(channelId) || !Array.isArray(rawList)) continue;
      const list = rawList.map((msg) => sanitizeMessage(msg)).filter(Boolean);
      next.serverMessages[channelId] = list.slice(-600);
    }
  }

  return next;
}

function normalizeDbShape(parsed) {
  if (Number(parsed.version || 0) >= DB_VERSION) {
    return {
      version: DB_VERSION,
      users: Array.isArray(parsed.users) ? parsed.users : [],
      appStates: parsed && typeof parsed.appStates === "object" && parsed.appStates !== null ? parsed.appStates : {},
      servers: parsed && typeof parsed.servers === "object" && parsed.servers !== null ? parsed.servers : {},
      memberships: parsed && typeof parsed.memberships === "object" && parsed.memberships !== null ? parsed.memberships : {},
      serverMessages: parsed && typeof parsed.serverMessages === "object" && parsed.serverMessages !== null ? parsed.serverMessages : {},
      invites: Array.isArray(parsed.invites) ? parsed.invites.map((item) => sanitizeInvite(item)).filter(Boolean) : [],
      friendRequests: Array.isArray(parsed.friendRequests) ? parsed.friendRequests.map((item) => sanitizeFriendRequest(item)).filter(Boolean) : [],
      integrations: sanitizeIntegrationsMap(parsed.integrations),
      twitchEventSubMessages: sanitizeTwitchEventSubMessagesMap(parsed.twitchEventSubMessages),
      twitchSubscriberPerkGrants: sanitizeTwitchSubscriberPerkGrantsMap(parsed.twitchSubscriberPerkGrants),
      twitchCreatorLiveStates: sanitizeTwitchCreatorLiveStatesMap(parsed.twitchCreatorLiveStates),
    };
  }
  return migrateLegacyDb(parsed);
}

function calculateStorageStats(snapshot, lastModifiedMs = now()) {
  return {
    filePath: USE_POSTGRES ? "postgres://vercord_state" : DB_PATH,
    fileBytes: Buffer.byteLength(snapshot, "utf8"),
    lastModifiedMs: Number(lastModifiedMs || now()),
  };
}

function finalizeDbCache() {
  if (!dbCache) dbCache = { ...DEFAULT_DB };
  if (!dbCache || typeof dbCache !== "object") dbCache = { ...DEFAULT_DB };
  if (!Array.isArray(dbCache.users)) dbCache.users = [];
  if (!dbCache.appStates || typeof dbCache.appStates !== "object") dbCache.appStates = {};
  if (!dbCache.servers || typeof dbCache.servers !== "object") dbCache.servers = {};
  if (!dbCache.memberships || typeof dbCache.memberships !== "object") dbCache.memberships = {};
  if (!dbCache.serverMessages || typeof dbCache.serverMessages !== "object") dbCache.serverMessages = {};
  if (!Array.isArray(dbCache.invites)) dbCache.invites = [];
  if (!Array.isArray(dbCache.friendRequests)) dbCache.friendRequests = [];
  if (!dbCache.integrations || typeof dbCache.integrations !== "object") dbCache.integrations = {};
  if (!dbCache.twitchEventSubMessages || typeof dbCache.twitchEventSubMessages !== "object") dbCache.twitchEventSubMessages = {};
  if (!dbCache.twitchSubscriberPerkGrants || typeof dbCache.twitchSubscriberPerkGrants !== "object") dbCache.twitchSubscriberPerkGrants = {};
  if (!dbCache.twitchCreatorLiveStates || typeof dbCache.twitchCreatorLiveStates !== "object") dbCache.twitchCreatorLiveStates = {};

  const validUserIds = new Set(
    dbCache.users
      .filter((user) => user && typeof user === "object" && isId(user.id, 96))
      .map((user) => user.id),
  );

  const nextAppStates = {};
  for (const userId of validUserIds) {
    const current = dbCache.appStates[userId];
    nextAppStates[userId] = sanitizeAppState(current || defaultAppState());
  }
  dbCache.appStates = nextAppStates;

  for (const [serverId, membersMap] of Object.entries(dbCache.memberships)) {
    if (!dbCache.servers[serverId]) {
      delete dbCache.memberships[serverId];
      continue;
    }
    if (!membersMap || typeof membersMap !== "object") {
      dbCache.memberships[serverId] = {};
      continue;
    }
    for (const [memberId, role] of Object.entries(membersMap)) {
      if (!validUserIds.has(memberId)) {
        delete membersMap[memberId];
        continue;
      }
      if (role !== "owner" && role !== "admin" && role !== "member") {
        membersMap[memberId] = "member";
      }
    }
  }

  const channelToServer = new Map();
  for (const [serverId, rawServer] of Object.entries(dbCache.servers || {})) {
    const safeServer = sanitizeServer(rawServer, "");
    if (!safeServer) {
      delete dbCache.servers[serverId];
      delete dbCache.memberships[serverId];
      continue;
    }

    const membership = dbCache.memberships[serverId] && typeof dbCache.memberships[serverId] === "object"
      ? dbCache.memberships[serverId]
      : {};
    dbCache.memberships[serverId] = membership;

    const ownerId = isId(safeServer.ownerId, 96) && validUserIds.has(safeServer.ownerId)
      ? safeServer.ownerId
      : "";
    if (ownerId) {
      safeServer.ownerId = ownerId;
      membership[ownerId] = "owner";
    } else {
      const fallbackOwnerId = Object.keys(membership).find((memberId) => validUserIds.has(memberId)) || "";
      if (!fallbackOwnerId) {
        delete dbCache.servers[serverId];
        delete dbCache.memberships[serverId];
        continue;
      }
      safeServer.ownerId = fallbackOwnerId;
      membership[fallbackOwnerId] = "owner";
    }

    dbCache.servers[serverId] = safeServer;
    for (const channel of safeServer.channels) {
      channelToServer.set(channel.id, safeServer.id);
    }
  }

  for (const [channelId, rawList] of Object.entries(dbCache.serverMessages || {})) {
    if (!channelToServer.has(channelId) || !Array.isArray(rawList)) {
      delete dbCache.serverMessages[channelId];
      continue;
    }
    const sanitized = rawList.map((msg) => sanitizeMessage(msg)).filter(Boolean);
    if (sanitized.length === 0) {
      delete dbCache.serverMessages[channelId];
      continue;
    }
    dbCache.serverMessages[channelId] = sanitized
      .sort((left, right) => left.timestamp - right.timestamp)
      .slice(-600);
  }

  dbCache.invites = dbCache.invites
    .map((invite) => sanitizeInvite(invite))
    .filter(Boolean)
    .filter((invite) => dbCache.servers[invite.serverId] && validUserIds.has(invite.createdBy));

  dbCache.friendRequests = dbCache.friendRequests
    .map((request) => sanitizeFriendRequest(request))
    .filter(Boolean)
    .filter((request) => (
      validUserIds.has(request.fromUserId)
      && validUserIds.has(request.toUserId)
      && request.fromUserId !== request.toUserId
    ));

  dbCache.integrations = sanitizeIntegrationsMap(dbCache.integrations, validUserIds);
  dbCache.twitchEventSubMessages = sanitizeTwitchEventSubMessagesMap(dbCache.twitchEventSubMessages);
  dbCache.twitchSubscriberPerkGrants = sanitizeTwitchSubscriberPerkGrantsMap(dbCache.twitchSubscriberPerkGrants, validUserIds);
  dbCache.twitchCreatorLiveStates = sanitizeTwitchCreatorLiveStatesMap(dbCache.twitchCreatorLiveStates, validUserIds);
}

function loadDbFromFileStorage() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), "utf8");
  }

  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw || "{}");
    dbCache = normalizeDbShape(parsed);
  } catch {
    dbCache = { ...DEFAULT_DB };
    fs.writeFileSync(DB_PATH, JSON.stringify(dbCache, null, 2), "utf8");
  }

  finalizeDbCache();
  const snapshot = JSON.stringify(dbCache, null, 2);
  try {
    const stat = fs.statSync(DB_PATH);
    storageStatsCache = {
      filePath: DB_PATH,
      fileBytes: Number(stat.size || 0),
      lastModifiedMs: Number(stat.mtimeMs || now()),
    };
  } catch {
    storageStatsCache = calculateStorageStats(snapshot);
  }
}

function loadSeedDataForPostgres() {
  if (!fs.existsSync(DB_PATH)) {
    return { ...DEFAULT_DB };
  }

  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return normalizeDbShape(parsed);
  } catch {
    return { ...DEFAULT_DB };
  }
}

async function initPostgresStorage() {
  if (!USE_POSTGRES) return;
  const { Pool } = await import("pg");
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS vercord_state (
      id SMALLINT PRIMARY KEY DEFAULT 1,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const result = await pgPool.query("SELECT payload, EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_ms FROM vercord_state WHERE id = 1 LIMIT 1");
  if (result.rows.length === 0) {
    dbCache = loadSeedDataForPostgres();
    finalizeDbCache();
    const snapshot = JSON.stringify(dbCache, null, 2);
    await pgPool.query("INSERT INTO vercord_state (id, payload, updated_at) VALUES (1, $1::jsonb, NOW())", [snapshot]);
    storageStatsCache = calculateStorageStats(snapshot);
    return;
  }

  const row = result.rows[0] || {};
  const payload = row.payload && typeof row.payload === "object" ? row.payload : DEFAULT_DB;
  dbCache = normalizeDbShape(payload);
  finalizeDbCache();
  const snapshot = JSON.stringify(dbCache, null, 2);
  storageStatsCache = calculateStorageStats(snapshot, Number(row.updated_ms || now()));
}

async function initializeDb() {
  if (USE_POSTGRES) {
    await initPostgresStorage();
    return;
  }
  loadDbFromFileStorage();
}

function ensureDbLoaded() {
  if (!dbCache) {
    throw new Error("db_not_initialized");
  }
  return dbCache;
}

function saveDb() {
  ensureDbLoaded();
  const snapshot = JSON.stringify(dbCache, null, 2);
  writeQueue = writeQueue.then(async () => {
    if (USE_POSTGRES) {
      if (!pgPool) throw new Error("postgres_not_initialized");
      await pgPool.query(
        `
          INSERT INTO vercord_state (id, payload, updated_at)
          VALUES (1, $1::jsonb, NOW())
          ON CONFLICT (id) DO UPDATE SET
            payload = EXCLUDED.payload,
            updated_at = NOW()
        `,
        [snapshot],
      );
      storageStatsCache = calculateStorageStats(snapshot);
      return;
    }
    await fs.promises.writeFile(DB_PATH, snapshot, "utf8");
    storageStatsCache = calculateStorageStats(snapshot);
  });
  return writeQueue;
}

await initializeDb();
await saveDb();

function findUserByNick(name) {
  const db = ensureDbLoaded();
  const key = normalizeNick(name);
  return db.users.find((user) => user.nameKey === key) || null;
}

export function findPublicUserByNick(name) {
  const user = findUserByNick(name);
  return user ? toPublicUser(user) : null;
}

export function findPublicUserById(userId) {
  const db = ensureDbLoaded();
  const user = db.users.find((item) => item.id === userId);
  return user ? toPublicUser(user) : null;
}

export function searchPublicUsers(query, options = {}) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];

  const limitRaw = Number(options.limit || 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 10;
  const excludeUserId = typeof options.excludeUserId === "string" ? options.excludeUserId : "";

  const db = ensureDbLoaded();
  return db.users
    .filter((user) => user?.id && user.id !== excludeUserId)
    .filter((user) => {
      const name = String(user.name || "").toLowerCase();
      const nameKey = String(user.nameKey || "").toLowerCase();
      return name.includes(q) || nameKey.includes(q);
    })
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .slice(0, limit)
    .map(toPublicUser);
}

function toPublicFriendRequest(db, request, currentUserId) {
  const isIncoming = request.toUserId === currentUserId;
  const counterpartId = isIncoming ? request.fromUserId : request.toUserId;
  const counterpart = getUserById(db, counterpartId);
  return {
    id: request.id,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    direction: isIncoming ? "incoming" : "outgoing",
    user: counterpart ? toPublicUser(counterpart) : { id: counterpartId, name: "Unknown", createdAt: 0 },
  };
}

export async function sendFriendRequest(fromUserId, toUserId) {
  const db = ensureDbLoaded();
  if (!fromUserId || !toUserId || fromUserId === toUserId) throw new Error("invalid_friend_request");
  if (!getUserById(db, fromUserId) || !getUserById(db, toUserId)) throw new Error("user_not_found");
  if (areUsersFriends(db, fromUserId, toUserId)) throw new Error("already_friends");

  const existing = db.friendRequests.find((request) => (
    (request.fromUserId === fromUserId && request.toUserId === toUserId)
    || (request.fromUserId === toUserId && request.toUserId === fromUserId)
  ));

  if (existing?.status === "pending") {
    return toPublicFriendRequest(db, existing, fromUserId);
  }

  const request = {
    id: makeId("fr"),
    fromUserId,
    toUserId,
    status: "pending",
    createdAt: now(),
    updatedAt: now(),
  };
  db.friendRequests.push(request);
  await saveDb();
  return toPublicFriendRequest(db, request, fromUserId);
}

export function listFriendRequestsForUser(userId) {
  const db = ensureDbLoaded();
  const incoming = [];
  const outgoing = [];
  for (const request of db.friendRequests) {
    if (request.status !== "pending") continue;
    if (request.toUserId === userId) incoming.push(toPublicFriendRequest(db, request, userId));
    if (request.fromUserId === userId) outgoing.push(toPublicFriendRequest(db, request, userId));
  }
  return { incoming, outgoing };
}

export async function respondFriendRequest(userId, requestId, action) {
  const db = ensureDbLoaded();
  const request = db.friendRequests.find((item) => item.id === requestId);
  if (!request) throw new Error("friend_request_not_found");
  if (request.toUserId !== userId) throw new Error("forbidden");
  if (request.status !== "pending") throw new Error("friend_request_closed");
  if (action !== "accept" && action !== "reject") throw new Error("invalid_friend_request_action");

  request.status = action === "accept" ? "accepted" : "rejected";
  request.updatedAt = now();
  await saveDb();
  return toPublicFriendRequest(db, request, userId);
}

export async function createUser(name, password) {
  if (!validateNick(name)) throw new Error("invalid_nick");
  if (!validatePassword(password)) throw new Error("invalid_password");
  if (findUserByNick(name)) throw new Error("user_exists");

  const db = ensureDbLoaded();
  const salt = randomBytes(16).toString("hex");
  const user = {
    id: makeId("u"),
    name: sanitizeString(name, 32),
    nameKey: normalizeNick(name),
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
    createdAt: now(),
    lastLoginAt: null,
  };
  db.users.push(user);
  db.appStates[user.id] = defaultAppState();
  await saveDb();
  return toPublicUser(user);
}

export async function loginUser(name, password) {
  if (!validateNick(name)) throw new Error("invalid_nick");
  if (!validatePassword(password)) throw new Error("invalid_password");

  const user = findUserByNick(name);
  if (!user) throw new Error("user_not_found");
  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) throw new Error("invalid_credentials");

  user.lastLoginAt = now();
  ensureUserState(user.id);
  await saveDb();
  return toPublicUser(user);
}

export async function changeUserPassword(name, oldPassword, newPassword) {
  if (!validateNick(name)) throw new Error("invalid_nick");
  if (!validatePassword(oldPassword) || !validatePassword(newPassword)) throw new Error("invalid_password");

  const user = findUserByNick(name);
  if (!user) throw new Error("user_not_found");
  if (!verifyPassword(oldPassword, user.passwordSalt, user.passwordHash)) throw new Error("invalid_credentials");

  const nextSalt = randomBytes(16).toString("hex");
  user.passwordSalt = nextSalt;
  user.passwordHash = hashPassword(newPassword, nextSalt);
  await saveDb();
  return toPublicUser(user);
}

export function getUserAppState(userId) {
  if (!userId || typeof userId !== "string") throw new Error("invalid_user_id");
  const state = ensureUserState(userId);
  return sanitizeAppState(state);
}

export async function saveUserAppState(userId, appState) {
  if (!userId || typeof userId !== "string") throw new Error("invalid_user_id");
  const db = ensureDbLoaded();
  db.appStates[userId] = sanitizeAppState(appState);
  await saveDb();
  return db.appStates[userId];
}

export function getSharedAppState(userId) {
  if (!userId || typeof userId !== "string") throw new Error("invalid_user_id");
  const db = ensureDbLoaded();
  return buildVisibleSharedState(db, userId);
}

export async function saveSharedAppState(userId, sharedState) {
  if (!userId || typeof userId !== "string") throw new Error("invalid_user_id");
  const db = ensureDbLoaded();
  const raw = sharedState && typeof sharedState === "object" ? sharedState : {};
  const incomingServers = Array.isArray(raw.servers) ? raw.servers : [];
  const incomingMessages = raw.messages && typeof raw.messages === "object" ? raw.messages : {};

  for (const rawServer of incomingServers) {
    const safeServer = sanitizeServer(rawServer, userId);
    if (!safeServer) continue;

    const existing = db.servers[safeServer.id];
    if (!existing) {
      safeServer.ownerId = userId;
      safeServer.createdAt = now();
      safeServer.updatedAt = now();
      db.servers[safeServer.id] = safeServer;
      ensureMembership(db, safeServer.id, userId, "owner");
      continue;
    }

    if (!canManageServer(db, userId, safeServer.id)) continue;

    existing.name = safeServer.name;
    existing.description = safeServer.description || "";
    existing.iconUrl = safeServer.iconUrl || "";
    existing.isPrivate = Boolean(safeServer.isPrivate);
    existing.channels = safeServer.channels;
    existing.updatedAt = now();
  }

  const channelToServer = new Map();
  for (const server of Object.values(db.servers)) {
    for (const channel of server.channels) {
      channelToServer.set(channel.id, server.id);
    }
  }

  for (const [channelId, rawList] of Object.entries(incomingMessages)) {
    if (!isId(channelId) || !Array.isArray(rawList)) continue;
    const serverId = channelToServer.get(channelId);
    if (!serverId) continue;
    const server = db.servers[serverId];
    if (!server) continue;
    if (server.isPrivate && !isServerMember(db, userId, serverId)) continue;

    const existing = Array.isArray(db.serverMessages[channelId]) ? db.serverMessages[channelId] : [];
    const map = new Map(existing.map((msg) => [msg.id, msg]));
    for (const rawMessage of rawList) {
      const msg = sanitizeMessage(rawMessage);
      if (!msg) continue;
      map.set(msg.id, msg);
    }
    db.serverMessages[channelId] = [...map.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-600);
  }

  await saveDb();
  return buildVisibleSharedState(db, userId);
}

export async function createServerRecord(userId, payload) {
  if (!userId || typeof userId !== "string") throw new Error("invalid_user_id");
  const db = ensureDbLoaded();

  const id = sanitizeString(payload?.id, 96) || makeId("s");
  if (!isId(id)) throw new Error("invalid_server_id");
  if (db.servers[id]) throw new Error("server_exists");

  const name = sanitizeString(payload?.name, 80);
  if (!name) throw new Error("invalid_server_name");

  const textId = `${id}_text_general`;
  const voiceId = `${id}_voice_lobby`;
  const channels = [
    { id: textId, name: "general", type: "text", slowModeSec: 0, userLimit: 0, bitrateKbps: 1200 },
    { id: voiceId, name: "lobby", type: "voice", slowModeSec: 0, userLimit: 0, bitrateKbps: 1200 },
  ];

  db.servers[id] = {
    id,
    name,
    description: sanitizeString(payload?.description || "", 220),
    iconUrl: sanitizeString(payload?.iconUrl || "", 300),
    isPrivate: Boolean(payload?.isPrivate),
    ownerId: userId,
    channels,
    createdAt: now(),
    updatedAt: now(),
  };

  ensureMembership(db, id, userId, "owner");
  await saveDb();
  return db.servers[id];
}

export async function updateServerRecord(userId, serverId, patch) {
  const db = ensureDbLoaded();
  const server = db.servers[serverId];
  if (!server) throw new Error("server_not_found");
  if (!canManageServer(db, userId, serverId)) throw new Error("forbidden");

  if (typeof patch?.name === "string") {
    const next = sanitizeString(patch.name, 80);
    if (!next) throw new Error("invalid_server_name");
    server.name = next;
  }
  if (typeof patch?.description === "string") server.description = sanitizeString(patch.description, 220);
  if (typeof patch?.iconUrl === "string") server.iconUrl = sanitizeString(patch.iconUrl, 300);
  if (typeof patch?.isPrivate === "boolean") server.isPrivate = patch.isPrivate;

  server.updatedAt = now();
  await saveDb();
  return server;
}

export async function joinPublicServer(userId, serverId) {
  const db = ensureDbLoaded();
  const server = db.servers[serverId];
  if (!server) throw new Error("server_not_found");
  if (server.isPrivate) throw new Error("server_private");
  ensureMembership(db, serverId, userId, "member");
  await saveDb();
  return server;
}

export function searchDiscoverableServers(userId, query = "", options = {}) {
  const db = ensureDbLoaded();
  const q = String(query || "").trim().toLowerCase();
  const limitRaw = Number(options.limit || 20);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 20;

  return Object.values(db.servers || {})
    .filter((server) => server && typeof server === "object")
    .filter((server) => !server.isPrivate)
    .filter((server) => !isServerMember(db, userId, server.id))
    .filter((server) => {
      if (!q) return true;
      const name = String(server.name || "").toLowerCase();
      const description = String(server.description || "").toLowerCase();
      return name.includes(q) || description.includes(q);
    })
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")))
    .slice(0, limit)
    .map((server) => ({
      id: server.id,
      name: server.name,
      iconUrl: server.iconUrl || undefined,
      description: server.description || undefined,
      membersCount: getServerMembersCount(db, server.id),
    }));
}

export async function leaveServer(userId, serverId) {
  const db = ensureDbLoaded();
  const server = db.servers[serverId];
  if (!server) throw new Error("server_not_found");
  const role = getMemberRole(db, userId, serverId);
  if (!role) throw new Error("not_member");
  if (role === "owner") throw new Error("owner_cannot_leave");
  delete db.memberships[serverId][userId];
  await saveDb();
  return { ok: true };
}

export async function createInviteRecord({ serverId, serverName, createdBy, expiresAt, maxUses }) {
  const db = ensureDbLoaded();
  const server = db.servers[serverId];
  if (!server) throw new Error("server_not_found");
  if (!canManageServer(db, createdBy, serverId)) throw new Error("forbidden");

  let code = makeInviteCode();
  const usedCodes = new Set(db.invites.map((item) => item.code));
  while (usedCodes.has(code)) code = makeInviteCode();

  const invite = {
    code,
    serverId,
    serverName: sanitizeString(serverName || server.name, 80) || server.name,
    createdBy,
    createdAt: now(),
    expiresAt: expiresAt || null,
    maxUses: maxUses || null,
    uses: 0,
    revoked: false,
  };
  db.invites.push(invite);
  await saveDb();
  return invite;
}

export function listInvitesByServer(serverId, requesterId = "") {
  const db = ensureDbLoaded();
  if (requesterId && !canManageServer(db, requesterId, serverId)) return [];
  return db.invites
    .filter((invite) => invite.serverId === serverId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getInviteByCode(code) {
  const db = ensureDbLoaded();
  return db.invites.find((invite) => invite.code === code) || null;
}

export function toPublicTwitchIntegration(integration) {
  if (!integration) return null;
  return {
    providerUserId: integration.providerUserId,
    login: integration.login,
    displayName: integration.displayName,
    profileImageUrl: integration.profileImageUrl || "",
    scopes: Array.isArray(integration.scopes) ? integration.scopes : [],
    expiresAt: integration.expiresAt || 0,
    connectedAt: integration.connectedAt || 0,
    updatedAt: integration.updatedAt || 0,
    settings: sanitizeTwitchSettings(integration.settings),
    creatorProgram: sanitizeTwitchCreatorProgram(integration.creatorProgram),
  };
}

export function toPublicTwitchCreatorProgram(userId, integration) {
  if (!integration) return null;
  const program = sanitizeTwitchCreatorProgram(integration.creatorProgram);
  return {
    userId,
    providerUserId: integration.providerUserId,
    login: integration.login,
    displayName: integration.displayName,
    profileImageUrl: integration.profileImageUrl || "",
    program,
  };
}

export function getTwitchIntegration(userId) {
  const db = ensureDbLoaded();
  const record = db.integrations?.[userId]?.twitch || null;
  return record ? sanitizeTwitchIntegration(record) : null;
}

export async function saveTwitchIntegration(userId, integration) {
  if (!userId || typeof userId !== "string") throw new Error("invalid_user_id");
  const db = ensureDbLoaded();
  if (!getUserById(db, userId)) throw new Error("user_not_found");
  const safe = sanitizeTwitchIntegration(integration);
  if (!safe) throw new Error("invalid_twitch_integration");
  if (!db.integrations[userId] || typeof db.integrations[userId] !== "object") db.integrations[userId] = {};
  db.integrations[userId].twitch = safe;
  await saveDb();
  return safe;
}

export async function updateTwitchIntegrationSettings(userId, settings) {
  const db = ensureDbLoaded();
  const existing = db.integrations?.[userId]?.twitch;
  if (!existing) throw new Error("twitch_not_connected");
  const safe = sanitizeTwitchIntegration(existing);
  safe.settings = {
    ...safe.settings,
    ...sanitizeTwitchSettings({ ...safe.settings, ...(settings && typeof settings === "object" ? settings : {}) }),
  };
  safe.updatedAt = now();
  db.integrations[userId].twitch = safe;
  await saveDb();
  return safe;
}

export async function updateTwitchCreatorProgram(userId, program) {
  const db = ensureDbLoaded();
  const existing = db.integrations?.[userId]?.twitch;
  if (!existing) throw new Error("twitch_not_connected");
  const safe = sanitizeTwitchIntegration(existing);
  safe.creatorProgram = {
    ...safe.creatorProgram,
    ...sanitizeTwitchCreatorProgram({
      ...safe.creatorProgram,
      ...(program && typeof program === "object" ? program : {}),
      updatedAt: now(),
    }),
  };
  safe.updatedAt = now();
  db.integrations[userId].twitch = safe;
  await saveDb();
  return safe;
}

export function listPublicTwitchCreatorPrograms() {
  const db = ensureDbLoaded();
  const rows = [];
  for (const [userId, integrations] of Object.entries(db.integrations || {})) {
    const twitch = sanitizeTwitchIntegration(integrations?.twitch);
    if (!twitch?.creatorProgram?.enabled) continue;
    rows.push(toPublicTwitchCreatorProgram(userId, twitch));
  }
  return rows.sort((a, b) => String(a.displayName || a.login).localeCompare(String(b.displayName || b.login)));
}

export function findTwitchCreatorProgram(selector = {}) {
  const providerUserId = sanitizeString(selector.providerUserId || "", 96);
  const login = sanitizeString(selector.login || "", 80).toLowerCase();
  const userId = sanitizeString(selector.userId || "", 96);
  const db = ensureDbLoaded();

  for (const [ownerUserId, integrations] of Object.entries(db.integrations || {})) {
    const twitch = sanitizeTwitchIntegration(integrations?.twitch);
    if (!twitch?.creatorProgram?.enabled) continue;
    if (userId && ownerUserId !== userId) continue;
    if (providerUserId && twitch.providerUserId !== providerUserId) continue;
    if (login && twitch.login !== login) continue;
    if (!userId && !providerUserId && !login) continue;
    return { userId: ownerUserId, integration: twitch, program: twitch.creatorProgram };
  }

  return null;
}

export function getUserIdByTwitchProviderId(providerUserId) {
  const twitchUserId = sanitizeString(providerUserId || "", 96);
  if (!twitchUserId) return "";
  const db = ensureDbLoaded();
  for (const [userId, integrations] of Object.entries(db.integrations || {})) {
    const twitch = sanitizeTwitchIntegration(integrations?.twitch);
    if (twitch?.providerUserId === twitchUserId) return userId;
  }
  return "";
}

export function hasTwitchEventSubMessage(messageId) {
  const id = sanitizeString(messageId || "", 160);
  if (!id) return false;
  const db = ensureDbLoaded();
  return Boolean(db.twitchEventSubMessages?.[id]);
}

export async function recordTwitchEventSubMessage(message) {
  const db = ensureDbLoaded();
  if (!db.twitchEventSubMessages || typeof db.twitchEventSubMessages !== "object") db.twitchEventSubMessages = {};

  const safe = sanitizeTwitchEventSubMessage({
    ...message,
    receivedAt: message?.receivedAt || now(),
  });
  if (!safe) throw new Error("invalid_twitch_eventsub_message");

  const duplicate = Boolean(db.twitchEventSubMessages[safe.id]);
  db.twitchEventSubMessages[safe.id] = {
    ...safe,
    duplicate,
  };

  db.twitchEventSubMessages = sanitizeTwitchEventSubMessagesMap(db.twitchEventSubMessages);
  await saveDb();
  return { duplicate, message: db.twitchEventSubMessages[safe.id] };
}

function twitchTierRankDb(tier) {
  if (String(tier) === "3000") return 3;
  if (String(tier) === "2000") return 2;
  if (String(tier) === "1000") return 1;
  return 0;
}

export function toPublicTwitchSubscriberPerkGrant(grant) {
  const safe = sanitizeTwitchSubscriberPerkGrant(grant);
  if (!safe) return null;
  return {
    id: safe.id,
    creatorUserId: safe.creatorUserId,
    creatorTwitchUserId: safe.creatorTwitchUserId,
    creatorLogin: safe.creatorLogin,
    creatorDisplayName: safe.creatorDisplayName,
    viewerUserId: safe.viewerUserId || "",
    viewerTwitchUserId: safe.viewerTwitchUserId,
    viewerLogin: safe.viewerLogin,
    viewerDisplayName: safe.viewerDisplayName,
    active: safe.active,
    tier: safe.tier,
    isGift: safe.isGift,
    rewardKind: safe.rewardKind,
    rewardName: safe.rewardName,
    rewardDescription: safe.rewardDescription,
    source: safe.source,
    createdAt: safe.createdAt,
    grantedAt: safe.grantedAt,
    revokedAt: safe.revokedAt,
    updatedAt: safe.updatedAt,
    lastEventAt: safe.lastEventAt,
  };
}

export function listTwitchSubscriberPerkGrants(selector = {}) {
  const creatorUserId = sanitizeString(selector.creatorUserId || "", 96);
  const viewerUserId = sanitizeString(selector.viewerUserId || "", 96);
  const onlyActive = selector.onlyActive === true;
  const db = ensureDbLoaded();

  return Object.values(db.twitchSubscriberPerkGrants || {})
    .map((item) => sanitizeTwitchSubscriberPerkGrant(item))
    .filter(Boolean)
    .filter((grant) => !creatorUserId || grant.creatorUserId === creatorUserId)
    .filter((grant) => !viewerUserId || grant.viewerUserId === viewerUserId)
    .filter((grant) => !onlyActive || grant.active)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((grant) => toPublicTwitchSubscriberPerkGrant(grant))
    .filter(Boolean);
}

export async function applyTwitchSubscriberPerkGrant({ creatorUserId, creatorIntegration, program, event, active, source, messageId }) {
  const db = ensureDbLoaded();
  if (!db.twitchSubscriberPerkGrants || typeof db.twitchSubscriberPerkGrants !== "object") db.twitchSubscriberPerkGrants = {};

  const ownerUserId = sanitizeString(creatorUserId || "", 96);
  const creator = sanitizeTwitchIntegration(creatorIntegration);
  const safeProgram = sanitizeTwitchCreatorProgram(program);
  const rawEvent = event && typeof event === "object" ? event : {};
  const viewerTwitchUserId = sanitizeString(rawEvent.user_id || "", 96);
  if (!ownerUserId || !creator || !viewerTwitchUserId) throw new Error("invalid_twitch_subscriber_event");

  const tier = String(rawEvent.tier || "1000");
  const isGift = Boolean(rawEvent.is_gift);
  const nowTs = now();
  const grantKey = twitchGrantKey(ownerUserId, viewerTwitchUserId);
  const existing = sanitizeTwitchSubscriberPerkGrant(db.twitchSubscriberPerkGrants[grantKey]) || null;
  const shouldActivate = Boolean(active);

  if (shouldActivate) {
    if (isGift && safeProgram.allowGiftedSubscriptions === false) {
      return { grant: existing ? toPublicTwitchSubscriberPerkGrant(existing) : null, changed: false, reason: "gift_subscription_not_allowed" };
    }
    if (twitchTierRankDb(tier) < twitchTierRankDb(safeProgram.minimumTier)) {
      return { grant: existing ? toPublicTwitchSubscriberPerkGrant(existing) : null, changed: false, reason: "tier_too_low" };
    }
  }

  const viewerUserId = getUserIdByTwitchProviderId(viewerTwitchUserId);
  const next = sanitizeTwitchSubscriberPerkGrant({
    ...(existing || {}),
    creatorUserId: ownerUserId,
    creatorTwitchUserId: creator.providerUserId,
    creatorLogin: creator.login,
    creatorDisplayName: creator.displayName,
    viewerUserId,
    viewerTwitchUserId,
    viewerLogin: rawEvent.user_login || existing?.viewerLogin || "",
    viewerDisplayName: rawEvent.user_name || existing?.viewerDisplayName || rawEvent.user_login || "",
    active: shouldActivate,
    tier,
    isGift,
    rewardKind: safeProgram.rewardKind,
    rewardName: safeProgram.rewardName,
    rewardDescription: safeProgram.rewardDescription,
    source: source || "eventsub",
    messageId,
    createdAt: existing?.createdAt || nowTs,
    grantedAt: shouldActivate ? (existing?.grantedAt || nowTs) : (existing?.grantedAt || 0),
    revokedAt: shouldActivate ? 0 : nowTs,
    updatedAt: nowTs,
    lastEventAt: nowTs,
  });

  if (!next) throw new Error("invalid_twitch_subscriber_grant");
  db.twitchSubscriberPerkGrants[next.id] = next;
  await saveDb();
  return { grant: toPublicTwitchSubscriberPerkGrant(next), changed: true, reason: shouldActivate ? "granted" : "revoked" };
}

export function getTwitchCreatorLiveState(creatorUserId) {
  const userId = sanitizeString(creatorUserId || "", 96);
  if (!userId) return null;
  const db = ensureDbLoaded();
  return sanitizeTwitchCreatorLiveState(db.twitchCreatorLiveStates?.[userId]) || null;
}

export async function updateTwitchCreatorLiveState({ creatorUserId, integration, event, isLive }) {
  const db = ensureDbLoaded();
  if (!db.twitchCreatorLiveStates || typeof db.twitchCreatorLiveStates !== "object") db.twitchCreatorLiveStates = {};
  const userId = sanitizeString(creatorUserId || "", 96);
  const twitch = sanitizeTwitchIntegration(integration);
  if (!userId || !twitch) throw new Error("invalid_twitch_live_state");

  const rawEvent = event && typeof event === "object" ? event : {};
  const nowTs = now();
  const existing = sanitizeTwitchCreatorLiveState(db.twitchCreatorLiveStates[userId]) || {};
  const startedAtString = sanitizeString(rawEvent.started_at || "", 80);
  const startedAt = startedAtString ? Date.parse(startedAtString) : 0;
  const next = sanitizeTwitchCreatorLiveState({
    ...existing,
    creatorUserId: userId,
    twitchUserId: twitch.providerUserId,
    login: rawEvent.broadcaster_user_login || twitch.login,
    displayName: rawEvent.broadcaster_user_name || twitch.displayName,
    isLive: Boolean(isLive),
    streamId: isLive ? rawEvent.id || existing.streamId || "" : "",
    streamType: isLive ? rawEvent.type || existing.streamType || "live" : "",
    startedAt: isLive ? (Number.isFinite(startedAt) && startedAt > 0 ? startedAt : nowTs) : existing.startedAt || 0,
    endedAt: isLive ? 0 : nowTs,
    updatedAt: nowTs,
  });

  if (!next) throw new Error("invalid_twitch_live_state");
  db.twitchCreatorLiveStates[userId] = next;
  await saveDb();
  return next;
}

export async function removeTwitchIntegration(userId) {
  const db = ensureDbLoaded();
  if (db.integrations?.[userId]?.twitch) {
    delete db.integrations[userId].twitch;
    if (Object.keys(db.integrations[userId]).length === 0) delete db.integrations[userId];
    await saveDb();
  }
  return { ok: true };
}

export async function joinInviteByCode(code, userId = "") {
  const db = ensureDbLoaded();
  const invite = db.invites.find((item) => item.code === code);
  if (!invite) throw new Error("invite_not_found");

  const status = inviteStatus(invite);
  if (status !== "active") throw new Error("invite_not_usable");

  const server = db.servers[invite.serverId];
  if (!server) throw new Error("server_not_found");

  invite.uses += 1;
  if (userId) ensureMembership(db, invite.serverId, userId, "member");
  await saveDb();
  return invite;
}

export async function revokeInviteByCode(code, requesterId = "") {
  const db = ensureDbLoaded();
  const invite = db.invites.find((item) => item.code === code);
  if (!invite) throw new Error("invite_not_found");
  if (requesterId && !canManageServer(db, requesterId, invite.serverId)) throw new Error("forbidden");
  invite.revoked = true;
  await saveDb();
  return invite;
}

export function getPublicDbStats() {
  const db = ensureDbLoaded();
  const nowTs = now();
  let activeInvites = 0;
  for (const invite of db.invites) {
    if (inviteStatus(invite, nowTs) === "active") activeInvites += 1;
  }
  const serversCount = Object.keys(db.servers || {}).length;
  return {
    usersCount: db.users.length,
    invitesCount: db.invites.length,
    activeInvitesCount: activeInvites,
    serversCount,
  };
}

export function getDbStorageStats() {
  if (USE_POSTGRES) {
    return { ...storageStatsCache };
  }

  try {
    const stat = fs.statSync(DB_PATH);
    return {
      filePath: DB_PATH,
      fileBytes: Number(stat.size || 0),
      lastModifiedMs: Number(stat.mtimeMs || 0),
    };
  } catch {
    return { ...storageStatsCache };
  }
}

export { toPublicInvite, canManageServer };
