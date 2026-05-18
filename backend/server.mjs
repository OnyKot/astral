import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  createUser,
  loginUser,
  changeUserPassword,
  createServerRecord,
  updateServerRecord,
  joinPublicServer,
  leaveServer,
  createInviteRecord,
  getInviteByCode,
  joinInviteByCode,
  listInvitesByServer,
  revokeInviteByCode,
  toPublicInvite,
  getUserAppState,
  saveUserAppState,
  getSharedAppState,
  saveSharedAppState,
  findPublicUserByNick,
  findPublicUserById,
  searchPublicUsers,
  searchDiscoverableServers,
  sendFriendRequest,
  listFriendRequestsForUser,
  respondFriendRequest,
  getPublicDbStats,
  getDbStorageStats,
  applyTwitchSubscriberPerkGrant,
  getTwitchIntegration,
  getTwitchCreatorLiveState,
  hasTwitchEventSubMessage,
  findTwitchCreatorProgram,
  listPublicTwitchCreatorPrograms,
  listTwitchSubscriberPerkGrants,
  recordTwitchEventSubMessage,
  removeTwitchIntegration,
  saveTwitchIntegration,
  toPublicTwitchCreatorProgram,
  toPublicTwitchIntegration,
  updateTwitchCreatorProgram,
  updateTwitchCreatorLiveState,
  updateTwitchIntegrationSettings,
} from "./db.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.BACKEND_PORT || 8787);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";
const AUTH_SECRET = String(process.env.AUTH_SECRET || "").trim();
const AUTH_TTL_MS = Number(process.env.AUTH_TTL_MS || 14 * 24 * 60 * 60 * 1000);
const REQUIRE_BETA_CODE_FOR_REGISTRATION = String(process.env.REQUIRE_BETA_CODE_FOR_REGISTRATION || "1") !== "0";
const LOG_TO_FILE = String(process.env.LOG_TO_FILE || "1") !== "0";
const LOG_FILE_PATH = process.env.LOG_FILE_PATH || path.join(__dirname, "logs", "server.log");
const CORS_ALLOW_METHODS = "GET,POST,PATCH,OPTIONS";
const TWITCH_CLIENT_ID = String(process.env.TWITCH_CLIENT_ID || "").trim();
const TWITCH_CLIENT_SECRET = String(process.env.TWITCH_CLIENT_SECRET || "").trim();
const TWITCH_REDIRECT_URI = String(process.env.TWITCH_REDIRECT_URI || "").trim();
const PUBLIC_ORIGIN = String(process.env.PUBLIC_ORIGIN || "").trim();
const TWITCH_SCOPES = String(process.env.TWITCH_SCOPES || "user:read:email")
  .split(/[,\s]+/)
  .map((scope) => scope.trim())
  .filter(Boolean);
const TWITCH_CREATOR_SCOPES = String(process.env.TWITCH_CREATOR_SCOPES || "channel:read:subscriptions")
  .split(/[,\s]+/)
  .map((scope) => scope.trim())
  .filter(Boolean);
const TWITCH_EVENTSUB_SECRET = String(process.env.TWITCH_EVENTSUB_SECRET || "").trim();
const TWITCH_EVENTSUB_CALLBACK_URL = String(process.env.TWITCH_EVENTSUB_CALLBACK_URL || "").trim();
const TWITCH_EVENTSUB_TYPES = [
  "channel.subscribe",
  "channel.subscription.end",
  "channel.subscription.gift",
  "stream.online",
  "stream.offline",
];
const TWITCH_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const TWITCH_EVENTSUB_REPLAY_WINDOW_MS = 10 * 60 * 1000;

if (!AUTH_SECRET || AUTH_SECRET === "dev-only-change-this-secret") {
  throw new Error("AUTH_SECRET must be explicitly set to a strong non-default value.");
}

const POLICY = {
  mode: "ephemeral-signaling-with-persisted-auth-invites",
  maxPeersPerRoom: 8,
  presenceTtlMs: 45_000,
  maxSignalPayloadBytes: 24_000,
  maxSignalsPerMinutePerSender: 120,
  maxInviteTtlHours: 720,
  maxInviteUses: 999,
  allowedSignalTypes: ["offer", "answer", "ice", "bye"],
  retention: "Signaling data is ephemeral; user credentials and invite metadata are persisted.",
};

const rooms = new Map();
const inbox = new Map();
const rateBuckets = new Map();
const activeCallSessions = new Map();
const twitchOauthStates = new Map();
let twitchAppAccessToken = null;
const responseCodeCounters = new Map();
const runtimeStats = {
  requestsTotal: 0,
  responsesTotal: 0,
  serverErrorsTotal: 0,
  notFoundTotal: 0,
};
const CALL_SESSION_TTL_MS = 20_000;

let logStream = null;
if (LOG_TO_FILE) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE_PATH), { recursive: true });
    logStream = fs.createWriteStream(LOG_FILE_PATH, { flags: "a", encoding: "utf8" });
    logStream.on("error", (error) => {
      console.error(`[log_stream_error] ${error instanceof Error ? error.message : String(error)}`);
    });
  } catch (error) {
    console.error(`[log_stream_init_error] ${error instanceof Error ? error.message : String(error)}`);
  }
}

function writeLog(level, event, payload = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...payload,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else {
    process.stdout.write(`${line}\n`);
  }
  if (logStream) {
    logStream.write(`${line}\n`);
  }
}

function send(res, code, body, contentType, logMeta = {}) {
  const status = Number.isFinite(Number(code)) ? Number(code) : 500;
  const statusCount = responseCodeCounters.get(status) || 0;
  responseCodeCounters.set(status, statusCount + 1);

  runtimeStats.responsesTotal += 1;
  if (status >= 500) {
    runtimeStats.serverErrorsTotal += 1;
  }
  if (status === 404) {
    runtimeStats.notFoundTotal += 1;
  }

  const requestMeta = res.__requestMeta || null;
  if (requestMeta) {
    writeLog(status >= 500 ? "error" : "info", "http_response", {
      method: requestMeta.method,
      path: requestMeta.path,
      userId: requestMeta.userId || undefined,
      status,
      durationMs: Math.max(0, now() - requestMeta.startedAt),
      error: logMeta.error || undefined,
    });
  }

  res.writeHead(status, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": FRONTEND_ORIGIN,
    "Access-Control-Allow-Methods": CORS_ALLOW_METHODS,
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function json(res, code, body) {
  send(res, code, JSON.stringify(body), "application/json; charset=utf-8", {
    error: body && typeof body === "object" ? body.error || undefined : undefined,
  });
}

function text(res, code, body, contentType = "text/plain; charset=utf-8") {
  send(res, code, body, contentType);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 128_000) reject(new Error("payload_too_large"));
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function readRawBody(req, maxBytes = 256_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        reject(new Error("payload_too_large"));
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function isId(value, max = 64) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value) && value.length > 0 && value.length <= max;
}

function now() {
  return Date.now();
}

function signTokenPayload(payloadB64) {
  return createHmac("sha256", AUTH_SECRET).update(payloadB64).digest("base64url");
}

function createAuthToken(user) {
  const issuedAt = now();
  const payload = {
    sub: user.id,
    name: user.name,
    iat: issuedAt,
    exp: issuedAt + AUTH_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signTokenPayload(payloadB64);
  return `${payloadB64}.${signature}`;
}

function readBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== "string") return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token.trim();
}

function verifyAuthToken(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) return null;

  const expectedSignature = signTokenPayload(payloadB64);
  const expected = Buffer.from(expectedSignature, "utf8");
  const received = Buffer.from(signature, "utf8");
  if (expected.length !== received.length) return null;
  if (!timingSafeEqual(expected, received)) return null;

  let payload = null;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const name = typeof payload.name === "string" ? payload.name : "";
  const exp = Number(payload.exp || 0);
  if (!isId(sub, 96)) return null;
  if (!Number.isFinite(exp) || exp <= now()) return null;
  const user = findPublicUserById(sub);
  if (!user) return null;

  return { sub, name };
}

