import React, { useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import LandingPage from './components/LandingPage';
import AuthPage from './components/AuthPage';
import DonatePage from './components/DonatePage';
import AboutPage from './components/AboutPage';
import SettingsModal from './components/SettingsModal';
import Preloader from './components/Preloader';
import CreateServerModal from './components/CreateServerModal';
import ChannelEditorModal from './components/ChannelEditorModal';
import ServerAdminModal from './components/ServerAdminModal';
import ChatChannel from './components/ChatChannel';
import CallInterface from './components/CallInterface';
import MiniCallWidget from './components/MiniCallWidget';
import MobileNav from './components/MobileNav';
import FriendSearchModal from './components/FriendSearchModal';
import { CallStatus, User, AppView, Language, Server, DM, UserCredentials, Message, Channel, ChannelType, InviteLink, UserSettings, TodoItem, DiscoverServer } from './types';
import { LayoutGrid, Zap, Phone, Hash } from './components/Icon';
import { decodeMojibakeRu, translations } from './translations';

const INITIAL_SERVERS: Server[] = [];

const INITIAL_MESSAGES: Record<string, Message[]> = {};

const STORAGE_KEYS = {
  authToken: 'astral_auth_token_v1',
  deviceSessionId: 'astral_device_session_v1',
  localAuthUser: 'astral_local_auth_user_v1',
} as const;

const LOCAL_AUTH_TOKEN_PREFIX = 'local-dev-token:';
const ENABLE_LOCAL_UI_LOGIN = import.meta.env.DEV || String(import.meta.env.VITE_LOCAL_UI_LOGIN || '').toLowerCase() === 'true';

const INITIAL_DMS: DM[] = [];

const POLL_MS = 900;
const TURN_URL = String(import.meta.env.VITE_TURN_URL || '').trim();
const TURN_TLS_URL = String(import.meta.env.VITE_TURN_TLS_URL || '').trim();
const TURN_USERNAME = String(import.meta.env.VITE_TURN_USERNAME || '').trim();
const TURN_CREDENTIAL = String(import.meta.env.VITE_TURN_CREDENTIAL || '').trim();
const STUN_URLS = String(import.meta.env.VITE_STUN_URLS || '').trim();

const buildIceServers = (): RTCIceServer[] => {
  const servers: RTCIceServer[] = [];
  if (STUN_URLS) {
    STUN_URLS.split(',').map((item) => item.trim()).filter(Boolean).forEach((url) => {
      servers.push({ urls: url });
    });
  } else {
    servers.push({ urls: 'stun:stun.l.google.com:19302' });
    servers.push({ urls: 'stun:stun1.l.google.com:19302' });
  }

  if (TURN_URL && TURN_USERNAME && TURN_CREDENTIAL) {
    servers.push({
      urls: TURN_URL,
      username: TURN_USERNAME,
      credential: TURN_CREDENTIAL,
    });
  }
  if (TURN_TLS_URL && TURN_USERNAME && TURN_CREDENTIAL) {
    servers.push({
      urls: TURN_TLS_URL,
      username: TURN_USERNAME,
      credential: TURN_CREDENTIAL,
    });
  }
  return servers;
};

const RTC_CONFIG: RTCConfiguration = {
  iceServers: buildIceServers(),
};

const DEFAULT_USER_SETTINGS: UserSettings = {
  inputDeviceId: '',
  outputDeviceId: '',
  videoDeviceId: '',
  theme: 'dark',
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  startMuted: false,
  startVideoOff: false,
  privacyMode: false,
  hideOnlineStatus: false,
};

type SignalType = 'offer' | 'answer' | 'ice' | 'bye';

interface SignalingPeer {
  peerId: string;
  name?: string;
}

interface JoinResponse {
  roomId: string;
  peerId: string;
  peers: SignalingPeer[];
}

interface PollSignal {
  roomId: string;
  from: string;
  type: SignalType;
  payload?: unknown;
}

interface PollResponse {
  peers: SignalingPeer[];
  signals: PollSignal[];
}

interface PersistedAppState {
  dms: DM[];
  dmMessages: Record<string, Message[]>;
  settings: UserSettings | null;
  todos?: TodoItem[];
  language?: Language | null;
  lastView?: 'landing' | 'app' | null;
}

interface SharedAppState {
  servers: Server[];
  messages: Record<string, Message[]>;
}

interface FriendSearchUser {
  id: string;
  name: string;
}

interface FriendRequestView {
  id: string;
  user: FriendSearchUser;
}

interface RemotePeerState {
  name: string;
  stream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
}

const cleanId = (value: string, max = 64) => {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, max);
  return safe || 'peer';
};

const sanitizeLocalNickname = (value: string) => {
  const decoded = decodeMojibakeRu((value || '').trim());
  return decoded ? decoded.slice(0, 32) : 'Local User';
};

const localUserIdFromName = (name: string) => {
  const base = cleanId(name.toLowerCase().replace(/\s+/g, '_'), 24);
  return base ? `local_${base}` : `local_${Math.random().toString(36).slice(2, 8)}`;
};

const createLocalAuthToken = (userId: string) => `${LOCAL_AUTH_TOKEN_PREFIX}${cleanId(userId, 48)}_${Date.now()}`;

const isLocalAuthToken = (token: string | null): token is string => (
  typeof token === 'string' && token.startsWith(LOCAL_AUTH_TOKEN_PREFIX)
);

const buildPeerId = (userId: string) => `${cleanId(userId, 48)}_${Math.random().toString(36).slice(2, 8)}`;
const roomFromChannel = (channelId: string) => `voice-${cleanId(channelId, 48)}`;
const makeId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const defaultTextChannelId = (serverId: string) => `${cleanId(serverId, 48)}_text_general`;
const defaultVoiceChannelId = (serverId: string) => `${cleanId(serverId, 48)}_voice_lobby`;
const buildCallNickname = (user: UserCredentials | null, settings: UserSettings) => {
  if (!user) return 'Guest';
  if (!settings.privacyMode) return user.name;
  const tail = cleanId(user.id || 'anon', 12).slice(-4) || 'anon';
  return `Ghost-${tail}`;
};

const isStrongPassword = (password: string) => {
  if (password.length < 8 || password.length > 128) return false;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  return hasLetter && hasNumber;
};

const parseJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

function readStoredAuthToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.authToken);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' && parsed.trim() ? parsed : null;
  } catch {
    return null;
  }
}

function readStoredLocalUser(): UserCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.localAuthUser);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const id = typeof parsed.id === 'string' ? parsed.id.trim() : '';
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
    if (!id || !name) return null;
    return { id, name };
  } catch {
    return null;
  }
}

function writeStoredLocalUser(user: UserCredentials | null) {
  try {
    if (!user) {
      localStorage.removeItem(STORAGE_KEYS.localAuthUser);
      return;
    }
    localStorage.setItem(STORAGE_KEYS.localAuthUser, JSON.stringify({ id: user.id, name: user.name }));
  } catch {}
}

async function apiGet<T>(url: string): Promise<T> {
  const token = readStoredAuthToken();
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const body = await parseJson(response);
  if (!response.ok) {
    const reason = typeof body?.error === 'string' ? body.error : `http_${response.status}`;
    throw new Error(reason);
  }
  return body as T;
}

async function apiPost<T>(url: string, payload: unknown): Promise<T> {
  const token = readStoredAuthToken();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const body = await parseJson(response);
  if (!response.ok) {
    const reason = typeof body?.error === 'string' ? body.error : `http_${response.status}`;
    throw new Error(reason);
  }
  return body as T;
}

const VALID_SERVER_ID_RE = /^s_\d+_[a-z0-9]{4,10}$/i;
const VALID_CHANNEL_ID_RE = /^[a-z0-9_-]{3,96}$/i;

const normalizeServers = (servers: Server[]): Server[] => (
  (servers || [])
    .filter((server) => {
      if (!server || typeof server !== 'object') return false;
      if (typeof server.id !== 'string' || !VALID_SERVER_ID_RE.test(server.id)) return false;
      if (!Array.isArray(server.channels) || server.channels.length === 0) return false;
      return true;
    })
    .map((server) => ({
      ...server,
      name: decodeMojibakeRu(server.name || ''),
      description: server.description ? decodeMojibakeRu(server.description) : server.description,
      channels: server.channels
        .filter((channel) => (
          channel &&
          typeof channel.id === 'string' &&
          VALID_CHANNEL_ID_RE.test(channel.id) &&
          (channel.type === 'text' || channel.type === 'voice')
        ))
        .map((channel) => ({
          ...channel,
          name: decodeMojibakeRu(channel.name || ''),
          description: channel.description ? decodeMojibakeRu(channel.description) : channel.description,
        })),
    }))
    .filter((server) => server.channels.length > 0)
);

const normalizeDms = (dms: DM[]): DM[] => (
  dms.map((dm) => ({
    ...dm,
    userName: decodeMojibakeRu(dm.userName || ''),
    lastMessage: dm.lastMessage ? decodeMojibakeRu(dm.lastMessage) : dm.lastMessage,
  }))
);

const mergeMessageMaps = (
  current: Record<string, Message[]>,
  incoming: Record<string, Message[]>
) => {
  const next: Record<string, Message[]> = { ...current };
  for (const [channelId, incomingList] of Object.entries(incoming || {})) {
    const currentList = Array.isArray(next[channelId]) ? next[channelId] : [];
    const map = new Map<string, Message>();
    for (const message of currentList) map.set(message.id, message);
    for (const message of Array.isArray(incomingList) ? incomingList : []) map.set(message.id, message);
    next[channelId] = [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
  }
  return next;
};

const getOrCreateDeviceSessionId = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.deviceSessionId);
    const parsed = raw ? JSON.parse(raw) : '';
    if (typeof parsed === 'string' && parsed.trim()) return parsed;
    const nextId = `dev_${Math.random().toString(36).slice(2, 12)}_${Date.now()}`;
    localStorage.setItem(STORAGE_KEYS.deviceSessionId, JSON.stringify(nextId));
    return nextId;
  } catch {
    return `dev_${Math.random().toString(36).slice(2, 12)}_${Date.now()}`;
  }
};

const pickDmMessageMap = (
  allMessages: Record<string, Message[]>,
  dms: DM[]
) => {
  const dmIds = new Set((dms || []).map((item) => item.id));
  const snapshot: Record<string, Message[]> = {};
  for (const [channelId, list] of Object.entries(allMessages || {})) {
    if (!dmIds.has(channelId)) continue;
    snapshot[channelId] = Array.isArray(list) ? list : [];
  }
  return snapshot;
};

const parseViewFromUrl = (): AppView | null => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get('view') || '').trim().toLowerCase();
  if (raw === 'about' || raw === 'whitepaper' || window.location.pathname === '/whitepaper') {
    return 'about';
  }
  if (raw === 'donate') return 'donate';
  if (raw === 'auth') return 'auth';
  if (raw === 'app') return 'app';
  if (raw === 'landing') return 'landing';
  return null;
};

const updateViewInUrl = (view: AppView) => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (view === 'about') {
    url.searchParams.set('view', 'about');
  } else if (view === 'donate') {
    url.searchParams.set('view', 'donate');
  } else {
    url.searchParams.delete('view');
  }
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
};

