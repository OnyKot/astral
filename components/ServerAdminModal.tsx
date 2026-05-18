import React, { useEffect, useMemo, useState } from 'react';
import { X, Settings, Share2, Copy, Plus, Server, ExternalLink } from './Icon';
import { InviteLink, Language, Server as ServerType } from '../types';

interface JoinInviteResult {
  ok: boolean;
  message: string;
}

interface ServerAdminModalProps {
  isOpen: boolean;
  server: ServerType | null;
  invites: InviteLink[];
  lang: Language;
  onClose: () => void;
  onSaveServer: (serverId: string, patch: { name: string; description?: string; iconUrl?: string }) => void;
  onCreateInvite: (serverId: string, options: { expiresInHours: number | null; maxUses: number | null }) => Promise<string | null>;
  onRevokeInvite: (code: string) => Promise<void>;
  onJoinInvite: (code: string) => Promise<JoinInviteResult>;
}

const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString();

const inviteStatus = (invite: InviteLink) => {
  if (invite.revoked) return 'revoked';
  if (invite.expiresAt && invite.expiresAt <= Date.now()) return 'expired';
  if (invite.maxUses && invite.uses >= invite.maxUses) return 'used-up';
  return 'active';
};

const ServerAdminModal: React.FC<ServerAdminModalProps> = ({
  isOpen,
  server,
  invites,
  lang,
  onClose,
  onSaveServer,
  onCreateInvite,
  onRevokeInvite,
  onJoinInvite,
}) => {
  const isRu = lang === 'ru';
  const ui = {
    title: isRu ? 'Управление сервером' : 'Server Management',
    subtitle: isRu ? 'Настройка сервера и приглашений.' : 'Configure server settings and invites.',
    serverSettings: isRu ? 'Настройки сервера' : 'Server Settings',
    name: isRu ? 'Название' : 'Name',
    iconUrl: isRu ? 'Ссылка на иконку' : 'Icon URL',
    description: isRu ? 'Описание' : 'Description',
    saveServer: isRu ? 'Сохранить сервер' : 'Save Server',
    inviteLinks: isRu ? 'Приглашения' : 'Invite Links',
    expireHours: isRu ? 'Срок (часы)' : 'Expire (hours)',
    maxUses: isRu ? 'Лимит использований (0 = без лимита)' : 'Max uses (0 unlimited)',
    generateInvite: isRu ? 'Создать приглашение' : 'Generate Invite',
    copy: isRu ? 'Копировать' : 'Copy',
    code: isRu ? 'Код' : 'Code',
    noInvites: isRu ? 'Приглашений пока нет.' : 'No invite links yet.',
    created: isRu ? 'Создано' : 'Created',
    uses: isRu ? 'Использований' : 'Uses',
    status: isRu ? 'Статус' : 'Status',
    revoke: isRu ? 'Отозвать' : 'Revoke',
    selectServerFirst: isRu ? 'Сначала выберите сервер.' : 'Select a server first.',
    joinByCode: isRu ? 'Вход по коду приглашения' : 'Join by invite code',
    join: isRu ? 'Войти' : 'Join',
    placeholderCode: isRu ? 'Код приглашения' : 'Invite code',
    statusActive: isRu ? 'активно' : 'active',
    statusRevoked: isRu ? 'отозвано' : 'revoked',
    statusExpired: isRu ? 'истекло' : 'expired',
    statusUsedUp: isRu ? 'исчерпано' : 'used-up',
  };

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [maxUses, setMaxUses] = useState(0);
  const [createdCode, setCreatedCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinResult, setJoinResult] = useState<JoinInviteResult | null>(null);

  useEffect(() => {
    if (!isOpen || !server) return;
    setName(server.name);
    setDescription(server.description || '');
    setIconUrl(server.iconUrl || '');
    setCreatedCode('');
    setJoinCode('');
    setJoinResult(null);
  }, [isOpen, server?.id]);

  const shareUrl = useMemo(() => {
    if (!createdCode) return '';
    return `${window.location.origin}${window.location.pathname}?invite=${createdCode}`;
  }, [createdCode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[84] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden bg-[#09090b] border border-white/10 rounded-2xl shadow-2xl relative animate-in zoom-in-95 duration-200 flex flex-col">
        <button onClick={onClose} className="absolute top-4 right-4 z-10 text-gray-500 hover:text-white transition-colors">
          <X size={20} />
        </button>

        <div className="px-6 pt-6 pb-4 border-b border-white/5 bg-gradient-to-b from-indigo-500/10 to-transparent">
          <h2 className="text-lg font-bold text-white flex items-center gap-2 tracking-tight">
            <Server size={16} />
            {ui.title}
          </h2>
          <p className="text-xs text-zinc-500 mt-1">{ui.subtitle}</p>
        </div>

        <div className="overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {server ? (
            <>
              <section className="rounded-xl border border-white/10 bg-zinc-950/40 p-4 space-y-4">
                <div className="text-sm font-semibold text-white flex items-center gap-2">
                  <Settings size={14} />
                  {ui.serverSettings}
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{ui.name}</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full h-10 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{ui.iconUrl}</label>
                    <input
                      value={iconUrl}
                      onChange={(e) => setIconUrl(e.target.value)}
                      className="w-full h-10 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{ui.description}</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => onSaveServer(server.id, { name: name.trim().slice(0, 60), description: description.trim().slice(0, 200), iconUrl: iconUrl.trim().slice(0, 250) })}
                    className="h-10 px-4 rounded-md bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 transition-all"
                  >
                    {ui.saveServer}
                  </button>
                </div>
              </section>

              <section className="rounded-xl border border-white/10 bg-zinc-950/40 p-4 space-y-3">
                <div className="text-sm font-semibold text-white flex items-center gap-2">
                  <Share2 size={14} />
                  {ui.inviteLinks}
                </div>

                <div className="grid md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{ui.expireHours}</label>
                    <input
                      type="number"
                      min={0}
                      max={720}
                      value={expiresInHours}
                      onChange={(e) => setExpiresInHours(Math.max(0, Math.min(720, Number(e.target.value) || 0)))}
                      className="w-full h-10 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{ui.maxUses}</label>
                    <input
                      type="number"
                      min={0}
                      max={999}
                      value={maxUses}
                      onChange={(e) => setMaxUses(Math.max(0, Math.min(999, Number(e.target.value) || 0)))}
                      className="w-full h-10 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={async () => {
                        const code = await onCreateInvite(server.id, {
                          expiresInHours: expiresInHours > 0 ? expiresInHours : null,
                          maxUses: maxUses > 0 ? maxUses : null,
                        });
                        setCreatedCode(code || '');
                      }}
                      className="w-full h-10 rounded-md bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 transition-all flex items-center justify-center gap-2"
                    >
                      <Plus size={14} />
                      {ui.generateInvite}
                    </button>
                  </div>
                </div>

                {createdCode && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-emerald-200 font-mono truncate">{shareUrl}</div>
                      <div className="text-[11px] text-emerald-300/80">{ui.code}: {createdCode}</div>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(shareUrl);
                        } catch {}
                      }}
                      className="h-8 px-3 rounded-md bg-black/30 text-emerald-100 text-xs hover:bg-black/40 flex items-center gap-1"
                    >
                      <Copy size={12} />
                      {ui.copy}
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  {invites.length === 0 && <p className="text-xs text-zinc-500">{ui.noInvites}</p>}
                  {invites.map((invite) => {
                    const status = inviteStatus(invite);
                    const statusLabel = status === 'active'
                      ? ui.statusActive
                      : status === 'revoked'
                        ? ui.statusRevoked
                        : status === 'expired'
                          ? ui.statusExpired
                          : ui.statusUsedUp;
                    return (
                      <div key={invite.code} className="rounded-lg border border-white/10 bg-black/30 p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-white font-mono truncate">{invite.code}</div>
                          <div className="text-[11px] text-zinc-500">
                            {ui.created}: {formatDate(invite.createdAt)} | {ui.uses}: {invite.uses}{invite.maxUses ? `/${invite.maxUses}` : ''} | {ui.status}: {statusLabel}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={async () => {
                              const url = `${window.location.origin}${window.location.pathname}?invite=${invite.code}`;
                              try {
                                await navigator.clipboard.writeText(url);
                              } catch {}
                            }}
                            className="h-8 px-3 rounded-md bg-zinc-800 text-zinc-200 text-xs hover:bg-zinc-700 flex items-center gap-1"
                          >
                            <ExternalLink size={12} />
                            {ui.copy}
                          </button>
                          {!invite.revoked && (
                            <button
                              onClick={async () => { await onRevokeInvite(invite.code); }}
                              className="h-8 px-3 rounded-md bg-red-500/15 text-red-300 text-xs hover:bg-red-500/25"
                            >
                              {ui.revoke}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          ) : (
            <div className="rounded-xl border border-white/10 bg-zinc-950/40 p-4 text-sm text-zinc-300">
              {ui.selectServerFirst}
            </div>
          )}

          <section className="rounded-xl border border-white/10 bg-zinc-950/40 p-4 space-y-3">
            <div className="text-sm font-semibold text-white">{ui.joinByCode}</div>
            <div className="flex gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="flex-1 h-10 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-sm text-white"
                placeholder={ui.placeholderCode}
              />
              <button
                onClick={async () => setJoinResult(await onJoinInvite(joinCode.trim()))}
                className="h-10 px-4 rounded-md bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500"
              >
                {ui.join}
              </button>
            </div>
            {joinResult && (
              <p className={`text-xs ${joinResult.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                {joinResult.message}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default ServerAdminModal;

