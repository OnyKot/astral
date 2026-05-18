import React, { useState } from 'react';
import { Hash, Volume2, Command, Settings, Plus, MessageSquare, Search, UserPlus } from './Icon';
import { Language, Server, DM, User, DiscoverServer } from '../types';
import { translations } from '../translations';

interface SidebarProps {
  activeServerId: string;
  activeChannelId: string;
  onSelectServer: (id: string) => void;
  onSelectChannel: (id: string, type: 'text' | 'voice') => void;
  onSelectDM: (id: string) => void;
  onOpenSettings: () => void;
  onCreateServer: () => void;
  onAddFriend?: () => void;
  onOpenServerAdmin: () => void;
  onCreateChannel: (type: 'text' | 'voice') => void;
  onEditChannel: (channelId: string) => void;
  onJoinByInvite: () => void;
  onJoinPublicServer?: (id: string) => Promise<void> | void;
  servers: Server[];
  discoverServers?: DiscoverServer[];
  dms: DM[];
  lang: Language;
  currentUser: { name: string; id?: string };
  voiceParticipants?: Record<string, User[]>;
  hideOnlineStatus?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  activeServerId, 
  activeChannelId, 
  onSelectServer, 
  onSelectChannel, 
  onSelectDM,
  onOpenSettings, 
  onCreateServer,
  onAddFriend,
  onOpenServerAdmin,
  onCreateChannel,
  onEditChannel,
  onJoinByInvite,
  onJoinPublicServer,
  servers,
  discoverServers = [],
  dms,
  lang,
  currentUser,
  voiceParticipants = {},
  hideOnlineStatus = false,
}) => {
  const t = translations[lang];
  const isRu = lang === 'ru';
  const ui = {
    servers: isRu ? 'Серверы' : 'Servers',
    discoverServers: isRu ? 'Найти серверы' : 'Discover servers',
    friends: isRu ? 'Друзья' : 'Friends',
    noServers: isRu ? 'Серверы не найдены.' : 'No servers found.',
    noDiscoverServers: isRu ? 'Новых серверов не найдено.' : 'No discoverable servers.',
    noFriends: isRu ? 'Друзья не найдены.' : 'No friends found.',
    noText: isRu ? 'Текстовые каналы не найдены.' : 'No text channels found.',
    noVoice: isRu ? 'Голосовые каналы не найдены.' : 'No voice channels found.',
    joinByInvite: isRu ? 'Войти по приглашению' : 'Join by invite',
    createText: isRu ? 'Создать текстовый канал' : 'Create text channel',
    createVoice: isRu ? 'Создать голосовой канал' : 'Create voice channel',
    joinServer: isRu ? 'Вступить' : 'Join',
    serverSettings: isRu ? 'Настройки сервера' : 'Server settings',
    channelSettings: isRu ? 'Настройки канала' : 'Channel settings',
  };
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const shortUserId = currentUser.id ? currentUser.id.slice(-6) : '000000';

  const copyMyProfile = async () => {
    const profile = `${currentUser.name}\nID: ${currentUser.id || 'n/a'}`;
    try {
      await navigator.clipboard.writeText(profile);
    } catch {}
  };

  const activeServer = servers.find(s => s.id === activeServerId);
  const filteredServers = normalizedQuery
    ? servers.filter((server) => server.name.toLowerCase().includes(normalizedQuery))
    : servers;
  const filteredDiscoverServers = normalizedQuery
    ? discoverServers.filter((server) => (
      server.name.toLowerCase().includes(normalizedQuery)
      || (server.description || '').toLowerCase().includes(normalizedQuery)
    ))
    : discoverServers;
  const filteredDms = dms.filter(dm => {
    if (!normalizedQuery) return true;
    return (
      dm.userName.toLowerCase().includes(normalizedQuery) ||
      dm.userId.toLowerCase().includes(normalizedQuery) ||
      (dm.lastMessage || '').toLowerCase().includes(normalizedQuery)
    );
  });
  const filteredTextChannels = activeServer?.channels.filter((channel) => {
    if (channel.type !== 'text') return false;
    if (!normalizedQuery) return true;
    return channel.name.toLowerCase().includes(normalizedQuery);
  }) || [];
  const filteredVoiceChannels = activeServer?.channels.filter((channel) => {
    if (channel.type !== 'voice') return false;
    if (!normalizedQuery) return true;
    return channel.name.toLowerCase().includes(normalizedQuery);
  }) || [];
  
  const ServerIcon = ({ server }: { server: Server, key?: React.Key }) => (
    <div 
        onClick={() => onSelectServer(server.id)}
        className="group relative w-12 h-12 cursor-pointer touch-none active:scale-95 transition-all duration-300"
    >
       {/* Active Marker */}
       <div className={`
         absolute left-[-16px] top-1/2 -translate-y-1/2 w-1.5 bg-white rounded-r-lg transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
         ${activeServerId === server.id ? 'h-8 opacity-100' : 'h-2 opacity-0 md:group-hover:opacity-100 md:group-hover:h-5'}
       `} />
       
       <div className={`
         w-full h-full rounded-[24px] flex items-center justify-center text-gray-400 transition-all duration-300 overflow-hidden shadow-lg border border-transparent
         ${activeServerId === server.id 
            ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-[16px] shadow-indigo-500/20' 
            : 'bg-[#18181b] md:group-hover:bg-indigo-600 md:group-hover:text-white md:group-hover:rounded-[16px] group-hover:border-white/10'}
       `}>
          {server.iconUrl ? (
             <img src={server.iconUrl} alt={server.name} className="w-full h-full object-cover" />
          ) : (
             <span className="font-bold text-sm font-mono">{server.name.substring(0, 2).toUpperCase()}</span>
          )}
       </div>
    </div>
  );

  return (
    <div className="flex h-full w-full sm:w-auto bg-black">
      {/* ---------------- SERVER RAIL ---------------- */}
      <div className="w-[72px] h-full bg-[#050505] border-r border-white/5 flex flex-col items-center py-4 gap-3 no-scrollbar overflow-y-auto pb-32 md:pb-4 z-20">
        <div 
            onClick={() => onSelectServer('home')}
            className="group relative w-12 h-12 cursor-pointer active:scale-90 transition-transform flex-shrink-0"
        >
             <div className={`absolute left-[-16px] top-1/2 -translate-y-1/2 w-1.5 bg-white rounded-r-lg transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${activeServerId === 'home' ? 'h-8 opacity-100' : 'h-2 opacity-0 group-hover:h-4 group-hover:opacity-100'}`} />
             <div className={`w-full h-full rounded-[24px] flex items-center justify-center transition-all duration-300 ${activeServerId === 'home' ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white rounded-[16px] shadow-indigo-500/20' : 'bg-[#18181b] text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white group-hover:rounded-[16px]'}`}>
                <Command size={22} />
             </div>
        </div>
        
        <div className="w-8 h-[2px] bg-white/5 rounded-full flex-shrink-0 my-1" />
        
        {filteredServers.map(server => <ServerIcon key={server.id} server={server} />)}

        <div
          onClick={onJoinByInvite}
          className="w-12 h-12 bg-[#18181b] hover:bg-blue-500/10 hover:text-blue-400 border border-transparent hover:border-blue-500/20 rounded-[24px] hover:rounded-[16px] active:scale-90 transition-all cursor-pointer flex items-center justify-center text-blue-500 flex-shrink-0"
          title={ui.joinByInvite}
        >
          <UserPlus size={22} />
        </div>

        <div onClick={onCreateServer} className="w-12 h-12 bg-[#18181b] hover:bg-emerald-500/10 hover:text-emerald-500 border border-transparent hover:border-emerald-500/20 rounded-[24px] hover:rounded-[16px] active:scale-90 transition-all cursor-pointer flex items-center justify-center text-emerald-600 flex-shrink-0 mt-2">
            <Plus size={24} />
        </div>
      </div>

      {/* ---------------- CHANNEL/DM LIST ---------------- */}
      <div className="flex-1 md:w-64 bg-[#09090b] flex flex-col z-10 w-full min-w-0">
        {/* Header */}
        <div className="h-14 border-b border-white/5 flex items-center px-4 justify-between bg-black/20 flex-shrink-0 shadow-sm backdrop-blur-sm">
          <span className="font-black text-sm tracking-tight text-white uppercase truncate flex items-center gap-2">
            {activeServerId === 'home' ? (
              <>
                <MessageSquare size={16} className="text-indigo-400" />
                {t.sidebar.direct_messages}
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                {activeServer?.name}
              </>
            )}
          </span>

          {activeServerId !== 'home' ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onCreateChannel('text')}
                className="w-8 h-8 rounded-md bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center"
                title={ui.createText}
              >
                <Hash size={14} />
              </button>
              <button
                onClick={() => onCreateChannel('voice')}
                className="w-8 h-8 rounded-md bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center"
                title={ui.createVoice}
              >
                <Volume2 size={14} />
              </button>
              <button
                onClick={onOpenServerAdmin}
                className="w-8 h-8 rounded-md bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center"
                title={ui.serverSettings}
              >
                <Settings size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={onJoinByInvite}
              className="w-8 h-8 rounded-md bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center"
              title={ui.joinByInvite}
            >
              <UserPlus size={14} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4 px-2.5 space-y-6 custom-scrollbar pb-32 md:pb-4">
          <div className="px-1">
            <div className="relative group flex items-center gap-2">
              <input
                type="text"
                placeholder={t.sidebar.search_placeholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 bg-[#18181b] rounded-md pl-9 pr-4 text-xs text-white placeholder:text-zinc-500 border border-transparent focus:border-indigo-500/50 focus:bg-black focus:outline-none transition-all"
              />
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-indigo-500 transition-colors" />
              {activeServerId === 'home' && (
                <button
                  onClick={onAddFriend}
                  className="w-9 h-9 rounded-md bg-[#18181b] border border-white/10 text-zinc-300 hover:text-white hover:bg-white/10 flex items-center justify-center"
                  title={isRu ? 'Добавить друга по нику' : 'Add friend by nickname'}
                >
                  <UserPlus size={14} />
                </button>
              )}
            </div>
          </div>

          {activeServerId === 'home' && (
             <div className="space-y-1">
                 <div className="px-2 mb-1 text-[10px] font-black text-zinc-500 uppercase tracking-widest">{ui.servers}</div>
                 {filteredServers.map((server) => (
                    <div
                      key={`search-server-${server.id}`}
                      onClick={() => onSelectServer(server.id)}
                      className={`flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer active:scale-[0.98] transition-all group ${activeServerId === server.id ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'}`}
                    >
                      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300">
                        {server.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="text-sm font-medium truncate">{server.name}</div>
                    </div>
                 ))}
                 {filteredServers.length === 0 && (
                   <div className="px-2.5 py-2 text-xs text-zinc-500">{ui.noServers}</div>
                 )}

                 <div className="px-2 mt-5 mb-1 text-[10px] font-black text-zinc-500 uppercase tracking-widest">{ui.discoverServers}</div>
                 {filteredDiscoverServers.map((server) => (
                    <div
                      key={`discover-server-${server.id}`}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/[0.02] border border-white/5"
                    >
                      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300">
                        {server.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-zinc-200 truncate">{server.name}</div>
                        <div className="text-[10px] text-zinc-500 truncate">
                          {isRu ? 'Участников' : 'Members'}: {server.membersCount}
                        </div>
                      </div>
                      <button
                        onClick={async () => { await onJoinPublicServer?.(server.id); }}
                        className="h-7 px-2 rounded-md bg-emerald-600/20 text-emerald-300 border border-emerald-500/20 text-[11px] font-semibold hover:bg-emerald-600/30"
                      >
                        {ui.joinServer}
                      </button>
                    </div>
                 ))}
                 {filteredDiscoverServers.length === 0 && (
                   <div className="px-2.5 py-2 text-xs text-zinc-500">{ui.noDiscoverServers}</div>
                 )}

                 <div className="px-2 mt-5 mb-1 text-[10px] font-black text-zinc-500 uppercase tracking-widest">{ui.friends}</div>
                 {filteredDms.map(dm => (
                    <div 
                        key={dm.id}
                        onClick={() => onSelectDM(dm.id)}
                        className={`flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer active:scale-[0.98] transition-all group ${activeChannelId === dm.id ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'}`}
                    >
                        <div className="relative flex-shrink-0">
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400 group-hover:text-white transition-colors">
                                {dm.userName.charAt(0)}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#09090b]"></div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{dm.userName}</div>
                            <div className="text-[10px] opacity-60 truncate font-medium">{dm.lastMessage}</div>
                        </div>
                    </div>
                 ))}
                 {filteredDms.length === 0 && (
                    <div className="px-2.5 py-2 text-xs text-zinc-500">{ui.noFriends}</div>
                 )}
             </div>
          )}

          {activeServerId !== 'home' && activeServer && (
             <div className="space-y-6">
                {/* Text Channels */}
                <div>
                    <div className="flex items-center justify-between px-2 mb-1.5 group cursor-pointer hover:text-zinc-300 transition-colors">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                            <Settings size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            {t.sidebar.text_channels}
                        </span>
                        <button
                          onClick={() => onCreateChannel('text')}
                          className="text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white"
                          title={ui.createText}
                        >
                          <Plus size={12} />
                        </button>
                    </div>
                    <div className="space-y-0.5">
                        {filteredTextChannels.map((ch) => (
                            <div 
                            key={ch.id} 
                            onClick={() => onSelectChannel(ch.id, 'text')}
                            className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-all mx-1 group ${activeChannelId === ch.id ? 'bg-indigo-500/10 text-white shadow-sm' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'}`}
                            >
                              <div className="flex items-center min-w-0">
                                <Hash size={16} className={`mr-2 ${activeChannelId === ch.id ? 'text-indigo-400' : 'text-zinc-600'}`} />
                                <span className="text-sm font-medium truncate">{ch.name}</span>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); onEditChannel(ch.id); }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-500 hover:text-white hover:bg-white/10"
                                title={ui.channelSettings}
                              >
                                <Settings size={12} />
                              </button>
                            </div>
                        ))}
                        {filteredTextChannels.length === 0 && (
                          <div className="px-3 py-2 text-xs text-zinc-500">{ui.noText}</div>
                        )}
                    </div>
                </div>
                
                {/* Voice Channels */}
                <div>
                    <div className="flex items-center justify-between px-2 mb-1.5">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t.sidebar.voice_channels}</span>
                        <button
                          onClick={() => onCreateChannel('voice')}
                          className="text-zinc-500 hover:text-white"
                          title={ui.createVoice}
                        >
                          <Plus size={12} />
                        </button>
                    </div>
                    <div className="space-y-1">
                        {filteredVoiceChannels.map((ch) => {
                            const participants = voiceParticipants[ch.id] || [];
                            const hasParticipants = participants.length > 0;
                            const isActive = activeChannelId === ch.id;
                            
                            return (
                            <div key={ch.id}>
                                <div 
                                    onClick={() => onSelectChannel(ch.id, 'voice')}
                                    className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-all mx-1 border border-transparent group ${isActive ? 'bg-indigo-500/10 text-white border-indigo-500/20' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'}`}
                                >
                                    <div className="flex items-center overflow-hidden">
                                        <Volume2 size={16} className={`mr-2 flex-shrink-0 ${hasParticipants ? 'text-green-500' : (isActive ? 'text-indigo-400' : 'text-zinc-600')}`} />
                                        <span className="text-sm font-medium truncate">{ch.name}</span>
                                    </div>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); onEditChannel(ch.id); }}
                                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-500 hover:text-white hover:bg-white/10"
                                      title={ui.channelSettings}
                                    >
                                      <Settings size={12} />
                                    </button>
                                </div>
                                
                                {/* Active Voice Participants */}
                                {hasParticipants && (
                                    <div className="ml-8 mr-2 mt-1 mb-2 space-y-1">
                                        {participants.map(p => (
                                            <div key={p.id} className="flex items-center gap-2 py-1 px-2 rounded bg-black/40 border border-white/5">
                                                <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-[8px] font-bold text-white shadow-sm">
                                                    {p.name[0]}
                                                </div>
                                                <span className="text-xs text-zinc-300 font-medium truncate">{p.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            );
                        })}
                        {filteredVoiceChannels.length === 0 && (
                          <div className="px-3 py-2 text-xs text-zinc-500">{ui.noVoice}</div>
                        )}
                    </div>
                </div>
            </div>
          )}
        </div>

        {/* User Footer - Desktop Only */}
        <div className="hidden md:flex h-14 bg-[#050505] border-t border-white/5 items-center px-3 gap-2.5 flex-shrink-0">
          <div className="relative group cursor-pointer" onClick={copyMyProfile} title={isRu ? 'Нажми, чтобы скопировать профиль' : 'Click to copy profile'}>
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 border border-white/10 shadow-lg group-hover:scale-105 transition-transform" />
              {!hideOnlineStatus && (
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#050505]"></div>
              )}
          </div>
          <div className="flex-1 min-w-0 cursor-pointer" onClick={copyMyProfile}>
            <div className="text-xs font-bold text-white truncate group-hover:underline">{currentUser.name}</div>
            <div className="text-[9px] text-zinc-500 font-mono tracking-wide">#{shortUserId}</div>
          </div>
          <div className="flex items-center">
            <button onClick={onOpenSettings} className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-all">
                <Settings size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;

