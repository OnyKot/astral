import React, { useState, useEffect, useRef } from 'react';
import { Send, Hash, Plus, Smile, Pin, Menu, Zap, Reply, Copy, CornerDownRight } from './Icon';
import { Message, User } from '../types';
import { translations } from '../translations';

interface ChatChannelProps {
  channelName: string;
  messages: Message[];
  currentUser: User;
  onSendMessage: (content: string) => void;
  onTogglePinMessage?: (messageId: string) => void;
  lang: 'en' | 'ru';
  onToggleSidebar?: () => void;
  isOverlay?: boolean;
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_MESSAGE_PREFIX = '__img__:';
const EMOJI_SET = ['😀', '😁', '😂', '😋', '🙂', '😉', '😍', '🤔', '👍', '🔥', '🎉', '❤️'];

function isImageDataUrl(value: string) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);
}

function extractImageFromMessage(content: string) {
  if (!content.startsWith(IMAGE_MESSAGE_PREFIX)) return null;
  const imageData = content.slice(IMAGE_MESSAGE_PREFIX.length).trim();
  return isImageDataUrl(imageData) ? imageData : null;
}

const ChatChannel: React.FC<ChatChannelProps> = ({
  channelName,
  messages,
  currentUser,
  onSendMessage,
  onTogglePinMessage,
  lang,
  onToggleSidebar,
  isOverlay = false,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isDragOverComposer, setIsDragOverComposer] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [actionNotice, setActionNotice] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const touchStartX = useRef<number | null>(null);
  const t = translations[lang];
  const isRu = lang === 'ru';
  const pinnedMessages = messages.filter((message) => message.isPinned && message.senderId !== 'sys');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isEmojiPickerOpen) return;
    const closePickerOnOutsideClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (!composerRef.current?.contains(event.target)) {
        setIsEmojiPickerOpen(false);
      }
    };
    window.addEventListener('mousedown', closePickerOnOutsideClick);
    return () => window.removeEventListener('mousedown', closePickerOnOutsideClick);
  }, [isEmojiPickerOpen]);

  const flashNotice = (text: string) => {
    setActionNotice(text);
    window.setTimeout(() => setActionNotice(''), 1600);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flashNotice(isRu ? 'Скопировано.' : 'Copied.');
    } catch {
      flashNotice(isRu ? 'Не удалось скопировать.' : 'Copy failed.');
    }
  };

  const buildUserCard = (message: Message) => `${message.senderName}\nID: ${message.senderId}`;

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    const message = inputValue.trim();
    if (!message) return;
    const payload = replyTo
      ? `${isRu ? 'Ответ' : 'Reply'} ${replyTo.senderName}: ${replyTo.content.slice(0, 120)}\n${message}`
      : message;
    onSendMessage(payload);
    setInputValue('');
    setIsEmojiPickerOpen(false);
    setReplyTo(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchEndX - touchStartX.current;
    if (diff > 50 && onToggleSidebar) {
      onToggleSidebar();
    }
    touchStartX.current = null;
  };

  const sendImageAsMessage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      window.alert(isRu ? 'Можно отправлять только изображения.' : 'Only image files are supported.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      window.alert(isRu ? 'Максимальный размер изображения: 3 MB.' : 'Maximum image size is 3 MB.');
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('file_read_failed'));
      reader.readAsDataURL(file);
    });

    if (!isImageDataUrl(dataUrl)) {
      window.alert(isRu ? 'Не удалось прочитать изображение.' : 'Could not read the image.');
      return;
    }

    onSendMessage(`${IMAGE_MESSAGE_PREFIX}${dataUrl}`);
    setIsEmojiPickerOpen(false);
  };

  const handleImagePick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const pickedFile = event.target.files?.[0];
    event.target.value = '';
    if (!pickedFile) return;
    await sendImageAsMessage(pickedFile);
  };

  const handleComposerDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    const dragTypes = Array.from(event.dataTransfer.types || []);
    if (!dragTypes.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragOverComposer(true);
  };

  const handleComposerDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragOverComposer(false);
    }
  };

  const handleComposerDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    const dragTypes = Array.from(event.dataTransfer.types || []);
    if (!dragTypes.includes('Files')) return;
    event.preventDefault();
    setIsDragOverComposer(false);
    const files = event.dataTransfer.files;
    let droppedFile: File | null = null;
    for (let idx = 0; idx < files.length; idx += 1) {
      const file = files.item(idx);
      if (file && file.type.startsWith('image/')) {
        droppedFile = file;
        break;
      }
    }
    if (!droppedFile) return;
    await sendImageAsMessage(droppedFile);
  };

  return (
    <div
      className={`flex flex-col h-full relative ${isOverlay ? 'bg-transparent' : 'bg-[#050505]'}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {!isOverlay && (
        <div className="h-14 shrink-0 border-b border-white/5 flex items-center px-4 justify-between bg-black/60 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={onToggleSidebar}
              className="md:hidden p-2 -ml-2 text-zinc-400 hover:text-white active:scale-90 transition-transform"
            >
              <Menu size={20} />
            </button>

            <div className="flex items-center gap-2.5">
              <Hash size={20} className="text-zinc-500" />
              <span className="font-bold text-white tracking-tight truncate max-w-[200px]">{channelName}</span>
              <span className="hidden md:inline-block px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400 font-mono">TEXT</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button className="text-zinc-500 hover:text-white transition-colors">
              <Pin size={20} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {pinnedMessages.length > 0 && (
          <div className="mb-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-indigo-300">
              <Pin size={12} />
              {isRu ? 'Закрепленные' : 'Pinned'}
            </div>
            <div className="space-y-1.5">
              {pinnedMessages.slice(-3).map((message) => (
                <button
                  key={`pinned-${message.id}`}
                  type="button"
                  onClick={() => copyToClipboard(buildUserCard(message))}
                  className="w-full rounded-lg bg-black/30 px-2.5 py-2 text-left text-xs text-zinc-200 hover:bg-black/50"
                >
                  <span className="font-semibold">{message.senderName}: </span>
                  <span className="opacity-80">{message.content.slice(0, 120)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full opacity-40 select-none animate-in fade-in zoom-in-95 duration-500">
            <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center mb-6 rotate-3">
              <Hash size={40} className="text-zinc-500" />
            </div>
            <h3 className="text-2xl font-bold mb-2">{isRu ? `Добро пожаловать в #${channelName}` : `Welcome to #${channelName}`}</h3>
            <p className="text-center text-sm text-zinc-500 max-w-xs">
              {isRu ? `Это начало канала #${channelName}. Напишите первое сообщение.` : `This is the start of #${channelName}. Say hello.`}
            </p>
          </div>
        )}

        <div className="flex flex-col justify-end min-h-0 space-y-0.5">
          {messages.map((msg, idx) => {
            const isSystem = msg.senderId === 'sys';
            const showHeader = !isSystem && (idx === 0 || messages[idx - 1].senderId !== msg.senderId || (msg.timestamp - messages[idx - 1].timestamp > 60000));
            const imagePayload = extractImageFromMessage(msg.content);
            const textPayload = imagePayload ? '' : msg.content;
            const mentionToken = `@${currentUser.name}`.toLowerCase();
            const hasMention = Boolean(textPayload && textPayload.toLowerCase().includes(mentionToken));

            if (isSystem) {
              return (
                <div key={msg.id} className="flex items-center gap-4 py-4 px-4 my-2 opacity-70 hover:opacity-100 transition-opacity">
                  <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                  <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                    <Zap size={12} className="text-green-500" />
                    <span>{msg.content}</span>
                    <span className="text-zinc-600">[{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]</span>
                  </div>
                  <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`relative flex gap-3 group px-2 py-0.5 -mx-2 rounded hover:bg-white/5 transition-colors ${showHeader ? 'mt-4 pt-1' : ''}`}
                onMouseEnter={() => setHoveredMessageId(msg.id)}
                onMouseLeave={() => setHoveredMessageId(null)}
              >
                {showHeader ? (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(buildUserCard(msg))}
                    className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-700 text-white shadow-lg shadow-indigo-500/10 flex items-center justify-center flex-shrink-0 font-bold text-sm cursor-pointer hover:scale-105 transition-transform mt-0.5"
                  >
                    {msg.senderName.slice(0, 2).toUpperCase()}
                  </button>
                ) : (
                  <div className="w-9 flex-shrink-0 text-[10px] text-zinc-600 opacity-0 group-hover:opacity-100 flex items-center justify-center select-none pt-1 font-mono">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}

                <div className="flex-1 min-w-0 overflow-hidden">
                  {showHeader && (
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(buildUserCard(msg))}
                        className="font-bold text-sm text-zinc-200 hover:underline cursor-pointer tracking-wide"
                      >
                        {msg.senderName}
                      </button>
                      <span className="text-[10px] text-zinc-500 font-medium">
                        {new Date(msg.timestamp).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {textPayload && (
                    <div className={`text-[15px] leading-relaxed whitespace-pre-wrap break-words ${hasMention ? 'text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1' : 'text-zinc-300'} ${!showHeader ? '-mt-1' : ''}`}>
                      {textPayload}
                    </div>
                  )}
                  {imagePayload && (
                    <div className={`${!showHeader ? '-mt-1' : ''}`}>
                      <img
                        src={imagePayload}
                        alt="upload"
                        loading="lazy"
                        className="max-w-[320px] w-full md:w-auto max-h-[320px] rounded-2xl border border-white/10 object-cover shadow-lg"
                      />
                    </div>
                  )}
                </div>

                {hoveredMessageId === msg.id && (
                  <div className="absolute right-2 -top-3 rounded-lg border border-white/10 bg-[#131316] p-1.5 shadow-xl">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setReplyTo(msg)}
                        className="rounded-md p-1.5 text-zinc-300 hover:bg-white/10 hover:text-white"
                        title={isRu ? 'Ответить' : 'Reply'}
                      >
                        <Reply size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onTogglePinMessage?.(msg.id)}
                        className={`rounded-md p-1.5 hover:bg-white/10 ${msg.isPinned ? 'text-indigo-300' : 'text-zinc-300 hover:text-white'}`}
                        title={msg.isPinned ? (isRu ? 'Открепить' : 'Unpin') : (isRu ? 'Закрепить' : 'Pin')}
                      >
                        <Pin size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(msg.content)}
                        className="rounded-md p-1.5 text-zinc-300 hover:bg-white/10 hover:text-white"
                        title={isRu ? 'Копировать' : 'Copy'}
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div ref={bottomRef} className="h-2" />
      </div>

      <div className={`px-4 pt-2 z-20 ${isOverlay ? 'pb-8' : 'pb-24 md:pb-6'}`}>
        <div
          ref={composerRef}
          className="relative group"
          onDragOver={handleComposerDragOver}
          onDragLeave={handleComposerDragLeave}
          onDrop={handleComposerDrop}
        >
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
            className="hidden"
            onChange={handleImagePick}
          />

          {isEmojiPickerOpen && (
            <div className="absolute bottom-[calc(100%+8px)] right-0 w-[260px] p-3 rounded-2xl border border-white/10 bg-[#101014]/95 backdrop-blur-xl shadow-2xl z-30">
              <div className="grid grid-cols-6 gap-2">
                {EMOJI_SET.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="h-9 rounded-xl bg-white/5 hover:bg-white/10 text-lg transition-colors"
                    onClick={() => setInputValue((prev) => `${prev}${emoji}`)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form
            onSubmit={handleSend}
            className={`flex items-center gap-2 bg-[#18181b]/50 backdrop-blur-xl p-2 pr-3 rounded-[20px] border focus-within:border-indigo-500/50 focus-within:bg-[#18181b] transition-all duration-300 shadow-lg ${
              isDragOverComposer ? 'border-indigo-400 bg-[#1a1a22]' : 'border-white/10'
            }`}
          >
            <button
              type="button"
              className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors rounded-full hover:bg-white/10"
              onClick={() => imageInputRef.current?.click()}
            >
              <Plus size={18} className="bg-zinc-700 rounded-full text-black p-0.5" />
            </button>

            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isOverlay ? (isRu ? 'Сообщение...' : 'Message...') : `${t.app.placeholder_message} #${channelName}`}
              className="flex-1 bg-transparent border-none focus:outline-none text-white placeholder:text-zinc-600 h-9 px-1 text-sm font-medium"
            />

            <div className="flex items-center gap-1">
              {!inputValue.trim() && (
                <>
                  <button type="button" className="p-2 text-zinc-400 hover:text-white transition-colors"><Zap size={18} /></button>
                  <button
                    type="button"
                    className={`p-2 transition-colors ${isEmojiPickerOpen ? 'text-white' : 'text-zinc-400 hover:text-white'}`}
                    onClick={() => setIsEmojiPickerOpen((prev) => !prev)}
                  >
                    <Smile size={18} />
                  </button>
                </>
              )}

              {inputValue.trim() && (
                <button
                  type="submit"
                  className="p-2 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 animate-in zoom-in duration-200 hover:scale-105 active:scale-95"
                >
                  <Send size={16} fill="white" />
                </button>
              )}
            </div>
          </form>

          {replyTo && (
            <div className="mt-2 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-3 py-2">
              <div className="mb-1 flex items-center justify-between text-[11px] text-indigo-200">
                <span className="inline-flex items-center gap-1">
                  <CornerDownRight size={12} />
                  {isRu ? 'Ответ пользователю' : 'Replying to'}
                </span>
                <button type="button" onClick={() => setReplyTo(null)} className="text-zinc-400 hover:text-white">
                  ×
                </button>
              </div>
              <div className="text-xs text-zinc-200">
                <span className="font-semibold">{replyTo.senderName}: </span>
                <span className="opacity-80">{replyTo.content.slice(0, 180)}</span>
              </div>
            </div>
          )}

          {actionNotice && (
            <div className="mt-2 text-xs text-emerald-300">{actionNotice}</div>
          )}

          {isDragOverComposer && (
            <div className="absolute inset-0 rounded-[20px] border border-dashed border-indigo-300/70 bg-black/65 pointer-events-none flex items-center justify-center text-xs text-indigo-200">
              {isRu ? 'Перетащи изображение сюда' : 'Drop an image here'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatChannel;
