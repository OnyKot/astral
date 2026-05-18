export type SignalType = "offer" | "answer" | "ice" | "bye";

export interface SignalingPeer {
  peerId: string;
  name?: string;
}

export interface JoinRoomResponse {
  roomId: string;
  peerId: string;
  peers: SignalingPeer[];
}

export interface PollRoomResponse {
  signals: Array<{
    roomId: string;
    from: string;
    type: SignalType;
    payload: unknown;
  }>;
  peers: SignalingPeer[];
}

const API_PREFIX = "/api";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const text = await response.text();
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }

  if (!response.ok) {
    const reason = typeof data?.error === "string" ? data.error : `http_${response.status}`;
    throw new Error(reason);
  }

  return data as T;
}

export function toSignalingRoomId(channelId: string): string {
  const normalized = (channelId || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return normalized || "room";
}

export function joinRoom(roomId: string, peerId: string, name: string): Promise<JoinRoomResponse> {
  return requestJson<JoinRoomResponse>(`/rooms/${encodeURIComponent(roomId)}/join`, {
    method: "POST",
    body: JSON.stringify({ peerId, name }),
  });
}

export function leaveRoom(roomId: string, peerId: string): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>(`/rooms/${encodeURIComponent(roomId)}/leave`, {
    method: "POST",
    body: JSON.stringify({ peerId }),
  });
}

export function sendRoomSignal(
  roomId: string,
  packet: { from: string; to: string; type: SignalType; payload: unknown },
): Promise<{ accepted: boolean }> {
  return requestJson<{ accepted: boolean }>(`/rooms/${encodeURIComponent(roomId)}/signal`, {
    method: "POST",
    body: JSON.stringify(packet),
  });
}

export function pollRoom(roomId: string, peerId: string): Promise<PollRoomResponse> {
  return requestJson<PollRoomResponse>(
    `/rooms/${encodeURIComponent(roomId)}/poll?peerId=${encodeURIComponent(peerId)}`,
    { method: "GET" },
  );
}