const App: React.FC = () => {
  const authTokenAtBoot = readStoredAuthToken();
  const hasAuthTokenAtBoot = Boolean(authTokenAtBoot);
  const hasLocalAuthTokenAtBoot = isLocalAuthToken(authTokenAtBoot);
  const [loading, setLoading] = useState(true);
  const [isLocalSession, setIsLocalSession] = useState(hasLocalAuthTokenAtBoot);
  const [isAuthBootstrapping, setIsAuthBootstrapping] = useState(hasAuthTokenAtBoot && !hasLocalAuthTokenAtBoot);
  const [currentView, setCurrentView] = useState<AppView>(hasAuthTokenAtBoot ? 'app' : 'landing');
  const [displayView, setDisplayView] = useState<AppView>(hasAuthTokenAtBoot ? 'app' : 'landing');
  const [isTransitioning, setIsTransitioning] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCreateServerOpen, setIsCreateServerOpen] = useState(false);
  const [isFriendSearchOpen, setIsFriendSearchOpen] = useState(false);
  const [isChannelEditorOpen, setIsChannelEditorOpen] = useState(false);
  const [isServerAdminOpen, setIsServerAdminOpen] = useState(false);
  const [channelEditorMode, setChannelEditorMode] = useState<'create' | 'edit'>('create');
  const [channelEditorType, setChannelEditorType] = useState<ChannelType>('text');
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'servers' | 'dms' | 'profile'>('servers');
  const [isMobileSidebarVisible, setIsMobileSidebarVisible] = useState(true);

  const [language, setLanguage] = useState<Language>(() => {
    const browserLang = (typeof navigator !== 'undefined' ? navigator.language : '').toLowerCase();
    return browserLang.startsWith('ru') ? 'ru' : 'en';
  });
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [currentUser, setCurrentUser] = useState<UserCredentials | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [servers, setServers] = useState<Server[]>(INITIAL_SERVERS);
  const [discoverServers, setDiscoverServers] = useState<DiscoverServer[]>([]);
  const [invites, setInvites] = useState<Record<string, InviteLink>>({});
  const [dms, setDms] = useState<DM[]>(INITIAL_DMS);
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<FriendRequestView[]>([]);
  const [outgoingFriendRequests, setOutgoingFriendRequests] = useState<FriendRequestView[]>([]);

  const [activeServerId, setActiveServerId] = useState('home');
  const [activeChannelId, setActiveChannelId] = useState('home');
  const [activeChannelType, setActiveChannelType] = useState<'text' | 'voice'>('text');

  const [messages, setMessages] = useState<Record<string, Message[]>>(INITIAL_MESSAGES);
  const [lastSentAtByChannel, setLastSentAtByChannel] = useState<Record<string, number>>({});

  const [status, setStatus] = useState<CallStatus>(CallStatus.IDLE);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<Record<string, RemotePeerState>>({});
  const [callChannelId, setCallChannelId] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(() => userSettings.startMuted);
  const [isVideoOff, setIsVideoOff] = useState(() => userSettings.startVideoOff);
  const [isCallMinimized, setIsCallMinimized] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isStateHydrated, setIsStateHydrated] = useState(false);
  const [inviteNotification, setInviteNotification] = useState<{ ok: boolean; message: string } | null>(null);

  const t = translations[language];
  const isRu = language === 'ru';
  const ui = {
    system: isRu ? 'Система' : 'System',
    defaultServer: isRu ? 'Сервер' : 'Server',
    defaultGeneral: isRu ? 'общий' : 'general',
    defaultLobby: isRu ? 'лобби' : 'lobby',
    inviteCodeEmpty: isRu ? 'Код приглашения пуст.' : 'Invite code is empty.',
    inviteJoined: isRu ? 'Вы вошли на сервер' : 'Joined server',
    inviteByCode: isRu ? 'по приглашению' : 'by invite',
    inviteNotFound: isRu ? 'Приглашение не найдено.' : 'Invite not found.',
    inviteRevoked: isRu ? 'Приглашение отозвано.' : 'Invite revoked.',
    inviteExpired: isRu ? 'Срок приглашения истек.' : 'Invite expired.',
    inviteLimit: isRu ? 'Лимит использований приглашения исчерпан.' : 'Invite usage limit reached.',
    inviteUnavailable: isRu ? 'Приглашение больше недоступно.' : 'Invite is no longer available.',
    authRequired: isRu ? 'Войдите в аккаунт, чтобы продолжить.' : 'Please sign in to continue.',
    inviteJoinFailed: isRu ? 'Не удалось применить приглашение.' : 'Failed to apply invite.',
    statusLive: isRu ? 'Эфир' : 'Live Feed',
    statusMesh: isRu ? 'Сетка' : 'Mesh Link',
    statusIdle: isRu ? 'Ожидание' : 'Neural Idle',
    directMessage: isRu ? 'Личные сообщения' : 'Direct Message',
    channel: isRu ? 'Канал' : 'Channel',
    you: isRu ? 'Вы' : 'You',
    peer: isRu ? 'Пир' : 'Peer',
  };
  const callDisplayName = useMemo(
    () => buildCallNickname(currentUser, userSettings),
    [currentUser, userSettings],
  );

  const peerIdRef = useRef('');
  const callRoomIdRef = useRef<string | null>(null);
  const callChannelIdRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const currentUserRef = useRef<UserCredentials | null>(null);
  const settingsRef = useRef<UserSettings>(userSettings);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const channelsRef = useRef<Map<string, RTCDataChannel>>(new Map());
  const pollTimerRef = useRef<number | null>(null);
  const pollBusyRef = useRef(false);
  const inviteFromUrlHandledRef = useRef(false);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const stateHydratedRef = useRef(false);
  const stateSaveTimerRef = useRef<number | null>(null);
  const sharedStateSaveTimerRef = useRef<number | null>(null);
  const sharedStatePollTimerRef = useRef<number | null>(null);
  const userStatePollTimerRef = useRef<number | null>(null);
  const callSessionHeartbeatRef = useRef<number | null>(null);
  const deviceSessionIdRef = useRef(getOrCreateDeviceSessionId());
  const viewChangeTimerRef = useRef<number | null>(null);
  const transitionEndTimerRef = useRef<number | null>(null);

  const activeServer = useMemo(
    () => servers.find((server) => server.id === activeServerId) || null,
    [servers, activeServerId],
  );

  const channelById = useMemo(() => {
    const map = new Map<string, Channel>();
    for (const server of servers) {
      for (const channel of server.channels) {
        map.set(channel.id, channel);
      }
    }
    return map;
  }, [servers]);

  const editingChannel = useMemo<Channel | null>(() => {
    if (!editingChannelId) return null;
    return activeServer?.channels.find((channel) => channel.id === editingChannelId) || null;
  }, [activeServer, editingChannelId]);

  useEffect(() => {
    const token = readStoredAuthToken();
    if (!token) {
      setIsLocalSession(false);
      setCurrentUser(null);
      setCurrentView('landing');
      setDisplayView('landing');
      setIsAuthBootstrapping(false);
      return;
    }

    if (isLocalAuthToken(token)) {
      setIsLocalSession(true);
      const storedLocalUser = readStoredLocalUser();
      if (storedLocalUser) {
        setCurrentUser(storedLocalUser);
      } else {
        const tokenTail = cleanId(token.slice(LOCAL_AUTH_TOKEN_PREFIX.length), 48);
        setCurrentUser({
          id: tokenTail || `local_${Math.random().toString(36).slice(2, 8)}`,
          name: 'Local User',
        });
      }
      setCurrentView('app');
      setDisplayView('app');
      setIsAuthBootstrapping(false);
      return;
    }

    setIsLocalSession(false);

    let cancelled = false;
    void (async () => {
      try {
        const payload = await apiGet<{ user?: { id: string; name: string } }>('/api/auth/me');
        if (cancelled) return;
        if (!payload?.user?.id || !payload?.user?.name) {
          throw new Error('unauthorized');
        }
        setCurrentUser({ id: payload.user.id, name: payload.user.name });
        writeStoredLocalUser(null);
        setCurrentView('app');
        setDisplayView('app');
        setIsAuthBootstrapping(false);
      } catch {
        if (cancelled) return;
        localStorage.removeItem(STORAGE_KEYS.authToken);
        writeStoredLocalUser(null);
        setIsLocalSession(false);
        setCurrentUser(null);
        setCurrentView('landing');
        setDisplayView('landing');
        setIsAuthBootstrapping(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeServerId === 'home') return;
    const serverExists = servers.some((server) => server.id === activeServerId);
    if (serverExists) return;

    setActiveServerId('home');
    if (dms.length > 0) {
      setActiveChannelId(dms[0].id);
    } else {
      setActiveChannelId('home');
    }
    setActiveChannelType('text');
  }, [activeServerId, servers, dms]);

  useEffect(() => {
    if (isLocalSession) return;
    if (!isServerAdminOpen || !activeServer || activeServerId === 'home') return;
    void fetchServerInvites(activeServer.id);
  }, [isServerAdminOpen, activeServer?.id, activeServerId, isLocalSession]);

  useEffect(() => {
    currentUserRef.current = currentUser;
    if (currentUser?.id) {
      peerIdRef.current = buildPeerId(currentUser.id);
    } else {
      peerIdRef.current = '';
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) {
      stateHydratedRef.current = false;
      setIsStateHydrated(false);
      setServers(INITIAL_SERVERS);
      setDms(INITIAL_DMS);
      setMessages(INITIAL_MESSAGES);
      setTodos([]);
      setUserSettings(DEFAULT_USER_SETTINGS);
      setInvites({});
      return;
    }

    if (isLocalSession) {
      stateHydratedRef.current = true;
      setIsStateHydrated(true);
      return;
    }

    let cancelled = false;
    stateHydratedRef.current = false;
    setIsStateHydrated(false);

    void (async () => {
      try {
        const payload = await apiGet<{ state?: PersistedAppState }>('/api/state');
        if (cancelled) return;
        const state = payload?.state;
        if (state) {
          if (Array.isArray(state.dms)) setDms(normalizeDms(state.dms));
          if (state.dmMessages && typeof state.dmMessages === 'object') {
            setMessages((prev) => mergeMessageMaps(prev, state.dmMessages));
          }
          if (state.settings && typeof state.settings === 'object') {
            setUserSettings((prev) => ({ ...prev, ...state.settings }));
          }
          if (Array.isArray(state.todos)) {
            setTodos(state.todos);
          }
          if (state.language === 'ru' || state.language === 'en') {
            setLanguage(state.language);
          }
          if (state.lastView === 'landing' || state.lastView === 'app') {
            setCurrentView(state.lastView === 'landing' ? 'app' : state.lastView);
            setDisplayView(state.lastView === 'landing' ? 'app' : state.lastView);
          }
        }
        const sharedPayload = await apiGet<{ state?: SharedAppState }>('/api/shared-state');
        if (cancelled) return;
        const sharedState = sharedPayload?.state;
        if (sharedState) {
          if (Array.isArray(sharedState.servers)) setServers(normalizeServers(sharedState.servers));
          if (sharedState.messages && typeof sharedState.messages === 'object') setMessages(sharedState.messages);
        }
      } catch (error) {
        const code = error instanceof Error ? error.message : '';
        if (!cancelled && code === 'unauthorized') {
          localStorage.removeItem(STORAGE_KEYS.authToken);
          writeStoredLocalUser(null);
          setIsLocalSession(false);
          setCurrentUser(null);
          setCurrentView('landing');
          setDisplayView('landing');
        }
      }
      if (!cancelled) {
        stateHydratedRef.current = true;
        setIsStateHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, isLocalSession]);

  useEffect(() => {
    if (!currentUser?.id) return;
    if (!isStateHydrated) return;
    if (isLocalSession) return;

    if (stateSaveTimerRef.current !== null) {
      window.clearTimeout(stateSaveTimerRef.current);
      stateSaveTimerRef.current = null;
    }

    stateSaveTimerRef.current = window.setTimeout(() => {
      void apiPost('/api/state/save', {
        state: {
          dms,
          dmMessages: pickDmMessageMap(messages, dms),
          settings: userSettings,
          todos,
          language,
          lastView: currentView === 'landing' ? 'landing' : 'app',
        } as PersistedAppState,
      }).catch(() => undefined);
    }, 500);

    return () => {
      if (stateSaveTimerRef.current !== null) {
        window.clearTimeout(stateSaveTimerRef.current);
        stateSaveTimerRef.current = null;
      }
    };
  }, [currentUser?.id, dms, userSettings, todos, language, currentView, messages, isStateHydrated, isLocalSession]);

  useEffect(() => {
    if (!currentUser?.id) return;
    if (!isStateHydrated) return;
    if (isLocalSession) return;

    let cancelled = false;

    const pullPersonalState = async () => {
      try {
        const payload = await apiGet<{ state?: PersistedAppState }>('/api/state');
        if (cancelled) return;
        const state = payload?.state;
        if (!state) return;
        if (Array.isArray(state.dms)) {
          setDms((prev) => {
            const next = normalizeDms(state.dms);
            return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
          });
        }
        if (state.dmMessages && typeof state.dmMessages === 'object') {
          setMessages((prev) => mergeMessageMaps(prev, state.dmMessages));
        }
        if (Array.isArray(state.todos)) {
          setTodos((prev) => {
            const next = state.todos || [];
            return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
          });
        }
        if (state.language === 'ru' || state.language === 'en') {
          setLanguage((prev) => (prev === state.language ? prev : state.language));
        }
      } catch {}
    };

    void pullPersonalState();
    userStatePollTimerRef.current = window.setInterval(() => {
      void pullPersonalState();
    }, 1200);

    return () => {
      cancelled = true;
      if (userStatePollTimerRef.current !== null) {
        window.clearInterval(userStatePollTimerRef.current);
        userStatePollTimerRef.current = null;
      }
    };
  }, [currentUser?.id, isStateHydrated, isLocalSession]);

  useEffect(() => {
    if (!currentUser?.id) return;
    if (!isStateHydrated) return;
    if (isLocalSession) return;

    if (sharedStateSaveTimerRef.current !== null) {
      window.clearTimeout(sharedStateSaveTimerRef.current);
      sharedStateSaveTimerRef.current = null;
    }

    sharedStateSaveTimerRef.current = window.setTimeout(() => {
      void apiPost('/api/shared-state/save', {
        state: {
          servers,
          messages,
        } as SharedAppState,
      }).catch(() => undefined);
    }, 500);

    return () => {
      if (sharedStateSaveTimerRef.current !== null) {
        window.clearTimeout(sharedStateSaveTimerRef.current);
        sharedStateSaveTimerRef.current = null;
      }
    };
  }, [currentUser?.id, servers, messages, isStateHydrated, isLocalSession]);

  useEffect(() => {
    if (!currentUser?.id) return;
    if (!isStateHydrated) return;
    if (isLocalSession) return;

    let cancelled = false;

    const pullSharedState = async () => {
      try {
        const payload = await apiGet<{ state?: SharedAppState }>('/api/shared-state');
        if (cancelled) return;
        const sharedState = payload?.state;
        if (!sharedState) return;
        if (Array.isArray(sharedState.servers)) {
          setServers((prev) => {
            const next = normalizeServers(sharedState.servers);
            return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
          });
        }
        if (sharedState.messages && typeof sharedState.messages === 'object') {
          setMessages((prev) => mergeMessageMaps(prev, sharedState.messages));
        }
      } catch {}
    };

    void pullSharedState();
    sharedStatePollTimerRef.current = window.setInterval(() => {
      void pullSharedState();
    }, 2500);

    return () => {
      cancelled = true;
      if (sharedStatePollTimerRef.current !== null) {
        window.clearInterval(sharedStatePollTimerRef.current);
        sharedStatePollTimerRef.current = null;
      }
    };
  }, [currentUser?.id, isStateHydrated, isLocalSession]);

  useEffect(() => {
    settingsRef.current = userSettings;
  }, [userSettings]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    callChannelIdRef.current = callChannelId;
  }, [callChannelId]);

  useEffect(() => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted;
    });
  }, [localStream, isMuted]);

  useEffect(() => {
    if (!localStream) return;
    if (isScreenSharing) {
      if (cameraTrackRef.current) {
        cameraTrackRef.current.enabled = !isVideoOff;
      }
      return;
    }
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = !isVideoOff;
    });
  }, [localStream, isVideoOff, isScreenSharing]);

  useEffect(() => {
    if (status !== CallStatus.CONNECTED) return;
    const me = currentUserRef.current;
    if (!me) return;
    const packet = JSON.stringify({
      type: 'presence',
      name: buildCallNickname(me, userSettings),
      isMuted,
      isVideoOff,
      isScreenSharing,
    });
    for (const channel of channelsRef.current.values()) {
      if (channel.readyState === 'open') {
        channel.send(packet);
      }
    }
  }, [status, userSettings.privacyMode, currentUser?.id, currentUser?.name, isMuted, isVideoOff, isScreenSharing]);

  const stopPolling = () => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollBusyRef.current = false;
  };

  const appendMessage = (channelId: string, message: Message) => {
    setMessages((prev) => {
      const list = prev[channelId] || [];
      if (list.some((item) => item.id === message.id)) return prev;
      return { ...prev, [channelId]: [...list, message] };
    });
  };

  const addSystemMessage = (content: string) => {
    const targetChannel = callChannelIdRef.current;
    if (!targetChannel) return;
    appendMessage(targetChannel, {
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderId: 'sys',
      senderName: ui.system,
      content,
      timestamp: Date.now(),
    });
  };

  const getServerById = (serverId: string) => servers.find((server) => server.id === serverId) || null;

  const getChannelById = (channelId: string) => channelById.get(channelId) || null;

  const resolveRoomIdForChannel = (channelId: string) => {
    const fallback = roomFromChannel(channelId);
    for (const server of servers) {
      const voiceChannels = server.channels.filter((channel) => channel.type === 'voice');
      const voiceIndex = voiceChannels.findIndex((channel) => channel.id === channelId);
      if (voiceIndex >= 0) {
        return `voice-${cleanId(server.id, 48)}-${voiceIndex + 1}`;
      }
    }
    return fallback;
  };

  const applyVoiceBitrate = async (peerConnection: RTCPeerConnection, channelId: string) => {
    const channel = getChannelById(channelId);
    if (!channel || channel.type !== 'voice' || !channel.bitrateKbps) return;
    if (peerConnection.connectionState === 'closed') return;
    for (const sender of peerConnection.getSenders()) {
      if (!sender.track || sender.track.kind !== 'video') continue;
      try {
        const params = sender.getParameters();
        const encodings = params.encodings && params.encodings.length > 0 ? params.encodings : [{}];
        encodings[0] = { ...encodings[0], maxBitrate: channel.bitrateKbps * 1000 };
        params.encodings = encodings;
        await sender.setParameters(params);
      } catch {}
    }
  };

  const selectServerAndDefaultChannel = (serverId: string, serverOverride?: Server | null) => {
    const server = serverOverride || getServerById(serverId);
    if (!server || server.channels.length === 0) return;
    setActiveServerId(serverId);
    setMobileTab('servers');
    setIsMobileSidebarVisible(true);
    setActiveChannelId(server.channels[0].id);
    setActiveChannelType(server.channels[0].type);
  };

  const normalizeInvite = (raw: any): InviteLink => ({
    code: String(raw?.code || '').toUpperCase(),
    serverId: String(raw?.serverId || ''),
    serverName: typeof raw?.serverName === 'string' ? raw.serverName : undefined,
    createdAt: Number(raw?.createdAt || Date.now()),
    createdBy: typeof raw?.createdBy === 'string' ? raw.createdBy : 'anon',
    expiresAt: raw?.expiresAt ? Number(raw.expiresAt) : null,
    maxUses: raw?.maxUses ? Number(raw.maxUses) : null,
    uses: Number(raw?.uses || 0),
    revoked: Boolean(raw?.revoked),
    status: typeof raw?.status === 'string' ? raw.status : undefined,
  });

  const upsertInvite = (invite: InviteLink) => {
    if (!invite.code) return;
    setInvites((prev) => ({ ...prev, [invite.code]: invite }));
  };

  const fetchServerInvites = async (serverId: string) => {
    if (isLocalSession) return;
    try {
      const payload = await apiGet<{ invites: any[] }>(`/api/servers/${encodeURIComponent(serverId)}/invites`);
      if (!Array.isArray(payload.invites)) return;
      const next: Record<string, InviteLink> = {};
      for (const raw of payload.invites) {
        const invite = normalizeInvite(raw);
        if (invite.code) next[invite.code] = invite;
      }
      setInvites((prev) => ({ ...prev, ...next }));
    } catch {}
  };

  const createInvite = async (serverId: string, options: { expiresInHours: number | null; maxUses: number | null }) => {
    if (isLocalSession) return null;
    try {
      const payload = await apiPost<{ invite: any }>('/api/invites', {
        serverId,
        serverName: getServerById(serverId)?.name || ui.defaultServer,
        expiresInHours: options.expiresInHours,
        maxUses: options.maxUses,
      });
      const invite = normalizeInvite(payload.invite);
      upsertInvite(invite);
      return invite.code || null;
    } catch {
      return null;
    }
  };

  const getInviteJoinResult = async (codeInput: string) => {
    const code = codeInput.trim().toUpperCase();
    if (!code) return { ok: false, message: ui.inviteCodeEmpty };
    if (isLocalSession) {
      return {
        ok: false,
        message: isRu
          ? 'Локальный режим: приглашения работают только с backend.'
          : 'Local preview mode: invites require backend.',
      };
    }

    try {
      const payload = await apiPost<{ ok: boolean; invite: any; serverId: string; serverName?: string }>(`/api/invites/${encodeURIComponent(code)}/join`, {});
      const invite = normalizeInvite(payload.invite);
      upsertInvite(invite);
      let targetServerName = payload.serverName || ui.defaultServer;

      try {
        const sharedPayload = await apiGet<{ state?: SharedAppState }>('/api/shared-state');
        const sharedState = sharedPayload?.state;
        const nextServers = Array.isArray(sharedState?.servers) ? normalizeServers(sharedState.servers) : [];
        if (nextServers.length > 0) {
          setServers(nextServers);
          const targetServer = nextServers.find((item) => item.id === payload.serverId);
          if (targetServer) {
            targetServerName = targetServer.name;
            selectServerAndDefaultChannel(targetServer.id, targetServer);
          }
        }
        if (sharedState?.messages && typeof sharedState.messages === 'object') {
          setMessages((prev) => mergeMessageMaps(prev, sharedState.messages));
        }
      } catch {}

      void loadDiscoverServers();

      return { ok: true, message: `${ui.inviteJoined} "${targetServerName}" ${ui.inviteByCode}.` };
    } catch (error) {
      const codeError = error instanceof Error ? error.message : 'join_failed';
      if (codeError === 'unauthorized') return { ok: false, message: ui.authRequired };
      if (codeError === 'invite_not_found' || codeError === 'invalid_invite_code') {
        return { ok: false, message: ui.inviteNotFound };
      }
      if (codeError === 'invite_not_usable') {
        return { ok: false, message: ui.inviteUnavailable };
      }
      return { ok: false, message: ui.inviteJoinFailed };
    }
  };

  const revokeInvite = async (code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    if (isLocalSession) return;
    try {
      const payload = await apiPost<{ invite: any }>(`/api/invites/${encodeURIComponent(normalized)}/revoke`, {});
      if (payload?.invite) {
        upsertInvite(normalizeInvite(payload.invite));
      }
    } catch {}
  };

  const handleCreateChannelFromDraft = (draft: {
    name: string;
    type: ChannelType;
    description?: string;
    isPrivate?: boolean;
    slowModeSec?: number;
    userLimit?: number;
    bitrateKbps?: number;
  }) => {
    if (!activeServerId || activeServerId === 'home') return;
    const newChannel: Channel = {
      id: makeId(draft.type === 'text' ? 'c' : 'v'),
      name: draft.name,
      type: draft.type,
      description: draft.description,
      isPrivate: draft.isPrivate,
      slowModeSec: draft.type === 'text' ? draft.slowModeSec || 0 : undefined,
      userLimit: draft.type === 'voice' ? draft.userLimit || 0 : undefined,
      bitrateKbps: draft.type === 'voice' ? draft.bitrateKbps || 1200 : undefined,
    };

    setServers((prev) => prev.map((server) => (
      server.id === activeServerId
        ? { ...server, channels: [...server.channels, newChannel] }
        : server
    )));

    if (newChannel.type === 'text') {
      setMessages((prev) => ({ ...prev, [newChannel.id]: prev[newChannel.id] || [] }));
    }

    setActiveChannelId(newChannel.id);
    setActiveChannelType(newChannel.type);
    setIsMobileSidebarVisible(false);
  };

  const handleSaveChannelFromDraft = (
    channelId: string,
    draft: {
      name: string;
      type: ChannelType;
      description?: string;
      isPrivate?: boolean;
      slowModeSec?: number;
      userLimit?: number;
      bitrateKbps?: number;
    },
  ) => {
    if (!activeServer) return;
    setServers((prev) => prev.map((server) => {
      if (server.id !== activeServer.id) return server;
      return {
        ...server,
        channels: server.channels.map((channel) => (
          channel.id !== channelId
            ? channel
            : {
              ...channel,
              name: draft.name,
              description: draft.description,
              isPrivate: draft.isPrivate,
              slowModeSec: channel.type === 'text' ? draft.slowModeSec || 0 : undefined,
              userLimit: channel.type === 'voice' ? draft.userLimit || 0 : undefined,
              bitrateKbps: channel.type === 'voice' ? draft.bitrateKbps || 1200 : undefined,
            }
        )),
      };
    }));
  };

  const handleDeleteChannel = (channelId: string) => {
    if (!activeServer) return;
    const target = activeServer.channels.find((channel) => channel.id === channelId);
    if (!target) return;
    if (activeServer.channels.length <= 1) return;

    if (callChannelId === channelId && status !== CallStatus.IDLE) {
      void handleLeaveCall();
    }

    const nextChannels = activeServer.channels.filter((channel) => channel.id !== channelId);
    setServers((prev) => prev.map((server) => (
      server.id === activeServer.id ? { ...server, channels: nextChannels } : server
    )));

    setMessages((prev) => {
      const next = { ...prev };
      delete next[channelId];
      return next;
    });

    if (activeChannelId === channelId) {
      const fallback = nextChannels[0];
      if (fallback) {
        setActiveChannelId(fallback.id);
        setActiveChannelType(fallback.type);
      }
    }
  };

  const handleSaveServer = (serverId: string, patch: { name: string; description?: string; iconUrl?: string }) => {
    const name = patch.name.trim();
    if (!name) return;
    setServers((prev) => prev.map((server) => (
      server.id === serverId
        ? { ...server, name: name.slice(0, 60), description: patch.description, iconUrl: patch.iconUrl }
        : server
    )));
  };

  const setRemotePeer = (peerId: string, patch: Partial<RemotePeerState>, fallbackName?: string) => {
    setRemotePeers((prev) => {
      const current = prev[peerId];
      return {
        ...prev,
        [peerId]: {
          name: patch.name ?? current?.name ?? fallbackName ?? `Peer ${peerId.slice(-4)}`,
          stream: patch.stream ?? current?.stream ?? null,
          isMuted: patch.isMuted ?? current?.isMuted ?? false,
          isVideoOff: patch.isVideoOff ?? current?.isVideoOff ?? true,
          isScreenSharing: patch.isScreenSharing ?? current?.isScreenSharing ?? false,
        },
      };
    });
  };

  const closePeer = (peerId: string) => {
    const ch = channelsRef.current.get(peerId);
    if (ch) {
      try {
        ch.close();
      } catch {}
      channelsRef.current.delete(peerId);
    }

    const pc = peersRef.current.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch {}
      peersRef.current.delete(peerId);
    }

    setRemotePeers((prev) => {
      if (!prev[peerId]) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  };

  const clearTransport = () => {
    stopPolling();
    for (const peerId of peersRef.current.keys()) {
      closePeer(peerId);
    }
    peersRef.current.clear();
    channelsRef.current.clear();
    setRemotePeers({});
    callRoomIdRef.current = null;
    setCallChannelId(null);
  };

  const stopLocalMedia = () => {
    if (screenTrackRef.current) {
      screenTrackRef.current.onended = null;
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    if (cameraTrackRef.current && cameraTrackRef.current.readyState === 'live') {
      cameraTrackRef.current.stop();
    }
    cameraTrackRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    localStreamRef.current = null;
    setLocalStream(null);
    setIsScreenSharing(false);
  };

  const replaceOutboundVideoTrack = async (track: MediaStreamTrack | null) => {
    const jobs: Promise<void>[] = [];
    for (const peerConnection of peersRef.current.values()) {
      try {
        if (peerConnection.connectionState === 'closed') continue;
      try {
        if (peerConnection.connectionState === 'closed') continue;
        for (const sender of peerConnection.getSenders()) {
          if (sender.track?.kind === 'video') {
            jobs.push(sender.replaceTrack(track).then(() => undefined).catch(() => undefined));
          }
        }
      } catch {}
      } catch {}
    }
    await Promise.all(jobs);
  };

  const rebuildLocalPreviewStream = (videoTrack: MediaStreamTrack | null) => {
    const current = localStreamRef.current;
    if (!current) return;
    const audioTracks = current.getAudioTracks().filter((track) => track.readyState === 'live');
    const tracks = videoTrack && videoTrack.readyState === 'live'
      ? [...audioTracks, videoTrack]
      : [...audioTracks];
    const next = new MediaStream(tracks);
    localStreamRef.current = next;
    setLocalStream(next);
  };

  const stopScreenShare = async () => {
    const activeScreenTrack = screenTrackRef.current;
    if (activeScreenTrack) {
      activeScreenTrack.onended = null;
      activeScreenTrack.stop();
      screenTrackRef.current = null;
    }
    const cameraTrack = cameraTrackRef.current;
    if (cameraTrack && cameraTrack.readyState === 'live') {
      cameraTrack.enabled = !isVideoOff;
      await replaceOutboundVideoTrack(cameraTrack);
      rebuildLocalPreviewStream(cameraTrack);
    } else {
      await replaceOutboundVideoTrack(null);
      rebuildLocalPreviewStream(null);
      setIsVideoOff(true);
    }
    setIsScreenSharing(false);
  };

  const resolveMediaPermissionError = (error: unknown, source: 'camera_mic' | 'mic' | 'screen') => {
    const name = typeof error === 'object' && error && 'name' in error ? String((error as any).name) : '';
    if (source === 'screen') {
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        return isRu ? 'Нет доступа к демонстрации экрана. Разрешите доступ к экрану в браузере.' : 'No screen-sharing permission. Allow screen access in your browser.';
      }
      if (name === 'NotFoundError') {
        return isRu ? 'Экран для демонстрации не найден.' : 'No screen source found.';
      }
      return isRu ? 'Не удалось включить демонстрацию экрана.' : 'Failed to start screen sharing.';
    }
    if (source === 'mic') {
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        return isRu ? 'Нет доступа к микрофону. Разрешите его в браузере.' : 'No microphone permission. Allow it in your browser.';
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return isRu ? 'Микрофон не найден на устройстве.' : 'Microphone not found on this device.';
      }
      if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
        return isRu ? 'Микрофон занят другим приложением или заблокирован системой.' : 'Microphone is busy in another app or blocked by the OS.';
      }
      return isRu ? 'Не удалось получить доступ к микрофону.' : 'Failed to access microphone.';
    }
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return isRu ? 'Нет доступа к камере/микрофону. Разрешите их в браузере.' : 'No camera/microphone permission. Allow them in your browser.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return isRu ? 'Камера или микрофон не найдены на устройстве.' : 'Camera or microphone not found on this device.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
      return isRu ? 'Камера или микрофон заняты другим приложением.' : 'Camera or microphone is busy in another app.';
    }
    if (name === 'NotSupportedError' || name === 'SecurityError') {
      return isRu ? 'Браузер не поддерживает доступ к камере/микрофону в текущем режиме.' : 'Browser does not support camera/microphone access in current mode.';
    }
    return isRu ? 'Не удалось получить доступ к камере и микрофону.' : 'Failed to access camera and microphone.';
  };

  const ensureCallMediaPreflight = async (startVideoOff: boolean): Promise<boolean> => {
    if (typeof window === 'undefined' || typeof RTCPeerConnection === 'undefined') {
      throw new Error(isRu ? 'Браузер не поддерживает WebRTC. Обновите браузер.' : 'WebRTC is not supported by this browser. Please update it.');
    }
    if (!window.isSecureContext) {
      throw new Error(isRu ? 'Звонки работают только в защищённом контексте (HTTPS).' : 'Calls work only in secure context (HTTPS).');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(isRu ? 'Браузер не поддерживает доступ к камере/микрофону.' : 'Browser does not support camera/microphone access.');
    }

    let effectiveVideoOff = startVideoOff;

    const queryPermission = async (name: 'microphone' | 'camera'): Promise<PermissionState | 'unknown'> => {
      try {
        if (!navigator.permissions?.query) return 'unknown';
        const result = await navigator.permissions.query({ name: name as PermissionName });
        return result.state;
      } catch {
        return 'unknown';
      }
    };

    const micPermission = await queryPermission('microphone');
    const cameraPermission = await queryPermission('camera');
    if (micPermission === 'denied') {
      throw new Error(isRu ? 'Нет доступа к микрофону. Разрешите доступ в браузере.' : 'No microphone permission. Allow microphone access in browser.');
    }
    if (!startVideoOff && cameraPermission === 'denied') {
      effectiveVideoOff = true;
    }

    if (navigator.mediaDevices.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasMic = devices.some((device) => device.kind === 'audioinput');
      const hasCamera = devices.some((device) => device.kind === 'videoinput');
      if (!hasMic) {
        throw new Error(isRu ? 'Микрофон не найден на устройстве.' : 'Microphone not found on this device.');
      }
      if (!startVideoOff && !hasCamera) {
        effectiveVideoOff = true;
      }
    }

    return effectiveVideoOff;
  };

  const startScreenShare = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setCallError(isRu ? 'Демонстрация экрана не поддерживается браузером.' : 'Screen sharing is not supported by this browser.');
      return;
    }

    const baseStream = localStreamRef.current;
    if (!baseStream) return;
    const currentVideoTrack = baseStream.getVideoTracks()[0] || null;
    if (!cameraTrackRef.current && currentVideoTrack) {
      cameraTrackRef.current = currentVideoTrack;
    }

    const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const screenTrack = displayStream.getVideoTracks()[0];
    if (!screenTrack) {
      setCallError(isRu ? 'Не удалось получить поток экрана.' : 'Could not capture a screen stream.');
      return;
    }

    screenTrack.onended = () => {
      void stopScreenShare();
    };

    screenTrackRef.current = screenTrack;
    await replaceOutboundVideoTrack(screenTrack);
    setIsVideoOff(false);
    setIsScreenSharing(true);
    rebuildLocalPreviewStream(screenTrack);
  };

  const handleToggleScreenShare = async () => {
    if (status !== CallStatus.CONNECTED) return;
    setCallError(null);
    try {
      if (isScreenSharing) {
        await stopScreenShare();
      } else {
        await startScreenShare();
      }
    } catch (error) {
      setCallError(resolveMediaPermissionError(error, 'screen'));
    }
  };

  const sendSignal = async (to: string, type: SignalType, payload?: unknown) => {
    const roomId = callRoomIdRef.current;
    const from = peerIdRef.current;
    if (!roomId || !from) return;
    await apiPost(`/api/rooms/${encodeURIComponent(roomId)}/signal`, { from, to, type, payload });
  };

  const stopCallSessionHeartbeat = () => {
    if (callSessionHeartbeatRef.current !== null) {
      window.clearInterval(callSessionHeartbeatRef.current);
      callSessionHeartbeatRef.current = null;
    }
  };

  const releaseCallSession = async () => {
    stopCallSessionHeartbeat();
    try {
      await apiPost('/api/call-session/release', {
        sessionId: deviceSessionIdRef.current,
      });
    } catch {}
  };

  const startCallSessionHeartbeat = () => {
    stopCallSessionHeartbeat();
    callSessionHeartbeatRef.current = window.setInterval(async () => {
      try {
        await apiPost('/api/call-session/heartbeat', {
          sessionId: deviceSessionIdRef.current,
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : '';
        if (code === 'session_replaced' || code === 'session_not_found') {
          setCallError(isRu ? 'Звонок продолжен на другом устройстве. Этот сеанс отключён.' : 'Call moved to another device. This session was disconnected.');
          await handleLeaveCall();
        }
      }
    }, 2000);
  };

  const setupDataChannel = (remotePeerId: string, channel: RTCDataChannel) => {
    channelsRef.current.set(remotePeerId, channel);

    channel.onopen = () => {
      const me = currentUserRef.current;
      if (me && channel.readyState === 'open') {
        channel.send(JSON.stringify({
          type: 'presence',
          name: buildCallNickname(me, settingsRef.current),
          isMuted,
          isVideoOff,
          isScreenSharing,
        }));
      }
    };

    channel.onclose = () => {
      if (channelsRef.current.get(remotePeerId) === channel) {
        channelsRef.current.delete(remotePeerId);
      }
    };

    channel.onmessage = (event) => {
      try {
        const packet = JSON.parse(String(event.data));
        if (packet?.type === 'presence' && typeof packet.name === 'string') {
          setRemotePeer(remotePeerId, {
            name: packet.name,
            ...(typeof packet.isMuted === 'boolean' ? { isMuted: packet.isMuted } : {}),
            ...(typeof packet.isVideoOff === 'boolean' ? { isVideoOff: packet.isVideoOff } : {}),
            ...(typeof packet.isScreenSharing === 'boolean' ? { isScreenSharing: packet.isScreenSharing } : {}),
          });
        }
      } catch {}
    };
  };

  const ensurePeer = async (peer: SignalingPeer) => {
    if (!peer.peerId || peer.peerId === peerIdRef.current) return null;

    const existing = peersRef.current.get(peer.peerId);
    if (existing) {
      if (peer.name) setRemotePeer(peer.peerId, { name: peer.name });
      return existing;
    }

    setRemotePeer(peer.peerId, {}, peer.name);

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peersRef.current.set(peer.peerId, pc);

    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, stream);
        } catch {}
      });
      const targetChannelId = callChannelIdRef.current || activeChannelId;
      void applyVoiceBitrate(pc, targetChannelId);
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void sendSignal(peer.peerId, 'ice', event.candidate.toJSON());
      }
    };

    pc.ondatachannel = (event) => {
      setupDataChannel(peer.peerId, event.channel);
    };

    pc.ontrack = (event) => {
      const streamFromPeer = event.streams[0];
      if (!streamFromPeer) return;
      const recalc = () => {
        const hasAudio = streamFromPeer.getAudioTracks().some((track) => track.readyState === 'live' && !track.muted);
        const hasVideo = streamFromPeer.getVideoTracks().some((track) => track.readyState === 'live' && !track.muted);
        setRemotePeer(peer.peerId, {
          stream: streamFromPeer,
          isMuted: !hasAudio,
          isVideoOff: !hasVideo,
        }, peer.name);
      };
      recalc();
      streamFromPeer.getAudioTracks().forEach((track) => {
        track.onmute = recalc;
        track.onunmute = recalc;
        track.onended = recalc;
      });
      streamFromPeer.getVideoTracks().forEach((track) => {
        track.onmute = recalc;
        track.onunmute = recalc;
        track.onended = recalc;
      });
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        closePeer(peer.peerId);
      }
    };

    if (peerIdRef.current.localeCompare(peer.peerId) < 0) {
      const dc = pc.createDataChannel('mesh-chat', { ordered: true });
      setupDataChannel(peer.peerId, dc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(peer.peerId, 'offer', pc.localDescription);
    }

    return pc;
  };

  const syncPeers = async (peers: SignalingPeer[]) => {
    const remoteList = peers.filter((peer) => peer.peerId && peer.peerId !== peerIdRef.current);
    const knownIds = new Set(remoteList.map((peer) => peer.peerId));

    for (const existingId of peersRef.current.keys()) {
      if (!knownIds.has(existingId)) {
        closePeer(existingId);
      }
    }

    for (const peer of remoteList) {
      const isNew = !peersRef.current.has(peer.peerId);
      await ensurePeer(peer);
      if (isNew) {
        addSystemMessage(
          isRu
            ? `Соединение mesh установлено с ${peer.name || peer.peerId}.`
            : `Mesh link established with ${peer.name || peer.peerId}.`
        );
      }
    }
  };

  const handleSignal = async (signal: PollSignal) => {
    if (!signal.from || signal.from === peerIdRef.current) return;
    if (signal.roomId !== callRoomIdRef.current) return;

    if (signal.type === 'bye') {
      const peerName = remotePeers[signal.from]?.name || signal.from;
      closePeer(signal.from);
      addSystemMessage(isRu ? `${peerName} покинул(а) комнату.` : `${peerName} left the room.`);
      return;
    }

    const pc = await ensurePeer({ peerId: signal.from });
    if (!pc) return;

    if (signal.type === 'offer') {
      const desc = signal.payload as RTCSessionDescriptionInit;
      if (!desc?.type) return;
      if (pc.signalingState !== 'stable') {
        try {
          await pc.setLocalDescription({ type: 'rollback' });
        } catch {}
      }
      await pc.setRemoteDescription(desc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal(signal.from, 'answer', pc.localDescription);
      return;
    }

    if (signal.type === 'answer') {
      const desc = signal.payload as RTCSessionDescriptionInit;
      if (!desc?.type) return;
      await pc.setRemoteDescription(desc);
      return;
    }

    if (signal.type === 'ice') {
      const candidate = signal.payload as RTCIceCandidateInit;
      if (!candidate) return;
      try {
        await pc.addIceCandidate(candidate);
      } catch {}
    }
  };

  const pollSignaling = async () => {
    const roomId = callRoomIdRef.current;
    const myPeerId = peerIdRef.current;
    if (!roomId || !myPeerId) return;

    const payload = await apiGet<PollResponse>(`/api/rooms/${encodeURIComponent(roomId)}/poll?peerId=${encodeURIComponent(myPeerId)}`);
    if (Array.isArray(payload.peers)) await syncPeers(payload.peers);
    if (Array.isArray(payload.signals)) {
      for (const signal of payload.signals) {
        await handleSignal(signal);
      }
    }
  };

  const startPolling = () => {
    stopPolling();
    pollTimerRef.current = window.setInterval(async () => {
      if (pollBusyRef.current) return;
      pollBusyRef.current = true;
      try {
        await pollSignaling();
      } catch {}
      pollBusyRef.current = false;
    }, POLL_MS);
  };

  const handleStartCall = async () => {
    if (!currentUser || activeChannelType !== 'voice' || status !== CallStatus.IDLE) return;
    if (isLocalSession) {
      setCallError(
        isRu
          ? 'Локальный режим: звонки доступны только при запущенном backend.'
          : 'Local preview mode: calls are available only with backend running.',
      );
      return;
    }
    setCallError(null);
    let preflightVideoOff = userSettings.startVideoOff;
    try {
      preflightVideoOff = await ensureCallMediaPreflight(userSettings.startVideoOff);
    } catch (error) {
      setCallError(error instanceof Error ? error.message : (isRu ? 'Не удалось проверить доступ к устройствам.' : 'Failed to validate media devices.'));
      return;
    }
    setStatus(CallStatus.CONNECTING);
    setIsCallMinimized(false);

    try {
      const startMuted = userSettings.startMuted;
      const startVideoOff = preflightVideoOff;
      setIsMuted(startMuted);
      setIsVideoOff(startVideoOff);

      const audioConstraints: MediaTrackConstraints = {
        noiseSuppression: userSettings.noiseSuppression,
        echoCancellation: userSettings.echoCancellation,
        autoGainControl: userSettings.autoGainControl,
      };
      if (userSettings.inputDeviceId) {
        audioConstraints.deviceId = { exact: userSettings.inputDeviceId };
      }

      let stream: MediaStream;
      const preferredVideoConstraints: MediaTrackConstraints | boolean = startVideoOff
        ? false
        : (userSettings.videoDeviceId ? { deviceId: { exact: userSettings.videoDeviceId } } : true);
      const errorName = (value: unknown) => (
        typeof value === 'object' && value && 'name' in value ? String((value as any).name) : ''
      );
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: preferredVideoConstraints,
          audio: audioConstraints,
        });
      } catch (primaryError) {
        const primaryName = errorName(primaryError);
        const isVideoConstraintError = (
          primaryName === 'NotFoundError'
          || primaryName === 'DevicesNotFoundError'
          || primaryName === 'OverconstrainedError'
          || primaryName === 'ConstraintNotSatisfiedError'
        );
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: audioConstraints });
        } catch (audioFallbackError) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          } catch (finalError) {
            const source = isVideoConstraintError ? 'mic' : 'camera_mic';
            throw new Error(resolveMediaPermissionError(finalError || audioFallbackError || primaryError, source));
          }
        }
      }

      const hasVideoTrack = stream.getVideoTracks().length > 0;
      const effectiveStartVideoOff = startVideoOff || !hasVideoTrack;
      setIsVideoOff(effectiveStartVideoOff);
      stream.getAudioTracks().forEach((track) => (track.enabled = !startMuted));
      stream.getVideoTracks().forEach((track) => (track.enabled = !effectiveStartVideoOff));
      cameraTrackRef.current = stream.getVideoTracks()[0] || null;
      setLocalStream(stream);
      localStreamRef.current = stream;

      if (!peerIdRef.current) peerIdRef.current = buildPeerId(currentUser.id);
      callRoomIdRef.current = resolveRoomIdForChannel(activeChannelId);
      setCallChannelId(activeChannelId);

      await apiPost('/api/call-session/claim', {
        sessionId: deviceSessionIdRef.current,
        roomId: callRoomIdRef.current,
      });
      startCallSessionHeartbeat();

      const join = await apiPost<JoinResponse>(`/api/rooms/${encodeURIComponent(callRoomIdRef.current)}/join`, {
        peerId: peerIdRef.current,
        name: buildCallNickname(currentUser, userSettings),
      });

      const voiceChannel = getChannelById(activeChannelId);
      if (voiceChannel?.type === 'voice' && voiceChannel.userLimit && voiceChannel.userLimit > 0) {
        const joinedCount = (join.peers?.length || 0) + 1;
        if (joinedCount > voiceChannel.userLimit) {
          await apiPost(`/api/rooms/${encodeURIComponent(callRoomIdRef.current)}/leave`, { peerId: peerIdRef.current }).catch(() => undefined);
          throw new Error(`voice_user_limit_reached_${voiceChannel.userLimit}`);
        }
      }

      setStatus(CallStatus.CONNECTED);
      addSystemMessage(isRu ? `Подключение к mesh: ${join.peerId}.` : `Joined mesh as ${join.peerId}.`);
      await syncPeers(join.peers || []);
      startPolling();
    } catch (error) {
      stopCallSessionHeartbeat();
      clearTransport();
      stopLocalMedia();
      setStatus(CallStatus.IDLE);
      setCallError(error instanceof Error ? error.message : 'call_start_failed');
    }
  };

  const handleLeaveCall = async () => {
    const roomId = callRoomIdRef.current;
    const myPeerId = peerIdRef.current;

    if (roomId && myPeerId) {
      for (const remotePeerId of peersRef.current.keys()) {
        void sendSignal(remotePeerId, 'bye').catch(() => undefined);
      }
      void apiPost(`/api/rooms/${encodeURIComponent(roomId)}/leave`, { peerId: myPeerId }).catch(() => undefined);
    }
    await releaseCallSession();

    if (isScreenSharing) {
      await stopScreenShare().catch(() => undefined);
    }
    clearTransport();
    stopLocalMedia();
    setStatus(CallStatus.IDLE);
    setIsCallMinimized(false);
  };

  useEffect(() => {
    if (inviteFromUrlHandledRef.current) return;
    if (isLocalSession) return;
    if (!currentUser) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const inviteCode = (params.get('invite') || '').trim().toUpperCase();
    if (!inviteCode) return;

    inviteFromUrlHandledRef.current = true;
    void (async () => {
      const result = await getInviteJoinResult(inviteCode);
      setInviteNotification(result);
      setTimeout(() => setInviteNotification(null), 6000);
    })();

    params.delete('invite');
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
    window.history.replaceState({}, '', nextUrl);
  }, [invites, servers, currentUser, currentView, isLocalSession]);

  useEffect(() => {
    return () => {
      if (viewChangeTimerRef.current !== null) {
        window.clearTimeout(viewChangeTimerRef.current);
        viewChangeTimerRef.current = null;
      }
      if (transitionEndTimerRef.current !== null) {
        window.clearTimeout(transitionEndTimerRef.current);
        transitionEndTimerRef.current = null;
      }
      if (sharedStateSaveTimerRef.current !== null) {
        window.clearTimeout(sharedStateSaveTimerRef.current);
        sharedStateSaveTimerRef.current = null;
      }
      if (sharedStatePollTimerRef.current !== null) {
        window.clearInterval(sharedStatePollTimerRef.current);
        sharedStatePollTimerRef.current = null;
      }
      if (userStatePollTimerRef.current !== null) {
        window.clearInterval(userStatePollTimerRef.current);
        userStatePollTimerRef.current = null;
      }
      if (callSessionHeartbeatRef.current !== null) {
        window.clearInterval(callSessionHeartbeatRef.current);
        callSessionHeartbeatRef.current = null;
      }
      stopPolling();
      for (const ch of channelsRef.current.values()) {
        try {
          ch.close();
        } catch {}
      }
      for (const pc of peersRef.current.values()) {
        try {
          pc.close();
        } catch {}
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const changeView = (newView: AppView) => {
    if (newView === currentView) return;
    if (viewChangeTimerRef.current !== null) {
      window.clearTimeout(viewChangeTimerRef.current);
      viewChangeTimerRef.current = null;
    }
    if (transitionEndTimerRef.current !== null) {
      window.clearTimeout(transitionEndTimerRef.current);
      transitionEndTimerRef.current = null;
    }
    setIsTransitioning(true);
    viewChangeTimerRef.current = window.setTimeout(() => {
      setCurrentView(newView);
      setDisplayView(newView);
      updateViewInUrl(newView);
      window.scrollTo(0, 0);
      transitionEndTimerRef.current = window.setTimeout(() => setIsTransitioning(false), 300);
    }, 400);
  };

  const handleGetStarted = () => {
    const targetView: AppView = currentUser ? 'app' : 'auth';
    setCurrentView(targetView);
    setDisplayView(targetView);
    updateViewInUrl(targetView);
    setIsTransitioning(false);
    window.scrollTo(0, 0);
  };

  const handleLocalLogin = (rawNickname: string) => {
    const safeName = sanitizeLocalNickname(rawNickname);
    const creds: UserCredentials = {
      id: localUserIdFromName(safeName),
      name: safeName,
    };
    setCurrentUser(creds);
    setIsLocalSession(true);
    writeStoredLocalUser(creds);
    localStorage.setItem(STORAGE_KEYS.authToken, JSON.stringify(createLocalAuthToken(creds.id)));
    changeView('app');
  };

  const handleLogin = (creds: UserCredentials, authToken: string) => {
    const localAuth = isLocalAuthToken(authToken);
    setCurrentUser(creds);
    setIsLocalSession(localAuth);
    writeStoredLocalUser(localAuth ? creds : null);
    localStorage.setItem(STORAGE_KEYS.authToken, JSON.stringify(authToken));
    changeView('app');
  };

  useEffect(() => {
    const deepLinkView = parseViewFromUrl();
    if (!deepLinkView) return;
    const resolved: AppView = deepLinkView === 'app' ? (currentUser ? 'app' : 'auth') : deepLinkView;
    setCurrentView(resolved);
    setDisplayView(resolved);
    updateViewInUrl(resolved);
    setIsTransitioning(false);
  }, [currentUser]);

  const handleSaveSettings = (patch: Partial<UserSettings>) => {
    setUserSettings((prev) => ({ ...prev, ...patch }));
  };

  useEffect(() => {
    const root = document.documentElement;
    if (userSettings.theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
      root.style.colorScheme = 'light';
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    }
  }, [userSettings.theme]);

  const handleChangeLanguage = (lang: Language) => {
    setLanguage(lang);
  };

  const handleAddTodo = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const nextItem: TodoItem = {
      id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text: trimmed.slice(0, 240),
      done: false,
      createdAt: Date.now(),
    };
    setTodos((prev) => [nextItem, ...prev].slice(0, 200));
  };

  const handleToggleTodo = (todoId: string) => {
    setTodos((prev) => prev.map((item) => (
      item.id === todoId ? { ...item, done: !item.done } : item
    )));
  };

  const handleRemoveTodo = (todoId: string) => {
    setTodos((prev) => prev.filter((item) => item.id !== todoId));
  };

  const handleChangePassword = async (oldPassword: string, newPassword: string) => {
    if (!currentUser) {
      return { ok: false, message: language === 'ru' ? 'Пользователь не найден.' : 'User not found.' };
    }
    if (isLocalSession) {
      return {
        ok: false,
        message: language === 'ru'
          ? 'Локальный режим: смена пароля доступна только с backend.'
          : 'Local preview mode: password change requires backend.',
      };
    }
    if (!isStrongPassword(newPassword)) {
      return {
        ok: false,
        message: language === 'ru'
          ? 'Пароль: 8-128 символов, минимум 1 буква и 1 цифра.'
          : 'Password: 8-128 chars, at least 1 letter and 1 number.',
      };
    }
    try {
      const payload = await apiPost<{ token?: string }>('/api/auth/change-password', {
        oldPassword,
        newPassword,
      });
      if (typeof payload?.token === 'string' && payload.token) {
        localStorage.setItem(STORAGE_KEYS.authToken, JSON.stringify(payload.token));
      }
      return { ok: true, message: language === 'ru' ? 'Пароль обновлен.' : 'Password updated.' };
    } catch (error) {
      const code = error instanceof Error ? error.message : 'change_password_failed';
      if (code === 'invalid_credentials') {
        return { ok: false, message: language === 'ru' ? 'Текущий пароль неверный.' : 'Current password is incorrect.' };
      }
      if (code === 'unauthorized') {
        return { ok: false, message: language === 'ru' ? 'Сессия истекла. Войдите снова.' : 'Session expired. Please sign in again.' };
      }
      if (code === 'invalid_password') {
        return { ok: false, message: language === 'ru' ? 'Новый пароль не соответствует требованиям.' : 'New password does not meet requirements.' };
      }
      return { ok: false, message: language === 'ru' ? 'Не удалось обновить пароль.' : 'Failed to update password.' };
    }
  };

  const handleLogout = () => {
    if (status !== CallStatus.IDLE) {
      void handleLeaveCall();
    }
    localStorage.removeItem(STORAGE_KEYS.authToken);
    writeStoredLocalUser(null);
    setIsLocalSession(false);
    setCurrentUser(null);
    setServers(INITIAL_SERVERS);
    setDiscoverServers([]);
    setDms(INITIAL_DMS);
    setMessages(INITIAL_MESSAGES);
    setTodos([]);
    setUserSettings(DEFAULT_USER_SETTINGS);
    setInvites({});
    setActiveServerId('home');
    setActiveChannelId('home');
    setActiveChannelType('text');
    setIsSettingsOpen(false);
    setMobileTab('servers');
    changeView('landing');
  };

  const handleCreateServer = async (name: string): Promise<boolean> => {
    const trimmedName = name.trim().slice(0, 60);
    if (!trimmedName) return false;

    if (!isLocalSession) {
      try {
        const payload = await apiPost<{ server?: Server }>('/api/servers', { name: trimmedName });
        const createdServer = payload?.server ? normalizeServers([payload.server])[0] : null;

        if (createdServer) {
          setServers((prev) => [...prev, createdServer]);
          const defaultText = createdServer.channels.find((channel) => channel.type === 'text');
          if (defaultText) {
            setMessages((prev) => ({ ...prev, [defaultText.id]: prev[defaultText.id] || [] }));
            setActiveChannelId(defaultText.id);
            setActiveChannelType('text');
          } else if (createdServer.channels[0]) {
            setActiveChannelId(createdServer.channels[0].id);
            setActiveChannelType(createdServer.channels[0].type);
          }
          setActiveServerId(createdServer.id);
          setMobileTab('servers');
          void loadDiscoverServers();
          return true;
        }
      } catch {
        return false;
      }
      return false;
    }

    const serverId = makeId('s');
    const textId = defaultTextChannelId(serverId);
    const voiceId = defaultVoiceChannelId(serverId);
    const newServer: Server = {
      id: serverId,
      name: trimmedName,
      channels: [
        { id: textId, name: ui.defaultGeneral, type: 'text', slowModeSec: 0 },
        { id: voiceId, name: ui.defaultLobby, type: 'voice', userLimit: 0, bitrateKbps: 1200 },
      ],
    };

    setServers((prev) => [...prev, newServer]);
    setMessages((prev) => ({ ...prev, [textId]: prev[textId] || [] }));
    setActiveServerId(serverId);
    setActiveChannelId(textId);
    setActiveChannelType('text');
    setMobileTab('servers');
    return true;
  };

  const loadDiscoverServers = async (query = '') => {
    if (isLocalSession || !currentUser) {
      setDiscoverServers([]);
      return;
    }
    try {
      const payload = await apiGet<{ servers?: Array<{
        id: string;
        name: string;
        iconUrl?: string;
        description?: string;
        membersCount?: number;
      }> }>(`/api/servers/discover?q=${encodeURIComponent(query.trim())}&limit=30`);
      const next = Array.isArray(payload.servers)
        ? payload.servers
          .filter((server) => server?.id && server?.name)
          .map((server) => ({
            id: server.id,
            name: decodeMojibakeRu(server.name || ''),
            iconUrl: server.iconUrl || undefined,
            description: server.description ? decodeMojibakeRu(server.description) : undefined,
            membersCount: Number.isFinite(Number(server.membersCount)) ? Number(server.membersCount) : 0,
          }))
        : [];
      setDiscoverServers(next);
    } catch {
      setDiscoverServers([]);
    }
  };

  const handleJoinPublicServer = async (serverId: string) => {
    if (!serverId || isLocalSession) return;
    try {
      await apiPost(`/api/servers/${encodeURIComponent(serverId)}/join`, {});
      const sharedPayload = await apiGet<{ state?: SharedAppState }>('/api/shared-state');
      const sharedState = sharedPayload?.state;
      const nextServers = Array.isArray(sharedState?.servers) ? normalizeServers(sharedState.servers) : [];
      const nextMessages = sharedState?.messages && typeof sharedState.messages === 'object' ? sharedState.messages : {};
      if (nextServers.length > 0) {
        setServers(nextServers);
        setMessages((prev) => mergeMessageMaps(prev, nextMessages));
        const joinedServer = nextServers.find((server) => server.id === serverId);
        if (joinedServer) {
          selectServerAndDefaultChannel(serverId, joinedServer);
        }
      }
      await loadDiscoverServers();
    } catch {}
  };

  const handleSearchFriends = async (rawNickname: string): Promise<FriendSearchUser[]> => {
    const nickname = rawNickname.trim();
    if (!nickname || nickname.length < 2) return [];

    if (isLocalSession) {
      return [{
        id: localUserIdFromName(nickname),
        name: decodeMojibakeRu(nickname.slice(0, 32)),
      }];
    }

    try {
      const payload = await apiGet<{ users?: Array<{ id: string; name: string }> }>(
        `/api/users/search?q=${encodeURIComponent(nickname)}&limit=10`,
      );
      return Array.isArray(payload.users)
        ? payload.users
          .filter((user) => user?.id && user?.name)
          .map((user) => ({ id: user.id, name: decodeMojibakeRu(user.name) }))
        : [];
    } catch {
      return [];
    }
  };

  const loadFriendRequests = async () => {
    if (!currentUser || isLocalSession) {
      setIncomingFriendRequests([]);
      setOutgoingFriendRequests([]);
      return;
    }
    try {
      const payload = await apiGet<{
        incoming?: Array<{ id: string; user: { id: string; name: string } }>;
        outgoing?: Array<{ id: string; user: { id: string; name: string } }>;
      }>('/api/friends/requests');

      const mapRequests = (items: Array<{ id: string; user: { id: string; name: string } }> | undefined) => (
        Array.isArray(items)
          ? items
            .filter((item) => item?.id && item?.user?.id)
            .map((item) => ({
              id: item.id,
              user: { id: item.user.id, name: decodeMojibakeRu(item.user.name || '') },
            }))
          : []
      );

      setIncomingFriendRequests(mapRequests(payload.incoming));
      setOutgoingFriendRequests(mapRequests(payload.outgoing));
    } catch {
      setIncomingFriendRequests([]);
      setOutgoingFriendRequests([]);
    }
  };

  const ensureDmWithUser = (user: FriendSearchUser) => {
    const normalized = user.name.toLowerCase();
    const existing = dms.find((dm) => dm.userId === user.id || dm.userName.toLowerCase() === normalized);
    if (existing) {
      setActiveServerId('home');
      setActiveChannelId(existing.id);
      setActiveChannelType('text');
      setMobileTab('dms');
      return;
    }

    const newDm: DM = {
      id: makeId('dm'),
      userId: user.id,
      userName: user.name,
      lastMessage: isRu ? 'Диалог создан.' : 'Conversation started.',
      messages: [],
    };
    setDms((prev) => [newDm, ...prev]);
    setMessages((prev) => ({ ...prev, [newDm.id]: prev[newDm.id] || [] }));
    setActiveServerId('home');
    setActiveChannelId(newDm.id);
    setActiveChannelType('text');
    setMobileTab('dms');
  };

  const handleAddFriend = async (rawNickname: string, selectedUser?: FriendSearchUser) => {
    const nickname = rawNickname.trim();
    if (!nickname) return;
    const normalized = (selectedUser?.name || nickname).toLowerCase();
    const existing = dms.find((dm) => dm.userName.toLowerCase() === normalized);
    if (existing) {
      setActiveServerId('home');
      setActiveChannelId(existing.id);
      setActiveChannelType('text');
      setMobileTab('dms');
      return;
    }

    let friendId = '';
    let friendName = decodeMojibakeRu((selectedUser?.name || nickname).slice(0, 32));
    if (selectedUser?.id) friendId = selectedUser.id;

    if (isLocalSession) {
      if (!friendId) friendId = localUserIdFromName(friendName);
      ensureDmWithUser({ id: friendId, name: friendName });
      return;
    }

    if (!friendId) {
      try {
        const payload = await apiGet<{ user: { id: string; name: string } }>(`/api/users/find?name=${encodeURIComponent(nickname)}`);
        if (payload?.user?.id) {
          friendId = payload.user.id;
          friendName = decodeMojibakeRu(payload.user.name || friendName);
        }
      } catch {
        return;
      }
    }
    if (!friendId) return;

    try {
      await apiPost('/api/friends/requests', { toUserId: friendId });
      await loadFriendRequests();
    } catch {}
  };

  const handleAcceptFriendRequest = async (requestId: string, user: FriendSearchUser) => {
    if (isLocalSession) return;
    try {
      await apiPost(`/api/friends/requests/${encodeURIComponent(requestId)}/respond`, { action: 'accept' });
      ensureDmWithUser(user);
      await loadFriendRequests();
    } catch {}
  };

  const handleRejectFriendRequest = async (requestId: string) => {
    if (isLocalSession) return;
    try {
      await apiPost(`/api/friends/requests/${encodeURIComponent(requestId)}/respond`, { action: 'reject' });
      await loadFriendRequests();
    } catch {}
  };

  useEffect(() => {
    if (!currentUser || isLocalSession) return;
    void loadFriendRequests();
    const timer = window.setInterval(() => {
      void loadFriendRequests();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [currentUser?.id, isLocalSession]);

  useEffect(() => {
    if (!currentUser || isLocalSession) {
      setDiscoverServers([]);
      return;
    }
    void loadDiscoverServers();
    const timer = window.setInterval(() => {
      void loadDiscoverServers();
    }, 12000);
    return () => window.clearInterval(timer);
  }, [currentUser?.id, isLocalSession, servers.length]);

  const handleSendTextMessage = (content: string) => {
    if (!currentUser) return;
    const channel = getChannelById(activeChannelId);
    if (channel?.type === 'text' && channel.slowModeSec && channel.slowModeSec > 0) {
      const lastSent = lastSentAtByChannel[activeChannelId] || 0;
      const cooldownMs = channel.slowModeSec * 1000;
      const now = Date.now();
      if (now - lastSent < cooldownMs) {
        const waitSec = Math.ceil((cooldownMs - (now - lastSent)) / 1000);
        appendMessage(activeChannelId, {
          id: `sys-slow-${now}`,
          senderId: 'sys',
          senderName: ui.system,
          content: isRu ? `Включен slow mode. Подождите ${waitSec}с.` : `Slow mode is enabled. Wait ${waitSec}s.`,
          timestamp: now,
        });
        return;
      }
      setLastSentAtByChannel((prev) => ({ ...prev, [activeChannelId]: now }));
    }

    appendMessage(activeChannelId, {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderId: currentUser.id,
      senderName: currentUser.name,
      content,
      timestamp: Date.now(),
    });
    if (activeChannelId.startsWith('dm')) {
      const preview = content.slice(0, 80);
      setDms((prev) => prev.map((dm) => (
        dm.id === activeChannelId ? { ...dm, lastMessage: preview } : dm
      )));
    }
  };

  const handleTogglePinMessage = (channelId: string, messageId: string) => {
    setMessages((prev) => {
      const channelMessages = prev[channelId] || [];
      if (channelMessages.length === 0) return prev;
      const nextChannelMessages = channelMessages.map((message) => (
        message.id === messageId
          ? { ...message, isPinned: !message.isPinned }
          : message
      ));
      return { ...prev, [channelId]: nextChannelMessages };
    });
  };

  const handleSelectServer = (id: string) => {
    setActiveServerId(id);
    if (id === 'home') {
      setMobileTab('dms');
      if (!activeChannelId.startsWith('dm')) {
        if (dms.length > 0) {
          setActiveChannelId(dms[0].id);
        } else {
          setActiveChannelId('home');
        }
        setActiveChannelType('text');
      }
    } else {
      setMobileTab('servers');
      const server = servers.find((s) => s.id === id);
      if (server && server.channels.length > 0) {
        const defaultChannel = server.channels[0];
        setActiveChannelId(defaultChannel.id);
        setActiveChannelType(defaultChannel.type);
      }
    }
    setIsMobileSidebarVisible(true);
  };

  const handleSelectChannel = (id: string, type: 'text' | 'voice') => {
    setActiveChannelId(id);
    setActiveChannelType(type);
    setIsMobileSidebarVisible(false);
  };

  const openCreateChannelModal = (type: ChannelType) => {
    if (!activeServer || activeServerId === 'home') return;
    setChannelEditorMode('create');
    setChannelEditorType(type);
    setEditingChannelId(null);
    setIsChannelEditorOpen(true);
  };

  const openEditChannelModal = (channelId: string) => {
    if (!activeServer || activeServerId === 'home') return;
    const channel = activeServer.channels.find((item) => item.id === channelId);
    if (!channel) return;
    setChannelEditorMode('edit');
    setChannelEditorType(channel.type);
    setEditingChannelId(channelId);
    setIsChannelEditorOpen(true);
  };

  const handleMobileNav = (tab: 'servers' | 'dms' | 'profile') => {
    setMobileTab(tab);
    if (tab === 'profile') return;
    setIsMobileSidebarVisible(true);
    if (tab === 'servers') {
      if (activeServerId === 'home' && servers.length > 0) {
        const first = servers[0];
        if (first.channels.length > 0) {
          setActiveServerId(first.id);
          setActiveChannelId(first.channels[0].id);
          setActiveChannelType(first.channels[0].type);
        }
      }
    } else if (tab === 'dms') {
      if (activeServerId !== 'home') {
        setActiveServerId('home');
        if (dms.length > 0) {
          setActiveChannelId(dms[0].id);
        } else {
          setActiveChannelId('home');
        }
        setActiveChannelType('text');
      }
    }
  };

  const participants = useMemo<User[]>(() => {
    const local: User = {
      id: 'local',
      name: callDisplayName || ui.you,
      isMuted,
      isVideoOff,
      isScreenSharing,
      isSpeaking: false,
      role: 'host',
    };

    const remotes: User[] = Object.entries(remotePeers as Record<string, RemotePeerState>).map(([peerId, peer]) => ({
      id: peerId,
      name: peer.name || `${ui.peer} ${peerId.slice(-4)}`,
      isMuted: peer.isMuted,
      isVideoOff: peer.isVideoOff,
      isScreenSharing: peer.isScreenSharing,
      isSpeaking: false,
      role: 'guest',
    }));

    return [local, ...remotes];
  }, [callDisplayName, isMuted, isVideoOff, remotePeers, ui.you, ui.peer]);

  const remoteStreamsByPeerId = useMemo<Record<string, MediaStream | null>>(() => {
    const map: Record<string, MediaStream | null> = {};
    for (const [peerId, peer] of Object.entries(remotePeers as Record<string, RemotePeerState>)) {
      map[peerId] = peer.stream;
    }
    return map;
  }, [remotePeers]);

  const voiceParticipants = useMemo(() => {
    if (status !== CallStatus.CONNECTED || !callChannelId) return {};
    return { [callChannelId]: participants };
  }, [status, callChannelId, participants]);

  const activeServerInvites = useMemo(() => {
    if (!activeServer || activeServerId === 'home') return [] as InviteLink[];
    return Object.values(invites as Record<string, InviteLink>)
      .filter((invite) => invite.serverId === activeServer.id)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [invites, activeServer, activeServerId]);

  const resolveChannelName = (channelId: string) => {
    if (channelId.startsWith('dm')) {
      return dms.find((dm) => dm.id === channelId)?.userName || ui.directMessage;
    }
    for (const server of servers) {
      const channel = server.channels.find((c) => c.id === channelId);
      if (channel) return channel.name;
    }
    return ui.channel;
  };

  if (loading || isAuthBootstrapping) return <Preloader onFinish={() => setLoading(false)} />;
  const resolvedView: AppView = displayView === 'app' && !currentUser ? 'auth' : displayView;

  const currentContextName = activeServerId === 'home'
    ? dms.find((d) => d.id === activeChannelId)?.userName || ui.directMessage
    : servers.find((s) => s.id === activeServerId)?.channels.find((c) => c.id === activeChannelId)?.name || ui.channel;

  const callContextName = resolveChannelName(callChannelId || activeChannelId);
  const isFullScreenCall = status === CallStatus.CONNECTED && !isCallMinimized;
  const statusLabel = status === CallStatus.CONNECTED ? ui.statusLive : status === CallStatus.CONNECTING ? ui.statusMesh : ui.statusIdle;

  return (
    <div className={`bg-black min-h-screen w-full text-white font-sans overflow-hidden transition-all duration-700 pt-safe ${isTransitioning ? 'opacity-0 scale-105' : 'opacity-100 scale-100'}`}>
      {resolvedView === 'landing' && (
        <LandingPage
          onGetStarted={handleGetStarted}
          onNavigate={(page) => changeView(page)}
          lang={language}
          setLang={setLanguage}
        />
      )}

      {resolvedView === 'about' && <AboutPage onBack={() => changeView('landing')} lang={language} />}
      {resolvedView === 'donate' && <DonatePage onBack={() => changeView('landing')} lang={language} />}
      {resolvedView === 'auth' && (
        <AuthPage
          onComplete={handleLogin}
          onLocalLogin={ENABLE_LOCAL_UI_LOGIN ? handleLocalLogin : undefined}
          onBack={() => changeView('landing')}
          lang={language}
        />
      )}

      {resolvedView === 'app' && currentUser && (
        <div className="flex h-screen w-screen bg-background overflow-hidden relative">
          {inviteNotification && (
            <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-xl border backdrop-blur-xl shadow-2xl text-sm font-medium animate-in fade-in slide-in-from-top-4 duration-300 ${inviteNotification.ok ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-200' : 'bg-red-500/20 border-red-500/30 text-red-200'}`}>
              {inviteNotification.message}
            </div>
          )}
          <SettingsModal
            isOpen={isSettingsOpen || (mobileTab === 'profile')}
            onClose={() => { setIsSettingsOpen(false); setMobileTab(activeServerId === 'home' ? 'dms' : 'servers'); }}
            lang={language}
            currentUser={currentUser}
            settings={userSettings}
            onSaveSettings={handleSaveSettings}
            onChangeLanguage={handleChangeLanguage}
            onChangePassword={handleChangePassword}
            todos={todos}
            onAddTodo={handleAddTodo}
            onToggleTodo={handleToggleTodo}
            onRemoveTodo={handleRemoveTodo}
            onLogout={handleLogout}
          />
          <CreateServerModal isOpen={isCreateServerOpen} onClose={() => setIsCreateServerOpen(false)} onCreate={handleCreateServer} lang={language} />
          <FriendSearchModal
            isOpen={isFriendSearchOpen}
            onClose={() => setIsFriendSearchOpen(false)}
            onSearch={handleSearchFriends}
            onSubmit={async (nickname, selectedUser) => {
              await handleAddFriend(nickname, selectedUser);
              setIsFriendSearchOpen(false);
            }}
            incomingRequests={incomingFriendRequests}
            outgoingRequests={outgoingFriendRequests}
            onAcceptRequest={handleAcceptFriendRequest}
            onRejectRequest={handleRejectFriendRequest}
            lang={language}
          />
          <ChannelEditorModal
            isOpen={isChannelEditorOpen}
            mode={channelEditorMode}
            serverName={activeServer?.name || ui.defaultServer}
            initialType={channelEditorType}
            initialChannel={editingChannel}
            onClose={() => setIsChannelEditorOpen(false)}
            onCreate={handleCreateChannelFromDraft}
            onSave={handleSaveChannelFromDraft}
            onDelete={handleDeleteChannel}
          />
          <ServerAdminModal
            isOpen={isServerAdminOpen}
            server={activeServerId === 'home' ? null : activeServer}
            invites={activeServerId === 'home' ? Object.values(invites as Record<string, InviteLink>) : activeServerInvites}
            lang={language}
            onClose={() => setIsServerAdminOpen(false)}
            onSaveServer={handleSaveServer}
            onCreateInvite={createInvite}
            onRevokeInvite={revokeInvite}
            onJoinInvite={getInviteJoinResult}
          />

          <div className={`
            fixed md:relative z-40 h-full transition-transform duration-300 md:translate-x-0 bg-black
            ${isMobileSidebarVisible ? 'translate-x-0 w-full md:w-auto' : '-translate-x-full md:translate-x-0'}
            ${(mobileTab === 'servers' || mobileTab === 'dms') ? '' : 'hidden md:flex'}
          `}>
            <Sidebar
              activeServerId={activeServerId}
              activeChannelId={activeChannelId}
              onSelectServer={handleSelectServer}
              onSelectChannel={handleSelectChannel}
              onSelectDM={(id) => { setActiveServerId('home'); setActiveChannelId(id); setActiveChannelType('text'); setIsMobileSidebarVisible(false); }}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onCreateServer={() => setIsCreateServerOpen(true)}
              onAddFriend={() => setIsFriendSearchOpen(true)}
              onOpenServerAdmin={() => setIsServerAdminOpen(true)}
              onCreateChannel={openCreateChannelModal}
              onEditChannel={openEditChannelModal}
              onJoinByInvite={() => setIsServerAdminOpen(true)}
              servers={servers}
              discoverServers={discoverServers}
              onJoinPublicServer={handleJoinPublicServer}
              dms={dms}
              lang={language}
              currentUser={currentUser}
              voiceParticipants={voiceParticipants}
              hideOnlineStatus={userSettings.hideOnlineStatus}
            />
          </div>

          <div className={`flex-1 flex flex-col min-w-0 bg-[#000000] relative transition-all duration-300 ${isMobileSidebarVisible ? 'hidden md:flex' : 'flex'}`}>
            <div className="h-16 shrink-0 flex items-center px-4 justify-between bg-black/40 backdrop-blur-2xl border-b border-white/5 z-30">
              <div className="flex items-center gap-3">
                <button onClick={() => setIsMobileSidebarVisible(true)} className="md:hidden p-3 -ml-2 text-indigo-400 active:scale-90 transition-transform">
                  <LayoutGrid size={22} />
                </button>
                <div className="flex flex-col">
                  <span className="font-black text-xs uppercase tracking-tighter text-white/90 truncate max-w-[200px]">{currentContextName}</span>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1 h-1 rounded-full ${status === CallStatus.CONNECTED ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`} />
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">{statusLabel}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {status === CallStatus.IDLE && activeChannelType === 'voice' && (
                  <button onClick={handleStartCall} className="p-2 px-4 bg-emerald-500 text-white text-[10px] font-black uppercase rounded-full hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2">
                    <Zap size={12} fill="currentColor" />
                    {t.app.join_short}
                  </button>
                )}
                {activeServerId === 'home' && status === CallStatus.IDLE && (
                  <button onClick={handleStartCall} className="p-3 text-emerald-400 bg-emerald-500/10 rounded-2xl hover:bg-emerald-500/20 active:scale-90 transition-all">
                    <Phone size={20} />
                  </button>
                )}
                <button className="p-3 text-white/40 hover:text-white"><Hash size={20} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden relative z-0">
              {activeChannelType === 'voice' && status === CallStatus.IDLE && (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-24 h-24 rounded-full bg-zinc-900 border border-white/5 flex items-center justify-center mb-6">
                    <Zap size={32} className="text-zinc-500" />
                  </div>
                  <h2 className="text-lg font-bold text-white mb-2">{t.app.voice_channel}</h2>
                  <p className="text-zinc-500 text-xs mb-8">
                    {isRu ? 'Сигналинг Full Mesh P2P готов.' : 'Full Mesh P2P signaling ready.'}
                  </p>
                  {callError && <p className="text-red-400 text-xs mb-6">{callError}</p>}
                  <button onClick={handleStartCall} className="h-12 px-8 bg-emerald-500 text-white font-bold uppercase tracking-wider text-xs rounded-xl hover:scale-105 hover:bg-emerald-400 transition-all flex items-center gap-2">
                    <Phone size={18} fill="currentColor" />
                    {t.app.connect_big}
                  </button>
                </div>
              )}

              {(activeChannelType === 'text' || (status === CallStatus.CONNECTED && isCallMinimized)) && (
                <ChatChannel
                  channelName={currentContextName}
                  messages={messages[activeChannelId] || []}
                  currentUser={{ ...currentUser, isMuted: false, isVideoOff: false, isSpeaking: false, role: 'host' }}
                  onSendMessage={handleSendTextMessage}
                  onTogglePinMessage={(messageId) => handleTogglePinMessage(activeChannelId, messageId)}
                  lang={language}
                  isOverlay={false}
                  onToggleSidebar={() => setIsMobileSidebarVisible(true)}
                />
              )}
            </div>
          </div>

          {status === CallStatus.CONNECTED && !isCallMinimized && (
            <CallInterface
              status={status}
              participants={participants}
              localStream={localStream}
              localParticipantId="local"
              remoteStreamsByPeerId={remoteStreamsByPeerId}
              channelName={callContextName}
              onLeave={handleLeaveCall}
              onMinimize={() => setIsCallMinimized(true)}
              isMuted={isMuted}
              isVideoOff={isVideoOff}
              toggleMute={() => setIsMuted((prev) => !prev)}
              toggleVideo={() => setIsVideoOff((prev) => !prev)}
              isScreenSharing={isScreenSharing}
              onToggleScreenShare={() => void handleToggleScreenShare()}
              lang={language}
              audioOutputDeviceId={userSettings.outputDeviceId}
            />
          )}

          {status === CallStatus.CONNECTED && isCallMinimized && (
            <MiniCallWidget
              participants={participants}
              onExpand={() => setIsCallMinimized(false)}
              onLeave={handleLeaveCall}
              isMuted={isMuted}
              toggleMute={() => setIsMuted((prev) => !prev)}
              isVideoOff={isVideoOff}
              toggleVideo={() => setIsVideoOff((prev) => !prev)}
            />
          )}

          <MobileNav activeTab={mobileTab} setActiveTab={handleMobileNav} lang={language} isHidden={isFullScreenCall} />
        </div>
      )}
    </div>
  );
};

export default App;

