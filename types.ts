
export enum CallStatus {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ENDED = 'ENDED',
}

export type AppView = 'landing' | 'auth' | 'app' | 'donate' | 'about';
export type Language = 'en' | 'ru';

export interface User {
  id: string;
  name: string;
  avatarUrl?: string;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing?: boolean;
  isSpeaking: boolean;
  role: 'host' | 'guest';
}

export interface UserCredentials {
  name: string;
  password?: string;
  id: string;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export interface Reaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  reactions?: Reaction[];
  isPinned?: boolean;
}

export type ChannelType = 'text' | 'voice';

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  description?: string;
  isPrivate?: boolean;
  slowModeSec?: number; // text channels
  userLimit?: number; // voice channels, 0 or undefined = unlimited
  bitrateKbps?: number; // voice channels
}

export interface Server {
  id: string;
  name: string;
  iconUrl?: string;
  description?: string;
  channels: Channel[];
}

export interface DiscoverServer {
  id: string;
  name: string;
  iconUrl?: string;
  description?: string;
  membersCount: number;
}

export interface InviteLink {
  code: string;
  serverId: string;
  serverName?: string;
  createdAt: number;
  createdBy: string;
  expiresAt: number | null;
  maxUses: number | null;
  uses: number;
  revoked?: boolean;
  status?: 'active' | 'revoked' | 'expired' | 'used_up';
}

export interface DM {
  id: string;
  userId: string;
  userName: string;
  avatarUrl?: string;
  lastMessage?: string;
  messages: Message[];
}

export interface StreamState {
  stream: MediaStream | null;
  error: string | null;
}

export interface UserSettings {
  inputDeviceId: string;
  outputDeviceId: string;
  videoDeviceId: string;
  theme: 'dark' | 'light';
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  startMuted: boolean;
  startVideoOff: boolean;
  privacyMode: boolean;
  hideOnlineStatus: boolean;
}