function requireAuth(req, res) {
  const token = readBearerToken(req);
  if (!token) {
    json(res, 401, { error: "unauthorized" });
    return null;
  }
  const auth = verifyAuthToken(token);
  if (!auth) {
    json(res, 401, { error: "unauthorized" });
    return null;
  }
  if (res.__requestMeta) {
    res.__requestMeta.userId = auth.sub;
  }
  return auth;
}

function cleanup() {
  const t = now();

  for (const [roomId, peers] of rooms.entries()) {
    for (const [peerId, peer] of peers.entries()) {
      if (t - peer.lastSeenAt > POLICY.presenceTtlMs) peers.delete(peerId);
    }
    if (peers.size === 0) rooms.delete(roomId);
  }

  for (const [peerId, queue] of inbox.entries()) {
    const fresh = queue.filter((item) => t - item.ts <= POLICY.presenceTtlMs);
    if (fresh.length) inbox.set(peerId, fresh);
    else inbox.delete(peerId);
  }

  for (const [userId, session] of activeCallSessions.entries()) {
    if (!session || t - Number(session.updatedAt || 0) > CALL_SESSION_TTL_MS) {
      activeCallSessions.delete(userId);
    }
  }
}

function touchPeer(roomId, peerId, name = "", ownerId = "") {
  let peers = rooms.get(roomId);
  if (!peers) {
    peers = new Map();
    rooms.set(roomId, peers);
  }
  const previous = peers.get(peerId) || null;
  peers.set(peerId, {
    peerId,
    name: name || previous?.name || "",
    ownerId: ownerId || previous?.ownerId || "",
    lastSeenAt: now(),
  });
}

function getPeers(roomId, exceptPeerId = "") {
  const peers = rooms.get(roomId);
  if (!peers) return [];
  return [...peers.values()]
    .filter((p) => p.peerId !== exceptPeerId)
    .map((p) => ({ peerId: p.peerId, name: p.name || undefined }));
}

function getPeer(roomId, peerId) {
  const peers = rooms.get(roomId);
  if (!peers) return null;
  return peers.get(peerId) || null;
}

function queueSignal(targetPeerId, packet) {
  const queue = inbox.get(targetPeerId) || [];
  queue.push({ ...packet, ts: now() });
  inbox.set(targetPeerId, queue.slice(-200));
}

function drainSignals(peerId) {
  const queue = inbox.get(peerId) || [];
  inbox.delete(peerId);
  return queue.map(({ ts, ...packet }) => packet);
}

function getRateKey(req, sender) {
  const fwd = req.headers["x-forwarded-for"];
  const ip = typeof fwd === "string" ? fwd.split(",")[0].trim() : req.socket.remoteAddress || "unknown";
  return `${ip}:${sender}`;
}

function hitRateLimit(key) {
  const t = now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= t) {
    rateBuckets.set(key, { count: 1, resetAt: t + 60_000 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > POLICY.maxSignalsPerMinutePerSender;
}

function isInviteCode(value) {
  return typeof value === "string" && /^[A-Z0-9]{6,16}$/.test(value);
}

function isPeerOwnedByAuth(auth, peerId) {
  return typeof peerId === "string" && peerId.startsWith(`${auth.sub}_`);
}

function apiPath(pathname, suffix) {
  return pathname === `/api${suffix}` || pathname === `/api/v1${suffix}`;
}

function getTwitchRedirectUri(req) {
  if (TWITCH_REDIRECT_URI) return TWITCH_REDIRECT_URI;
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const proto = req.headers["x-forwarded-proto"] || (PUBLIC_ORIGIN.startsWith("https://") ? "https" : "http");
  const origin = PUBLIC_ORIGIN || `${proto}://${host}`;
  return `${String(origin).replace(/\/+$/, "")}/api/integrations/twitch/oauth/callback`;
}

function getPublicOrigin(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const proto = req.headers["x-forwarded-proto"] || (PUBLIC_ORIGIN.startsWith("https://") ? "https" : "http");
  return String(PUBLIC_ORIGIN || `${proto}://${host}`).replace(/\/+$/, "");
}

function getTwitchEventSubCallbackUrl(req) {
  if (TWITCH_EVENTSUB_CALLBACK_URL) return TWITCH_EVENTSUB_CALLBACK_URL;
  return `${getPublicOrigin(req)}/api/integrations/twitch/eventsub`;
}

function isTwitchConfigured() {
  return Boolean(TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET);
}

function isTwitchEventSubConfigured() {
  return Boolean(isTwitchConfigured() && TWITCH_EVENTSUB_SECRET.length >= 10 && TWITCH_EVENTSUB_SECRET.length <= 100);
}

function mergeScopes(...groups) {
  return Array.from(new Set(
    groups.flatMap((group) => Array.isArray(group) ? group : [])
      .map((scope) => String(scope || "").trim())
      .filter(Boolean),
  ));
}

function getTwitchOAuthScopes(intent = "viewer") {
  if (intent === "creator") {
    return mergeScopes(TWITCH_SCOPES, TWITCH_CREATOR_SCOPES);
  }
  return mergeScopes(TWITCH_SCOPES);
}

function hasTwitchScope(integration, scope) {
  return Array.isArray(integration?.scopes) && integration.scopes.includes(scope);
}

function twitchEventSubTypeNeedsSubscriptionScope(type) {
  return String(type || "").startsWith("channel.subscription") || String(type || "") === "channel.subscribe";
}

function twitchTierRank(tier) {
  if (String(tier) === "3000") return 3;
  if (String(tier) === "2000") return 2;
  if (String(tier) === "1000") return 1;
  return 0;
}

function cleanupTwitchOauthStates() {
  const cutoff = now() - TWITCH_OAUTH_STATE_TTL_MS;
  for (const [state, item] of twitchOauthStates.entries()) {
    if (!item || Number(item.createdAt || 0) < cutoff) {
      twitchOauthStates.delete(state);
    }
  }
}

function createTwitchOAuthState(userId, meta = {}) {
  cleanupTwitchOauthStates();
  const state = randomBytes(24).toString("base64url");
  twitchOauthStates.set(state, {
    userId,
    createdAt: now(),
    intent: meta.intent || "viewer",
    scopes: Array.isArray(meta.scopes) ? meta.scopes : TWITCH_SCOPES,
  });
  return state;
}

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function twitchCallbackHtml(payload) {
  const serialized = JSON.stringify(payload).replaceAll("<", "\\u003c");
  const title = payload.ok ? "Twitch connected" : "Twitch connection failed";
  const body = payload.ok
    ? `Connected as ${htmlEscape(payload.login || "Twitch")}. You can close this tab.`
    : `Connection failed: ${htmlEscape(payload.error || "unknown_error")}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101014; color: #f7f7fb; font: 16px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(28rem, calc(100vw - 2rem)); padding: 1.25rem; border: 1px solid rgb(255 255 255 / 12%); border-radius: 16px; background: #181821; box-shadow: 0 24px 70px rgb(0 0 0 / 35%); }
    h1 { margin: 0 0 .5rem; font-size: 1.35rem; }
    p { margin: 0; color: #c8c8d8; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${body}</p>
  </main>
  <script>
    const payload = ${serialized};
    try { localStorage.setItem('astral.twitch.connect.result', JSON.stringify(payload)); } catch {}
    try { window.opener && window.opener.postMessage({ type: 'astral:twitch:oauth', payload }, '*'); } catch {}
    if (payload.ok) setTimeout(() => window.close(), 900);
  </script>
</body>
</html>`;
}

async function exchangeTwitchCode({ code, redirectUri }) {
  const body = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    client_secret: TWITCH_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.status || "twitch_token_exchange_failed");
  }
  return payload;
}

async function fetchTwitchUser(accessToken) {
  const response = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Client-Id": TWITCH_CLIENT_ID,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.status || "twitch_user_fetch_failed");
  }
  const user = Array.isArray(payload?.data) ? payload.data[0] : null;
  if (!user?.id || !user?.login) {
    throw new Error("twitch_user_missing");
  }
  return user;
}

