import React, { useEffect, useMemo, useState } from 'react';
import { X, Hash, Volume2, Sliders, Lock } from './Icon';
import { Channel, ChannelType } from '../types';

interface ChannelDraft {
  name: string;
  type: ChannelType;
  description?: string;
  isPrivate?: boolean;
  slowModeSec?: number;
  userLimit?: number;
  bitrateKbps?: number;
}

interface ChannelEditorModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  serverName: string;
  initialType?: ChannelType;
  initialChannel?: Channel | null;
  onClose: () => void;
  onCreate: (draft: ChannelDraft) => void;
  onSave: (channelId: string, draft: ChannelDraft) => void;
  onDelete: (channelId: string) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const ChannelEditorModal: React.FC<ChannelEditorModalProps> = ({
  isOpen,
  mode,
  serverName,
  initialType = 'text',
  initialChannel,
  onClose,
  onCreate,
  onSave,
  onDelete,
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<ChannelType>(initialType);
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [slowModeSec, setSlowModeSec] = useState(0);
  const [userLimit, setUserLimit] = useState(0);
  const [bitrateKbps, setBitrateKbps] = useState(1200);

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'edit' && initialChannel) {
      setName(initialChannel.name);
      setType(initialChannel.type);
      setDescription(initialChannel.description || '');
      setIsPrivate(Boolean(initialChannel.isPrivate));
      setSlowModeSec(initialChannel.slowModeSec || 0);
      setUserLimit(initialChannel.userLimit || 0);
      setBitrateKbps(initialChannel.bitrateKbps || 1200);
      return;
    }

    setName('');
    setType(initialType);
    setDescription('');
    setIsPrivate(false);
    setSlowModeSec(0);
    setUserLimit(0);
    setBitrateKbps(1200);
  }, [isOpen, mode, initialChannel?.id, initialType]);

  const title = useMemo(() => {
    if (mode === 'create') return `Create Channel in ${serverName}`;
    return `Channel Settings: ${initialChannel?.name || 'channel'}`;
  }, [mode, serverName, initialChannel?.name]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedName = name.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 32);
    if (!normalizedName) return;

    const draft: ChannelDraft = {
      name: normalizedName,
      type,
      description: description.trim().slice(0, 180),
      isPrivate,
      slowModeSec: type === 'text' ? clamp(Number(slowModeSec) || 0, 0, 120) : undefined,
      userLimit: type === 'voice' ? clamp(Number(userLimit) || 0, 0, 99) : undefined,
      bitrateKbps: type === 'voice' ? clamp(Number(bitrateKbps) || 1200, 100, 5000) : undefined,
    };

    if (mode === 'create') {
      onCreate(draft);
    } else if (initialChannel) {
      onSave(initialChannel.id, draft);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="w-full max-w-xl bg-[#09090b] border border-white/10 rounded-2xl shadow-2xl relative animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        <div className="px-6 pt-6 pb-4 border-b border-white/5">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <p className="text-xs text-zinc-500 mt-1">Configure behavior and technical limits.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={mode === 'edit'}
                  onClick={() => setType('text')}
                  className={`h-10 rounded-lg border text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                    type === 'text'
                      ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                  } ${mode === 'edit' ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <Hash size={14} />
                  Text
                </button>
                <button
                  type="button"
                  disabled={mode === 'edit'}
                  onClick={() => setType('voice')}
                  className={`h-10 rounded-lg border text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                    type === 'voice'
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                  } ${mode === 'edit' ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <Volume2 size={14} />
                  Voice
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Channel Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type === 'text' ? 'general' : 'lobby'}
                className="w-full h-10 bg-zinc-950 border border-zinc-800 rounded-md px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
              placeholder="Purpose, topic, or rules..."
            />
          </div>

          <div className="rounded-xl border border-white/10 bg-zinc-950/50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Sliders size={14} />
              Technical Settings
            </div>

            {type === 'text' && (
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Slowmode (seconds)</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={slowModeSec}
                  onChange={(e) => setSlowModeSec(clamp(Number(e.target.value) || 0, 0, 120))}
                  className="w-full h-10 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-sm text-white"
                />
              </div>
            )}

            {type === 'voice' && (
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">User limit (0 = unlimited)</label>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={userLimit}
                    onChange={(e) => setUserLimit(clamp(Number(e.target.value) || 0, 0, 99))}
                    className="w-full h-10 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-sm text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Video bitrate (kbps)</label>
                  <input
                    type="number"
                    min={100}
                    max={5000}
                    value={bitrateKbps}
                    onChange={(e) => setBitrateKbps(clamp(Number(e.target.value) || 1200, 100, 5000))}
                    className="w-full h-10 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-sm text-white"
                  />
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="accent-indigo-500"
              />
              <Lock size={14} />
              Private channel (invite-only visibility)
            </label>
          </div>

          <div className="flex items-center justify-between pt-2">
            {mode === 'edit' && initialChannel ? (
              <button
                type="button"
                onClick={() => {
                  onDelete(initialChannel.id);
                  onClose();
                }}
                className="h-10 px-4 rounded-md bg-red-500/15 text-red-300 text-sm font-semibold hover:bg-red-500/25 transition-all"
              >
                Delete Channel
              </button>
            ) : <span />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-md text-zinc-300 text-sm hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-10 px-5 rounded-md bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 transition-all"
              >
                {mode === 'create' ? 'Create Channel' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChannelEditorModal;
