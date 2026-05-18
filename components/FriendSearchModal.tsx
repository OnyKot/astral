import React, { useEffect, useState } from 'react';
import { X, Search, UserPlus } from './Icon';
import { Language } from '../types';

interface FriendSearchItem {
  id: string;
  name: string;
}

interface FriendRequestItem {
  id: string;
  user: FriendSearchItem;
}

interface FriendSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (nickname: string) => Promise<FriendSearchItem[]>;
  onSubmit: (nickname: string, selected?: FriendSearchItem) => Promise<void> | void;
  incomingRequests: FriendRequestItem[];
  outgoingRequests: FriendRequestItem[];
  onAcceptRequest: (requestId: string, user: FriendSearchItem) => Promise<void> | void;
  onRejectRequest: (requestId: string) => Promise<void> | void;
  lang: Language;
}

const FriendSearchModal: React.FC<FriendSearchModalProps> = ({
  isOpen,
  onClose,
  onSearch,
  onSubmit,
  incomingRequests,
  outgoingRequests,
  onAcceptRequest,
  onRejectRequest,
  lang,
}) => {
  const [nickname, setNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<FriendSearchItem[]>([]);
  const isRu = lang === 'ru';

  useEffect(() => {
    if (!isOpen) return;
    const query = nickname.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setSearching(true);
    onSearch(query)
      .then((items) => {
        if (!cancelled) setResults(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nickname, onSearch, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#09090b] shadow-2xl">
        <div className="h-14 px-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Search size={16} />
            <span className="text-sm font-bold">
              {isRu ? 'Поиск друга по нику' : 'Find friend by nickname'}
            </span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <label className="text-xs uppercase tracking-widest text-zinc-500">
            {isRu ? 'Ник пользователя' : 'Nickname'}
          </label>
          <input
            type="text"
            autoFocus
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={isRu ? 'Введите ник...' : 'Type nickname...'}
            className="w-full h-11 rounded-lg bg-black border border-white/10 px-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/60"
          />
          <div className="rounded-lg border border-white/10 bg-black/40 max-h-48 overflow-auto">
            {searching && (
              <div className="px-3 py-2 text-xs text-zinc-400">{isRu ? 'Поиск...' : 'Searching...'}</div>
            )}
            {!searching && results.length === 0 && nickname.trim().length >= 2 && (
              <div className="px-3 py-2 text-xs text-zinc-500">{isRu ? 'Никого не найдено' : 'No users found'}</div>
            )}
            {!searching && results.map((item) => (
              <button
                key={item.id}
                onClick={async () => {
                  setSubmitting(true);
                  try {
                    await onSubmit(item.name, item);
                    setNickname('');
                    setResults([]);
                  } finally {
                    setSubmitting(false);
                  }
                }}
                className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 flex items-center justify-between"
              >
                <span className="truncate">{item.name}</span>
                <span className="text-[10px] text-zinc-400">{item.id.slice(-6)}</span>
              </button>
            ))}
          </div>
          {(incomingRequests.length > 0 || outgoingRequests.length > 0) && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-widest text-zinc-500">
                {isRu ? 'Заявки в друзья' : 'Friend requests'}
              </div>
              {incomingRequests.map((request) => (
                <div key={request.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                  <span className="text-sm text-white truncate">{request.user.name}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => onAcceptRequest(request.id, request.user)}
                      className="h-8 px-3 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500"
                    >
                      {isRu ? 'Принять' : 'Accept'}
                    </button>
                    <button
                      onClick={async () => onRejectRequest(request.id)}
                      className="h-8 px-3 rounded bg-zinc-700 text-white text-xs font-semibold hover:bg-zinc-600"
                    >
                      {isRu ? 'Отклонить' : 'Decline'}
                    </button>
                  </div>
                </div>
              ))}
              {outgoingRequests.map((request) => (
                <div key={request.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                  <span className="text-sm text-zinc-300 truncate">{request.user.name}</span>
                  <span className="text-[11px] text-zinc-500">{isRu ? 'Отправлено' : 'Sent'}</span>
                </div>
              ))}
            </div>
          )}
          <button
            disabled={submitting || !nickname.trim()}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSubmit(nickname);
                setNickname('');
                setResults([]);
              } finally {
                setSubmitting(false);
              }
            }}
            className="w-full h-11 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <UserPlus size={16} />
            {submitting ? (isRu ? 'Добавление...' : 'Adding...') : (isRu ? 'Добавить в друзья' : 'Add friend')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FriendSearchModal;