async function getTwitchAppAccessToken() {
  if (
    twitchAppAccessToken?.accessToken
    && Number(twitchAppAccessToken.expiresAt || 0) > now() + 60_000
  ) {
    return twitchAppAccessToken.accessToken;
  }

  const body = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    client_secret: TWITCH_CLIENT_SECRET,
    grant_type: "client_credentials",
  });

  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.message || payload?.status || "twitch_app_token_failed");
  }

  const expiresIn = Number(payload.expires_in || 0);
  twitchAppAccessToken = {
    accessToken: payload.access_token,
    expiresAt: expiresIn > 0 ? now() + expiresIn * 1000 : now() + 60 * 60 * 1000,
  };
  return twitchAppAccessToken.accessToken;
}

function eventSubSubscriptionRecord(subscription, fallback = {}) {
  const raw = subscription && typeof subscription === "object" ? subscription : {};
  return {
    id: String(raw.id || fallback.id || ""),
    type: String(raw.type || fallback.type || ""),
    version: String(raw.version || fallback.version || "1"),
    status: String(raw.status || fallback.status || "unknown"),
    condition: raw.condition && typeof raw.condition === "object" ? raw.condition : (fallback.condition || {}),
    createdAt: raw.created_at ? Date.parse(raw.created_at) : (fallback.createdAt || now()),
    updatedAt: now(),
    error: String(fallback.error || ""),
  };
}

function mergeEventSubSubscriptionRecords(existing = [], incoming = []) {
  const byType = new Map();
  for (const item of Array.isArray(existing) ? existing : []) {
    if (item?.type) byType.set(item.type, item);
  }
  for (const item of Array.isArray(incoming) ? incoming : []) {
    if (item?.type) byType.set(item.type, item);
  }
  return Array.from(byType.values()).sort((a, b) => String(a.type).localeCompare(String(b.type)));
}

async function createTwitchEventSubSubscription({ type, broadcasterId, callbackUrl }) {
  const appAccessToken = await getTwitchAppAccessToken();
  const condition = { broadcaster_user_id: broadcasterId };
  const response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${appAccessToken}`,
      "Client-Id": TWITCH_CLIENT_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type,
      version: "1",
      condition,
      transport: {
        method: "webhook",
        callback: callbackUrl,
        secret: TWITCH_EVENTSUB_SECRET,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));

  if (response.status === 409) {
    return eventSubSubscriptionRecord(null, {
      id: payload?.id || "",
      type,
      version: "1",
      status: "already_exists",
      condition,
      error: payload?.message || "",
    });
  }

  if (!response.ok) {
    throw new Error(payload?.message || payload?.status || `twitch_eventsub_${type}_failed`);
  }

  const subscription = Array.isArray(payload?.data) ? payload.data[0] : null;
  return eventSubSubscriptionRecord(subscription, { type, version: "1", condition });
}

function verifyTwitchEventSubSignature(req, rawBody) {
  if (!TWITCH_EVENTSUB_SECRET) return { ok: false, reason: "eventsub_secret_missing" };
  const messageId = String(req.headers["twitch-eventsub-message-id"] || "");
  const timestamp = String(req.headers["twitch-eventsub-message-timestamp"] || "");
  const signature = String(req.headers["twitch-eventsub-message-signature"] || "");
  if (!messageId || !timestamp || !signature) return { ok: false, reason: "eventsub_headers_missing" };

  const messageTime = Date.parse(timestamp);
  if (!Number.isFinite(messageTime) || Math.abs(now() - messageTime) > TWITCH_EVENTSUB_REPLAY_WINDOW_MS) {
    return { ok: false, reason: "eventsub_timestamp_rejected" };
  }

  const expected = `sha256=${createHmac("sha256", TWITCH_EVENTSUB_SECRET)
    .update(`${messageId}${timestamp}${rawBody}`)
    .digest("hex")}`;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");
  if (expectedBuffer.length !== receivedBuffer.length) return { ok: false, reason: "eventsub_signature_mismatch" };
  if (!timingSafeEqual(expectedBuffer, receivedBuffer)) return { ok: false, reason: "eventsub_signature_mismatch" };
  return { ok: true, messageId, timestamp };
}

function sendTwitchChallenge(res, challenge) {
  const body = String(challenge || "");
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body, "utf8"),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function handleTwitchEventSubNotification({ messageId, payload }) {
  const subscription = payload?.subscription && typeof payload.subscription === "object" ? payload.subscription : {};
  const event = payload?.event && typeof payload.event === "object" ? payload.event : {};
  const subscriptionType = String(subscription.type || "");
  const broadcasterUserId = String(
    event.broadcaster_user_id
    || subscription?.condition?.broadcaster_user_id
    || "",
  );

  if (!broadcasterUserId) {
    return { ok: true, ignored: true, reason: "missing_broadcaster_user_id" };
  }

  const creator = findTwitchCreatorProgram({ providerUserId: broadcasterUserId });
  if (!creator) {
    return { ok: true, ignored: true, reason: "creator_program_not_found" };
  }

  if (subscriptionType === "channel.subscribe") {
    return applyTwitchSubscriberPerkGrant({
      creatorUserId: creator.userId,
      creatorIntegration: creator.integration,
      program: creator.program,
      event,
      active: true,
      source: "eventsub.channel.subscribe",
      messageId,
    });
  }

  if (subscriptionType === "channel.subscription.end") {
    return applyTwitchSubscriberPerkGrant({
      creatorUserId: creator.userId,
      creatorIntegration: creator.integration,
      program: creator.program,
      event,
      active: false,
      source: "eventsub.channel.subscription.end",
      messageId,
    });
  }

  if (subscriptionType === "stream.online") {
    const liveState = await updateTwitchCreatorLiveState({
      creatorUserId: creator.userId,
      integration: creator.integration,
      event,
      isLive: true,
    });
    return { ok: true, liveState };
  }

  if (subscriptionType === "stream.offline") {
    const liveState = await updateTwitchCreatorLiveState({
      creatorUserId: creator.userId,
      integration: creator.integration,
      event,
      isLive: false,
    });
    return { ok: true, liveState };
  }

  return { ok: true, ignored: true, reason: "event_type_audited_only", subscriptionType };
}

async function checkTwitchSubscriberPerk({ creatorIntegration, viewerIntegration, program }) {
  if (!creatorIntegration || !viewerIntegration) {
    return { eligible: false, reason: "twitch_not_connected" };
  }
  if (!program?.enabled || !program?.subscriberPerksEnabled) {
    return { eligible: false, reason: "creator_program_disabled" };
  }
  if (creatorIntegration.providerUserId === viewerIntegration.providerUserId) {
    return {
      eligible: true,
      reason: "creator_owner",
      tier: "3000",
      isGift: false,
      reward: program,
    };
  }
  if (!hasTwitchScope(creatorIntegration, "channel:read:subscriptions")) {
    return {
      eligible: false,
      reason: "creator_scope_required",
      needsCreatorScope: true,
      missingScope: "channel:read:subscriptions",
    };
  }

  const requestUrl = new URL("https://api.twitch.tv/helix/subscriptions");
  requestUrl.searchParams.set("broadcaster_id", creatorIntegration.providerUserId);
  requestUrl.searchParams.set("user_id", viewerIntegration.providerUserId);

  const response = await fetch(requestUrl, {
    headers: {
      "Authorization": `Bearer ${creatorIntegration.accessToken}`,
      "Client-Id": TWITCH_CLIENT_ID,
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (response.status === 401 || response.status === 403) {
    return {
      eligible: false,
      reason: "creator_subscription_token_rejected",
      needsCreatorScope: true,
      status: response.status,
    };
  }
  if (!response.ok) {
    throw new Error(payload?.message || payload?.status || "twitch_subscription_check_failed");
  }

  const subscription = Array.isArray(payload?.data) ? payload.data[0] : null;
  if (!subscription) {
    return { eligible: false, reason: "not_subscribed" };
  }

  const tier = String(subscription.tier || "1000");
  if (subscription.is_gift && program.allowGiftedSubscriptions === false) {
    return {
      eligible: false,
      reason: "gift_subscription_not_allowed",
      tier,
      isGift: true,
    };
  }
  if (twitchTierRank(tier) < twitchTierRank(program.minimumTier)) {
    return {
      eligible: false,
      reason: "tier_too_low",
      tier,
      minimumTier: program.minimumTier,
      isGift: Boolean(subscription.is_gift),
    };
  }

  return {
    eligible: true,
    reason: "subscribed",
    tier,
    isGift: Boolean(subscription.is_gift),
    broadcasterLogin: subscription.broadcaster_login || creatorIntegration.login,
    reward: program,
  };
}

function summarizeLiveNetwork() {
  let onlinePeers = 0;
  for (const peers of rooms.values()) {
    onlinePeers += peers.size;
  }

  const activeRooms = rooms.size;
  const avgPeersPerRoom = activeRooms > 0 ? Number((onlinePeers / activeRooms).toFixed(2)) : 0;
  const errorRate = runtimeStats.responsesTotal > 0
    ? (runtimeStats.serverErrorsTotal / runtimeStats.responsesTotal) * 100
    : 0;

  return {
    onlinePeers,
    activeRooms,
    avgPeersPerRoom,
    uptimeSec: Math.floor(process.uptime()),
    downtimePercent: Number(errorRate.toFixed(2)),
    freeTierPercent: 100,
    maxPeersPerRoom: POLICY.maxPeersPerRoom,
  };
}

function metricNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildPrometheusMetrics() {
  const lines = [];
  const netStats = summarizeLiveNetwork();
  const dbStats = getPublicDbStats();
  const dbStorage = getDbStorageStats();
  const memory = process.memoryUsage();
  const uptimeSec = process.uptime();

  lines.push("# HELP vercord_http_requests_total Total HTTP requests received.");
  lines.push("# TYPE vercord_http_requests_total counter");
  lines.push(`vercord_http_requests_total ${runtimeStats.requestsTotal}`);
  lines.push("# HELP vercord_http_responses_total Total HTTP responses sent.");
  lines.push("# TYPE vercord_http_responses_total counter");
  lines.push(`vercord_http_responses_total ${runtimeStats.responsesTotal}`);
  lines.push("# HELP vercord_http_server_errors_total Total HTTP 5xx responses.");
  lines.push("# TYPE vercord_http_server_errors_total counter");
  lines.push(`vercord_http_server_errors_total ${runtimeStats.serverErrorsTotal}`);
  lines.push("# HELP vercord_http_not_found_total Total HTTP 404 responses.");
  lines.push("# TYPE vercord_http_not_found_total counter");
  lines.push(`vercord_http_not_found_total ${runtimeStats.notFoundTotal}`);

  lines.push("# HELP vercord_http_responses_by_status_total Total HTTP responses grouped by status code.");
  lines.push("# TYPE vercord_http_responses_by_status_total counter");
  for (const [status, count] of [...responseCodeCounters.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    lines.push(`vercord_http_responses_by_status_total{code="${status}"} ${metricNumber(count)}`);
  }

  lines.push("# HELP vercord_rooms_active Active signaling rooms.");
  lines.push("# TYPE vercord_rooms_active gauge");
  lines.push(`vercord_rooms_active ${metricNumber(netStats.activeRooms)}`);
  lines.push("# HELP vercord_peers_online Online peers in active signaling rooms.");
  lines.push("# TYPE vercord_peers_online gauge");
  lines.push(`vercord_peers_online ${metricNumber(netStats.onlinePeers)}`);
  lines.push("# HELP vercord_signal_inbox_peers Number of peers with pending signaling inbox.");
  lines.push("# TYPE vercord_signal_inbox_peers gauge");
  lines.push(`vercord_signal_inbox_peers ${metricNumber(inbox.size)}`);
  lines.push("# HELP vercord_active_call_sessions Active claimed call sessions.");
  lines.push("# TYPE vercord_active_call_sessions gauge");
  lines.push(`vercord_active_call_sessions ${metricNumber(activeCallSessions.size)}`);

  lines.push("# HELP vercord_db_users_total Total users in backend storage.");
  lines.push("# TYPE vercord_db_users_total gauge");
  lines.push(`vercord_db_users_total ${metricNumber(dbStats.usersCount)}`);
  lines.push("# HELP vercord_db_servers_total Total servers in backend storage.");
  lines.push("# TYPE vercord_db_servers_total gauge");
  lines.push(`vercord_db_servers_total ${metricNumber(dbStats.serversCount)}`);
  lines.push("# HELP vercord_db_invites_total Total invites in backend storage.");
  lines.push("# TYPE vercord_db_invites_total gauge");
  lines.push(`vercord_db_invites_total ${metricNumber(dbStats.invitesCount)}`);
  lines.push("# HELP vercord_db_invites_active Total active invites in backend storage.");
  lines.push("# TYPE vercord_db_invites_active gauge");
  lines.push(`vercord_db_invites_active ${metricNumber(dbStats.activeInvitesCount)}`);
  lines.push("# HELP vercord_db_storage_bytes Backend storage snapshot size in bytes.");
  lines.push("# TYPE vercord_db_storage_bytes gauge");
  lines.push(`vercord_db_storage_bytes ${metricNumber(dbStorage.fileBytes)}`);
  lines.push("# HELP vercord_db_last_modified_unix_seconds Backend storage last update timestamp.");
  lines.push("# TYPE vercord_db_last_modified_unix_seconds gauge");
  lines.push(`vercord_db_last_modified_unix_seconds ${metricNumber(dbStorage.lastModifiedMs) / 1000}`);

  lines.push("# HELP process_uptime_seconds Node.js process uptime in seconds.");
  lines.push("# TYPE process_uptime_seconds gauge");
  lines.push(`process_uptime_seconds ${metricNumber(uptimeSec)}`);
  lines.push("# HELP process_resident_memory_bytes Resident set size in bytes.");
  lines.push("# TYPE process_resident_memory_bytes gauge");
  lines.push(`process_resident_memory_bytes ${metricNumber(memory.rss)}`);
  lines.push("# HELP process_heap_used_bytes V8 heap used in bytes.");
  lines.push("# TYPE process_heap_used_bytes gauge");
  lines.push(`process_heap_used_bytes ${metricNumber(memory.heapUsed)}`);
  lines.push("# HELP process_heap_total_bytes V8 heap total in bytes.");
  lines.push("# TYPE process_heap_total_bytes gauge");
  lines.push(`process_heap_total_bytes ${metricNumber(memory.heapTotal)}`);

  lines.push("");
  return lines.join("\n");
}

const server = createServer(async (req, res) => {
  let url = null;
  try {
    if (!req.url || !req.method) return json(res, 400, { error: "bad_request" });

    runtimeStats.requestsTotal += 1;
    url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    res.__requestMeta = {
      method: req.method,
      path: url.pathname,
      startedAt: now(),
      userId: null,
    };

    if (req.method === "OPTIONS") {
      return text(res, 204, "", "text/plain; charset=utf-8");
    }

    cleanup();

    if (req.method === "GET" && url.pathname === "/api/health") {
      return json(res, 200, { ok: true, at: new Date().toISOString() });
    }

    if (req.method === "GET" && url.pathname === "/api/metrics") {
      return text(res, 200, buildPrometheusMetrics(), "text/plain; version=0.0.4; charset=utf-8");
    }

    if (req.method === "GET" && url.pathname === "/api/policy") {
      return json(res, 200, { policy: POLICY });
    }

    if (req.method === "POST" && url.pathname === "/api/integrations/twitch/eventsub") {
      let rawBody = "";
      try {
        rawBody = await readRawBody(req);
      } catch (error) {
        return json(res, 413, { error: error instanceof Error ? error.message : "payload_too_large" });
      }

      const verification = verifyTwitchEventSubSignature(req, rawBody);
      if (!verification.ok) {
        writeLog("warn", "twitch_eventsub_signature_rejected", { reason: verification.reason });
        return json(res, 403, { error: verification.reason });
      }

      const messageType = String(req.headers["twitch-eventsub-message-type"] || "");
      const subscriptionType = String(req.headers["twitch-eventsub-subscription-type"] || "");
      let payload = {};
      try {
        payload = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return json(res, 400, { error: "invalid_json" });
      }

      const subscription = payload?.subscription && typeof payload.subscription === "object" ? payload.subscription : {};
      const broadcasterUserId = String(
        payload?.event?.broadcaster_user_id
        || subscription?.condition?.broadcaster_user_id
        || "",
      );

      const alreadyProcessed = hasTwitchEventSubMessage(verification.messageId);
      await recordTwitchEventSubMessage({
        id: verification.messageId,
        messageType,
        subscriptionType: subscriptionType || subscription?.type || "",
        subscriptionId: subscription?.id || "",
        broadcasterUserId,
        status: subscription?.status || "",
        duplicate: alreadyProcessed,
      });

      if (messageType === "webhook_callback_verification") {
        return sendTwitchChallenge(res, payload?.challenge || "");
      }

      if (alreadyProcessed) {
        return text(res, 204, "", "text/plain; charset=utf-8");
      }

      if (messageType === "notification") {
        try {
          const result = await handleTwitchEventSubNotification({
            messageId: verification.messageId,
            payload,
          });
          writeLog("info", "twitch_eventsub_notification_processed", {
            messageId: verification.messageId,
            subscriptionType: subscriptionType || subscription?.type || "",
            broadcasterUserId,
            reason: result?.reason || undefined,
            ignored: Boolean(result?.ignored),
          });
        } catch (error) {
          writeLog("error", "twitch_eventsub_notification_failed", {
            messageId: verification.messageId,
            subscriptionType: subscriptionType || subscription?.type || "",
            broadcasterUserId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
        return text(res, 204, "", "text/plain; charset=utf-8");
      }

      if (messageType === "revocation") {
        const creator = broadcasterUserId ? findTwitchCreatorProgram({ providerUserId: broadcasterUserId }) : null;
        if (creator) {
          const existing = creator.program?.eventSubSubscriptions || [];
          const nextRecord = eventSubSubscriptionRecord(subscription, {
            type: subscriptionType || subscription?.type || "",
            status: subscription?.status || "revoked",
            condition: subscription?.condition || {},
            error: subscription?.status || "revoked",
          });
          await updateTwitchCreatorProgram(creator.userId, {
            eventSubEnabled: false,
            eventSubSubscriptions: mergeEventSubSubscriptionRecords(existing, [nextRecord]),
            eventSubLastError: subscription?.status || "eventsub_revoked",
          });
        }
        return text(res, 204, "", "text/plain; charset=utf-8");
      }

      return text(res, 204, "", "text/plain; charset=utf-8");
    }

  if (req.method === "GET" && url.pathname === "/api/public/stats") {
    const netStats = summarizeLiveNetwork();
    const dbStats = getPublicDbStats();
    return json(res, 200, {
      stats: {
        ...netStats,
        usersCount: dbStats.usersCount,
        invitesCount: dbStats.invitesCount,
        activeInvitesCount: dbStats.activeInvitesCount,
      },
    });
  }

  if (req.method === "GET" && apiPath(url.pathname, "/users/@me/integrations/twitch")) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const integration = getTwitchIntegration(auth.sub);
    return json(res, 200, {
      configured: isTwitchConfigured(),
      connection: toPublicTwitchIntegration(integration),
    });
  }

  if (req.method === "GET" && apiPath(url.pathname, "/integrations/twitch/creator-programs")) {
    return json(res, 200, {
      programs: listPublicTwitchCreatorPrograms(),
    });
  }

  if (req.method === "POST" && apiPath(url.pathname, "/users/@me/integrations/twitch/oauth/start")) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!isTwitchConfigured()) {
      return json(res, 503, { error: "twitch_not_configured", configured: false });
    }

    let body = {};
    try {
      body = await readJson(req);
    } catch {
      body = {};
    }
    const intent = body?.intent === "creator" ? "creator" : "viewer";
    const scopes = getTwitchOAuthScopes(intent);
    const redirectUri = getTwitchRedirectUri(req);
    const state = createTwitchOAuthState(auth.sub, { intent, scopes });
    const params = new URLSearchParams({
      response_type: "code",
      client_id: TWITCH_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: scopes.join(" "),
      state,
      force_verify: "true",
    });

    return json(res, 200, {
      configured: true,
      url: `https://id.twitch.tv/oauth2/authorize?${params.toString()}`,
      state,
      intent,
      redirectUri,
      scopes,
    });
  }

  if (req.method === "GET" && url.pathname === "/api/integrations/twitch/oauth/callback") {
    cleanupTwitchOauthStates();
    const state = String(url.searchParams.get("state") || "");
    const code = String(url.searchParams.get("code") || "");
    const error = String(url.searchParams.get("error") || "");
    const stateRecord = twitchOauthStates.get(state);
    twitchOauthStates.delete(state);

    if (error) {
      return text(res, 400, twitchCallbackHtml({ ok: false, error }), "text/html; charset=utf-8");
    }
    if (!state || !stateRecord || !code) {
      return text(res, 400, twitchCallbackHtml({ ok: false, error: "invalid_oauth_state" }), "text/html; charset=utf-8");
    }
    if (!isTwitchConfigured()) {
      return text(res, 503, twitchCallbackHtml({ ok: false, error: "twitch_not_configured" }), "text/html; charset=utf-8");
    }

    try {
      const redirectUri = getTwitchRedirectUri(req);
      const tokenPayload = await exchangeTwitchCode({ code, redirectUri });
      const twitchUser = await fetchTwitchUser(tokenPayload.access_token);
      const expiresIn = Number(tokenPayload.expires_in || 0);
      const connectedAt = now();
      const previous = getTwitchIntegration(stateRecord.userId);
      const integration = await saveTwitchIntegration(stateRecord.userId, {
        providerUserId: twitchUser.id,
        login: twitchUser.login,
        displayName: twitchUser.display_name || twitchUser.login,
        profileImageUrl: twitchUser.profile_image_url || "",
        accessToken: tokenPayload.access_token,
        refreshToken: tokenPayload.refresh_token || "",
        scopes: Array.isArray(tokenPayload.scope) ? tokenPayload.scope : TWITCH_SCOPES,
        expiresAt: expiresIn > 0 ? connectedAt + expiresIn * 1000 : 0,
        connectedAt: previous?.connectedAt || connectedAt,
        updatedAt: connectedAt,
        settings: previous?.settings || undefined,
        creatorProgram: previous?.creatorProgram || undefined,
      });

      return text(
        res,
        200,
        twitchCallbackHtml({ ok: true, login: integration.login, displayName: integration.displayName }),
        "text/html; charset=utf-8",
      );
    } catch (callbackError) {
      writeLog("error", "twitch_oauth_callback_failed", {
        userId: stateRecord.userId,
        message: callbackError instanceof Error ? callbackError.message : String(callbackError),
      });
      return text(
        res,
        400,
        twitchCallbackHtml({
          ok: false,
          error: callbackError instanceof Error ? callbackError.message : "twitch_oauth_failed",
        }),
        "text/html; charset=utf-8",
      );
    }
  }

  if (req.method === "GET" && apiPath(url.pathname, "/users/@me/integrations/twitch/creator-program")) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const integration = getTwitchIntegration(auth.sub);
    return json(res, 200, {
      ok: true,
      creatorProgram: integration ? toPublicTwitchCreatorProgram(auth.sub, integration) : null,
      connection: toPublicTwitchIntegration(integration),
      needsCreatorScope: integration ? !hasTwitchScope(integration, "channel:read:subscriptions") : true,
    });
  }

  if (req.method === "PATCH" && apiPath(url.pathname, "/users/@me/integrations/twitch/creator-program")) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = await readJson(req);
      const integration = await updateTwitchCreatorProgram(auth.sub, body?.program || body || {});
      return json(res, 200, {
        ok: true,
        creatorProgram: toPublicTwitchCreatorProgram(auth.sub, integration),
        connection: toPublicTwitchIntegration(integration),
        needsCreatorScope: !hasTwitchScope(integration, "channel:read:subscriptions"),
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "bad_request";
      if (code === "twitch_not_connected") return json(res, 404, { error: code });
      return json(res, 400, { error: code });
    }
  }

  if (req.method === "POST" && apiPath(url.pathname, "/users/@me/integrations/twitch/eventsub/sync")) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const integration = getTwitchIntegration(auth.sub);
    if (!integration) return json(res, 404, { error: "twitch_not_connected" });
    if (!integration.creatorProgram?.enabled) return json(res, 409, { error: "creator_program_disabled" });
    if (!isTwitchEventSubConfigured()) {
      return json(res, 503, {
        error: "twitch_eventsub_not_configured",
        configured: false,
        needs: ["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET", "TWITCH_EVENTSUB_SECRET"],
      });
    }

    const callbackUrl = getTwitchEventSubCallbackUrl(req);
    if (!callbackUrl.startsWith("https://")) {
      return json(res, 422, {
        error: "twitch_eventsub_callback_must_be_https",
        callbackUrl,
      });
    }

    if (!hasTwitchScope(integration, "channel:read:subscriptions")) {
      return json(res, 409, {
        error: "creator_scope_required",
        missingScope: "channel:read:subscriptions",
      });
    }

    const records = [];
    const errors = [];
    for (const type of TWITCH_EVENTSUB_TYPES) {
      if (twitchEventSubTypeNeedsSubscriptionScope(type) && !hasTwitchScope(integration, "channel:read:subscriptions")) {
        errors.push({ type, error: "creator_scope_required" });
        continue;
      }

      try {
        const record = await createTwitchEventSubSubscription({
          type,
          broadcasterId: integration.providerUserId,
          callbackUrl,
        });
        records.push(record);
      } catch (error) {
        errors.push({ type, error: error instanceof Error ? error.message : "eventsub_subscription_failed" });
      }
    }

    const existing = integration.creatorProgram?.eventSubSubscriptions || [];
    const nextProgram = {
      eventSubEnabled: records.length > 0,
      eventSubSubscriptions: mergeEventSubSubscriptionRecords(existing, [
        ...records,
        ...errors.map((item) => eventSubSubscriptionRecord(null, {
          type: item.type,
          status: "error",
          condition: { broadcaster_user_id: integration.providerUserId },
          error: item.error,
        })),
      ]),
      eventSubLastSyncedAt: now(),
      eventSubLastError: errors.length > 0 ? errors.map((item) => `${item.type}: ${item.error}`).join("; ").slice(0, 240) : "",
    };

    const saved = await updateTwitchCreatorProgram(auth.sub, nextProgram);
    return json(res, errors.length > 0 && records.length === 0 ? 502 : 200, {
      ok: records.length > 0,
      configured: true,
      callbackUrl,
      records,
      errors,
      creatorProgram: toPublicTwitchCreatorProgram(auth.sub, saved),
      connection: toPublicTwitchIntegration(saved),
    });
  }

  if (req.method === "GET" && apiPath(url.pathname, "/users/@me/integrations/twitch/subscriber-perks/grants")) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    return json(res, 200, {
      grants: listTwitchSubscriberPerkGrants({ creatorUserId: auth.sub }),
      viewerGrants: listTwitchSubscriberPerkGrants({ viewerUserId: auth.sub, onlyActive: true }),
    });
  }

  if (req.method === "GET" && apiPath(url.pathname, "/users/@me/integrations/twitch/live-state")) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    return json(res, 200, {
      liveState: getTwitchCreatorLiveState(auth.sub),
    });
  }

  if (req.method === "POST" && apiPath(url.pathname, "/users/@me/integrations/twitch/subscriber-perks/check")) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = await readJson(req);
      const viewerIntegration = getTwitchIntegration(auth.sub);
      if (!viewerIntegration) {
        return json(res, 409, { eligible: false, reason: "viewer_twitch_not_connected" });
      }

      const creator = findTwitchCreatorProgram({
        login: body?.creatorLogin,
        providerUserId: body?.creatorTwitchUserId,
        userId: body?.creatorUserId,
      });
      if (!creator) {
        return json(res, 404, { eligible: false, reason: "creator_program_not_found" });
      }

      const result = await checkTwitchSubscriberPerk({
        creatorIntegration: creator.integration,
        viewerIntegration,
        program: creator.program,
      });
      let grantResult = null;
      if (result.eligible && creator.integration.providerUserId !== viewerIntegration.providerUserId) {
        grantResult = await applyTwitchSubscriberPerkGrant({
          creatorUserId: creator.userId,
          creatorIntegration: creator.integration,
          program: creator.program,
          event: {
            user_id: viewerIntegration.providerUserId,
            user_login: viewerIntegration.login,
            user_name: viewerIntegration.displayName,
            broadcaster_user_id: creator.integration.providerUserId,
            broadcaster_user_login: creator.integration.login,
            broadcaster_user_name: creator.integration.displayName,
            tier: result.tier || creator.program.minimumTier,
            is_gift: Boolean(result.isGift),
          },
          active: true,
          source: "manual_subscriber_check",
          messageId: "",
        });
      }

      return json(res, 200, {
        ...result,
        creator: toPublicTwitchCreatorProgram(creator.userId, creator.integration),
        grant: grantResult?.grant || null,
      });
    } catch (error) {
      writeLog("error", "twitch_subscriber_perk_check_failed", {
        userId: auth.sub,
        message: error instanceof Error ? error.message : String(error),
      });
      return json(res, 400, {
        eligible: false,
        reason: error instanceof Error ? error.message : "twitch_subscriber_check_failed",
      });
    }
  }

  if (req.method === "PATCH" && apiPath(url.pathname, "/users/@me/integrations/twitch/settings")) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = await readJson(req);
      const integration = await updateTwitchIntegrationSettings(auth.sub, body?.settings || body || {});
      return json(res, 200, { ok: true, connection: toPublicTwitchIntegration(integration) });
    } catch (error) {
      const code = error instanceof Error ? error.message : "bad_request";
      if (code === "twitch_not_connected") return json(res, 404, { error: code });
      return json(res, 400, { error: code });
    }
  }

  if (req.method === "POST" && apiPath(url.pathname, "/users/@me/integrations/twitch/disconnect")) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    await removeTwitchIntegration(auth.sub);
    return json(res, 200, { ok: true, connection: null, configured: isTwitchConfigured() });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    try {
      const body = await readJson(req);
      const betaCodeRaw =
        typeof body?.betaCode === "string"
          ? body.betaCode
          : typeof body?.beta_code === "string"
            ? body.beta_code
            : "";
      const betaCode = betaCodeRaw.trim().toUpperCase();

      if (REQUIRE_BETA_CODE_FOR_REGISTRATION) {
        if (!betaCode) return json(res, 422, { error: "beta_code_required" });
        if (!isInviteCode(betaCode)) return json(res, 422, { error: "invalid_beta_code" });

        const invite = getInviteByCode(betaCode);
        const status = invite ? toPublicInvite(invite).status : "missing";
        if (status !== "active") return json(res, 422, { error: "invalid_beta_code" });
      }

      const user = await createUser(body?.name, body?.password);
      const token = createAuthToken(user);
      return json(res, 201, { user, token });
    } catch (error) {
      const code = error instanceof Error ? error.message : "bad_request";
      if (code === "user_exists") return json(res, 409, { error: code });
      if (code === "invalid_nick" || code === "invalid_password") return json(res, 422, { error: code });
      return json(res, 400, { error: code });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    try {
      const body = await readJson(req);
      const user = await loginUser(body?.name, body?.password);
      const token = createAuthToken(user);
      return json(res, 200, { user, token });
    } catch (error) {
      const code = error instanceof Error ? error.message : "bad_request";
      if (code === "user_not_found") return json(res, 404, { error: code });
      if (code === "invalid_credentials") return json(res, 401, { error: code });
      if (code === "invalid_nick" || code === "invalid_password") return json(res, 422, { error: code });
      return json(res, 400, { error: code });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/auth/change-password") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = await readJson(req);
      const user = await changeUserPassword(auth.name, body?.oldPassword, body?.newPassword);
      if (user.id !== auth.sub) return json(res, 403, { error: "forbidden" });
      const token = createAuthToken(user);
      return json(res, 200, { user, token, ok: true });
    } catch (error) {
      const code = error instanceof Error ? error.message : "bad_request";
      if (code === "user_not_found") return json(res, 404, { error: code });
      if (code === "invalid_credentials") return json(res, 401, { error: code });
      if (code === "invalid_nick" || code === "invalid_password") return json(res, 422, { error: code });
      return json(res, 400, { error: code });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = findPublicUserById(auth.sub);
    if (!user) return json(res, 404, { error: "user_not_found" });
    return json(res, 200, { user });
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const userId = String(url.searchParams.get("userId") || "").trim();
    if (userId && userId !== auth.sub) return json(res, 403, { error: "forbidden" });
    try {
      const state = getUserAppState(auth.sub);
      return json(res, 200, { state });
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "bad_request" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/state/save") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = await readJson(req);
      const userId = String(body?.userId || "").trim();
      if (userId && userId !== auth.sub) return json(res, 403, { error: "forbidden" });
      const state = await saveUserAppState(auth.sub, body?.state || {});
      return json(res, 200, { ok: true, state });
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "bad_request" });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/shared-state") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const state = getSharedAppState(auth.sub);
      return json(res, 200, { state });
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "bad_request" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/shared-state/save") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = await readJson(req);
      const state = await saveSharedAppState(auth.sub, body?.state || {});
      return json(res, 200, { ok: true, state });
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "bad_request" });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/call-session") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const session = activeCallSessions.get(auth.sub) || null;
    return json(res, 200, { session });
  }

  if (req.method === "POST" && url.pathname === "/api/call-session/claim") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = await readJson(req);
      const sessionId = String(body?.sessionId || "").trim();
      const roomId = String(body?.roomId || "").trim();
      if (!isId(sessionId, 96)) return json(res, 400, { error: "invalid_session_id" });
      if (!isId(roomId, 96)) return json(res, 400, { error: "invalid_room_id" });

      const previous = activeCallSessions.get(auth.sub) || null;
      const replaced = Boolean(previous && previous.sessionId !== sessionId);
      const next = { sessionId, roomId, updatedAt: now() };
      activeCallSessions.set(auth.sub, next);
      return json(res, 200, { ok: true, replaced, session: next });
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "bad_request" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/call-session/heartbeat") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = await readJson(req);
      const sessionId = String(body?.sessionId || "").trim();
      if (!isId(sessionId, 96)) return json(res, 400, { error: "invalid_session_id" });
      const current = activeCallSessions.get(auth.sub);
      if (!current) return json(res, 404, { error: "session_not_found" });
      if (current.sessionId !== sessionId) {
        return json(res, 409, { error: "session_replaced", session: current });
      }
      current.updatedAt = now();
      activeCallSessions.set(auth.sub, current);
      return json(res, 200, { ok: true, session: current });
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "bad_request" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/call-session/release") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = await readJson(req);
      const sessionId = String(body?.sessionId || "").trim();
      if (!isId(sessionId, 96)) return json(res, 400, { error: "invalid_session_id" });
      const current = activeCallSessions.get(auth.sub);
      if (current?.sessionId === sessionId) {
        activeCallSessions.delete(auth.sub);
      }
      return json(res, 200, { ok: true });
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "bad_request" });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/users/find") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const name = String(url.searchParams.get("name") || "").trim();
    if (!name) return json(res, 400, { error: "invalid_name" });
    const user = findPublicUserByNick(name);
    if (!user) return json(res, 404, { error: "user_not_found" });
    return json(res, 200, { user });
  }

  if (req.method === "GET" && url.pathname === "/api/users/search") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const query = String(url.searchParams.get("q") || "").trim();
    if (query.length < 2) return json(res, 200, { users: [] });
    const limit = Number(url.searchParams.get("limit") || 10);
    const users = searchPublicUsers(query, { excludeUserId: auth.sub, limit });
    return json(res, 200, { users });
  }

  if (req.method === "GET" && url.pathname === "/api/friends/requests") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const requests = listFriendRequestsForUser(auth.sub);
    return json(res, 200, requests);
  }

  if (req.method === "POST" && url.pathname === "/api/friends/requests") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = await readJson(req);
      const toUserId = String(body?.toUserId || "").trim();
      if (!isId(toUserId, 96)) return json(res, 400, { error: "invalid_user_id" });
      const request = await sendFriendRequest(auth.sub, toUserId);
      return json(res, 201, { request });
    } catch (error) {
      const code = error instanceof Error ? error.message : "bad_request";
      if (code === "user_not_found") return json(res, 404, { error: code });
      if (code === "already_friends") return json(res, 409, { error: code });
      return json(res, 400, { error: code });
    }
  }

  const friendRequestRespondMatch = url.pathname.match(/^\/api\/friends\/requests\/([^/]+)\/respond$/);
  if (req.method === "POST" && friendRequestRespondMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const requestId = friendRequestRespondMatch[1];
      const body = await readJson(req);
      const action = String(body?.action || "").trim().toLowerCase();
      const request = await respondFriendRequest(auth.sub, requestId, action);
      return json(res, 200, { request });
    } catch (error) {
      const code = error instanceof Error ? error.message : "bad_request";
      if (code === "friend_request_not_found") return json(res, 404, { error: code });
      if (code === "forbidden") return json(res, 403, { error: code });
      if (code === "friend_request_closed") return json(res, 409, { error: code });
      return json(res, 400, { error: code });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/servers") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = await readJson(req);
      const serverRecord = await createServerRecord(auth.sub, body || {});
      return json(res, 201, { ok: true, server: serverRecord });
    } catch (error) {
      const code = error instanceof Error ? error.message : "bad_request";
      if (code === "server_exists") return json(res, 409, { error: code });
      return json(res, 400, { error: code });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/servers/discover") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const query = String(url.searchParams.get("q") || "").trim();
    const limit = Number(url.searchParams.get("limit") || 20);
    const servers = searchDiscoverableServers(auth.sub, query, { limit });
    return json(res, 200, { servers });
  }

  const updateServerMatch = url.pathname.match(/^\/api\/servers\/([^/]+)$/);
  if (req.method === "PATCH" && updateServerMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const serverId = updateServerMatch[1];
    if (!isId(serverId)) return json(res, 400, { error: "invalid_server_id" });
    try {
      const body = await readJson(req);
      const serverRecord = await updateServerRecord(auth.sub, serverId, body || {});
      return json(res, 200, { ok: true, server: serverRecord });
    } catch (error) {
      const code = error instanceof Error ? error.message : "bad_request";
      if (code === "server_not_found") return json(res, 404, { error: code });
      if (code === "forbidden") return json(res, 403, { error: code });
      return json(res, 400, { error: code });
    }
  }

  const joinServerMatch = url.pathname.match(/^\/api\/servers\/([^/]+)\/join$/);
  if (req.method === "POST" && joinServerMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const serverId = joinServerMatch[1];
    if (!isId(serverId)) return json(res, 400, { error: "invalid_server_id" });
    try {
      const serverRecord = await joinPublicServer(auth.sub, serverId);
      return json(res, 200, { ok: true, server: serverRecord });
    } catch (error) {
      const code = error instanceof Error ? error.message : "bad_request";
      if (code === "server_not_found") return json(res, 404, { error: code });
      if (code === "server_private") return json(res, 403, { error: code });
      return json(res, 400, { error: code });
    }
  }

  const leaveServerMatch = url.pathname.match(/^\/api\/servers\/([^/]+)\/leave$/);
  if (req.method === "POST" && leaveServerMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const serverId = leaveServerMatch[1];
    if (!isId(serverId)) return json(res, 400, { error: "invalid_server_id" });
    try {
      await leaveServer(auth.sub, serverId);
      return json(res, 200, { ok: true });
    } catch (error) {
      const code = error instanceof Error ? error.message : "bad_request";
      if (code === "server_not_found") return json(res, 404, { error: code });
      if (code === "not_member") return json(res, 409, { error: code });
      if (code === "owner_cannot_leave") return json(res, 409, { error: code });
      return json(res, 400, { error: code });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/invites") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = await readJson(req);
      const serverId = typeof body.serverId === "string" ? body.serverId : "";
      if (!isId(serverId)) return json(res, 400, { error: "invalid_server_id" });
      const serverName = typeof body.serverName === "string" ? body.serverName.trim().slice(0, 80) : "Server";
      const createdBy = auth.sub;
      const maxUsesRaw = Number(body.maxUses || 0);
      const maxUses = Number.isFinite(maxUsesRaw) && maxUsesRaw > 0
        ? Math.min(POLICY.maxInviteUses, Math.max(1, Math.floor(maxUsesRaw)))
        : null;
      const expiresInHoursRaw = Number(body.expiresInHours || 0);
      const expiresInHours = Number.isFinite(expiresInHoursRaw) && expiresInHoursRaw > 0
        ? Math.min(POLICY.maxInviteTtlHours, Math.max(1, Math.floor(expiresInHoursRaw)))
        : null;
      const expiresAt = expiresInHours ? now() + expiresInHours * 3600_000 : null;
      const invite = await createInviteRecord({ serverId, serverName, createdBy, expiresAt, maxUses });
      return json(res, 201, { invite: toPublicInvite(invite) });
    } catch (error) {
      const code = error instanceof Error ? error.message : "bad_request";
      if (code === "server_not_found") return json(res, 404, { error: code });
      if (code === "forbidden") return json(res, 403, { error: code });
      return json(res, 400, { error: code });
    }
  }

  const listInvitesMatch = url.pathname.match(/^\/api\/servers\/([^/]+)\/invites$/);
  if (req.method === "GET" && listInvitesMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const serverId = listInvitesMatch[1];
    if (!isId(serverId)) return json(res, 400, { error: "invalid_server_id" });
    const items = listInvitesByServer(serverId, auth.sub).map(toPublicInvite);
    return json(res, 200, { invites: items });
  }

  const getInviteMatch = url.pathname.match(/^\/api\/invites\/([A-Z0-9]{6,16})$/);
  if (req.method === "GET" && getInviteMatch) {
    const code = getInviteMatch[1];
    const invite = getInviteByCode(code);
    if (!invite) return json(res, 404, { error: "invite_not_found" });
    return json(res, 200, { invite: toPublicInvite(invite) });
  }

  const joinInviteMatch = url.pathname.match(/^\/api\/invites\/([A-Z0-9]{6,16})\/join$/);
  if (req.method === "POST" && joinInviteMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const code = joinInviteMatch[1];
    if (!isInviteCode(code)) return json(res, 400, { error: "invalid_invite_code" });
    try {
      const invite = await joinInviteByCode(code, auth.sub);
      return json(res, 200, { ok: true, invite: toPublicInvite(invite), serverId: invite.serverId, serverName: invite.serverName });
    } catch (error) {
      const codeErr = error instanceof Error ? error.message : "bad_request";
      if (codeErr === "invite_not_found") return json(res, 404, { error: codeErr });
      if (codeErr === "server_not_found") return json(res, 404, { error: codeErr });
      if (codeErr === "invite_not_usable") {
        const current = getInviteByCode(code);
        return json(res, 409, { error: codeErr, invite: current ? toPublicInvite(current) : null });
      }
      return json(res, 400, { error: codeErr });
    }
  }

  const revokeInviteMatch = url.pathname.match(/^\/api\/invites\/([A-Z0-9]{6,16})\/revoke$/);
  if (req.method === "POST" && revokeInviteMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const code = revokeInviteMatch[1];
    if (!isInviteCode(code)) return json(res, 400, { error: "invalid_invite_code" });
    try {
      const invite = await revokeInviteByCode(code, auth.sub);
      return json(res, 200, { ok: true, invite: toPublicInvite(invite) });
    } catch (error) {
      const codeErr = error instanceof Error ? error.message : "bad_request";
      if (codeErr === "invite_not_found") return json(res, 404, { error: codeErr });
      if (codeErr === "forbidden") return json(res, 403, { error: codeErr });
      return json(res, 400, { error: codeErr });
    }
  }

  const joinMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/join$/);
  if (req.method === "POST" && joinMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const roomId = joinMatch[1];
    if (!isId(roomId)) return json(res, 400, { error: "invalid_room_id" });
    try {
      const body = await readJson(req);
      if (!isId(body.peerId)) return json(res, 400, { error: "invalid_peer_id" });
      if (!isPeerOwnedByAuth(auth, body.peerId)) return json(res, 403, { error: "forbidden_peer_id" });
      const peerName = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
      const peers = rooms.get(roomId);
      const alreadyInRoom = Boolean(peers?.has(body.peerId));
      const existingPeer = peers?.get(body.peerId) || null;
      if (existingPeer?.ownerId && existingPeer.ownerId !== auth.sub) return json(res, 403, { error: "forbidden" });
      if (!alreadyInRoom && peers && peers.size >= POLICY.maxPeersPerRoom) return json(res, 409, { error: "room_full" });
      touchPeer(roomId, body.peerId, peerName, auth.sub);
      return json(res, 200, { roomId, peerId: body.peerId, peers: getPeers(roomId, body.peerId) });
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "bad_request" });
    }
  }

  const leaveMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/leave$/);
  if (req.method === "POST" && leaveMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const roomId = leaveMatch[1];
    if (!isId(roomId)) return json(res, 400, { error: "invalid_room_id" });
    try {
      const body = await readJson(req);
      if (!isId(body.peerId)) return json(res, 400, { error: "invalid_peer_id" });
      if (!isPeerOwnedByAuth(auth, body.peerId)) return json(res, 403, { error: "forbidden" });
      rooms.get(roomId)?.delete(body.peerId);
      if ((rooms.get(roomId)?.size || 0) === 0) rooms.delete(roomId);
      inbox.delete(body.peerId);
      return json(res, 200, { ok: true });
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "bad_request" });
    }
  }

  const signalMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/signal$/);
  if (req.method === "POST" && signalMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const roomId = signalMatch[1];
    if (!isId(roomId)) return json(res, 400, { error: "invalid_room_id" });
    try {
      const body = await readJson(req);
      const { from, to, type, payload } = body;
      if (!isId(from) || !isId(to)) return json(res, 400, { error: "invalid_peer_id" });
      if (!isPeerOwnedByAuth(auth, from)) return json(res, 403, { error: "forbidden" });
      if (!POLICY.allowedSignalTypes.includes(type)) return json(res, 400, { error: "invalid_signal_type" });
      const payloadBytes = Buffer.byteLength(JSON.stringify(payload ?? null), "utf8");
      if (payloadBytes > POLICY.maxSignalPayloadBytes) return json(res, 413, { error: "signal_payload_too_large" });
      const fromPeer = getPeer(roomId, from);
      const toPeer = getPeer(roomId, to);
      if (!fromPeer || !toPeer) return json(res, 404, { error: "peer_not_in_room" });
      if (fromPeer.ownerId !== auth.sub) return json(res, 403, { error: "forbidden" });
      if (hitRateLimit(getRateKey(req, from))) return json(res, 429, { error: "rate_limited" });
      touchPeer(roomId, from);
      queueSignal(to, { roomId, from, type, payload });
      return json(res, 202, { accepted: true });
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "bad_request" });
    }
  }

  const pollMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/poll$/);
  if (req.method === "GET" && pollMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const roomId = pollMatch[1];
    const peerId = url.searchParams.get("peerId") || "";
    if (!isId(roomId)) return json(res, 400, { error: "invalid_room_id" });
    if (!isId(peerId)) return json(res, 400, { error: "invalid_peer_id" });
    const peer = getPeer(roomId, peerId);
    if (!peer) return json(res, 404, { error: "peer_not_in_room" });
    if (peer.ownerId !== auth.sub) return json(res, 403, { error: "forbidden" });
    touchPeer(roomId, peerId);
    return json(res, 200, { signals: drainSignals(peerId), peers: getPeers(roomId, peerId) });
  }

    return json(res, 404, { error: "not_found" });
  } catch (error) {
    writeLog("error", "request_unhandled_error", {
      method: req.method || "UNKNOWN",
      path: url?.pathname || req.url || "unknown",
      message: error instanceof Error ? error.message : String(error),
    });
    return json(res, 500, { error: "internal_server_error" });
  }
});

server.on("error", (error) => {
  writeLog("error", "server_error", {
    message: error instanceof Error ? error.message : String(error),
  });
});

process.on("unhandledRejection", (reason) => {
  writeLog("error", "unhandled_rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

process.on("uncaughtException", (error) => {
  writeLog("error", "uncaught_exception", {
    message: error instanceof Error ? error.message : String(error),
  });
});

process.on("exit", () => {
  if (logStream) {
    try {
      logStream.end();
    } catch {
      // noop
    }
  }
});

server.listen(PORT, () => {
  writeLog("info", "server_started", {
    port: PORT,
    frontendOrigin: FRONTEND_ORIGIN,
    logFilePath: LOG_TO_FILE ? LOG_FILE_PATH : null,
  });
});
