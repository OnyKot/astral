import React, { useRef } from 'react';
import VideoFrame from './VideoFrame';
import ControlBar from './ControlBar';
import { User, CallStatus } from '../types';
import { ChevronDown } from './Icon';

interface CallInterfaceProps {
  status: CallStatus;
  participants: User[];
  localStream: MediaStream | null;
  localParticipantId: string;
  remoteStreamsByPeerId?: Record<string, MediaStream | null>;
  channelName: string;
  onLeave: () => void;
  onMinimize: () => void;
  isMuted: boolean;
  isVideoOff: boolean;
  toggleMute: () => void;
  toggleVideo: () => void;
  isScreenSharing: boolean;
  onToggleScreenShare: () => void;
  lang: 'en' | 'ru';
  audioOutputDeviceId?: string;
}

const CallInterface: React.FC<CallInterfaceProps> = ({
  participants,
  localStream,
  localParticipantId,
  remoteStreamsByPeerId = {},
  channelName,
  onLeave,
  onMinimize,
  isMuted,
  isVideoOff,
  toggleMute,
  toggleVideo,
  isScreenSharing,
  onToggleScreenShare,
  audioOutputDeviceId,
}) => {
  const touchStartY = useRef<number | null>(null);

  const getGridClass = (count: number) => {
    if (count <= 1) return 'grid-cols-1 w-full max-w-4xl h-full max-h-[75vh]';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2 w-full h-full max-h-[85vh]';
    if (count <= 4) return 'grid-cols-1 sm:grid-cols-2 w-full h-full max-w-6xl';
    return 'grid-cols-2 md:grid-cols-3 w-full h-full max-w-7xl';
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const diff = e.changedTouches[0].clientY - touchStartY.current;
    if (diff > 100) onMinimize();
    touchStartY.current = null;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#000] flex flex-col overflow-hidden animate-in slide-in-from-bottom-full duration-500 touch-none">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-indigo-900/20 rounded-full blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] bg-purple-900/10 rounded-full blur-[120px] animate-[pulse_10s_ease-in-out_infinite_reverse]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
      </div>

      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative z-[150] h-16 md:h-20 flex items-center justify-between px-4 md:px-8 shrink-0"
      >
        <button
          onClick={onMinimize}
          className="p-3 rounded-full bg-black/20 text-white hover:bg-white/10 transition-all flex items-center gap-2 active:scale-95 backdrop-blur-md"
        >
          <ChevronDown size={24} />
        </button>

        <div className="flex flex-col items-center cursor-grab active:cursor-grabbing">
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/5">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-bold text-white tracking-wide max-w-[150px] truncate shadow-black drop-shadow-lg">{channelName}</span>
            <div className="w-[1px] h-3 bg-white/20 mx-1" />
            <span className="text-[10px] text-zinc-400 font-mono tracking-wider">{participants.length} CONN</span>
          </div>
        </div>

        <div className="w-12 h-12" />
      </div>

      <div className="flex-1 flex relative z-10 overflow-hidden px-2 md:px-4 pb-28 md:pb-8">
        <div className="flex-1 flex items-center justify-center transition-all duration-500 h-full scale-100">
          <div className={`grid ${getGridClass(participants.length)} gap-3 md:gap-4 items-center justify-items-center content-center transition-all duration-500`}>
            {participants.map((user) => (
              <div
                key={user.id}
                className={`relative w-full h-full min-h-[180px] flex items-center justify-center ${participants.length === 1 ? 'aspect-[3/4] md:aspect-video' : ''} ${participants.length === 2 ? 'aspect-[4/3] md:aspect-video' : ''}`}
              >
                <VideoFrame
                  stream={user.id === localParticipantId ? localStream : remoteStreamsByPeerId[user.id] || null}
                  user={user}
                  isLocal={user.id === localParticipantId}
                  audioOutputDeviceId={audioOutputDeviceId}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 left-0 right-0 z-[150] flex justify-center px-4 pointer-events-none transition-all duration-300 translate-y-0 opacity-100">
        <div className="pointer-events-auto bg-[#1c1c1e]/80 backdrop-blur-2xl border border-white/10 rounded-[32px] shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-1.5 md:p-2 mb-safe transform transition-transform hover:scale-105">
          <ControlBar
            isMuted={isMuted}
            isVideoOff={isVideoOff}
            onToggleMute={toggleMute}
            onToggleVideo={toggleVideo}
            onEndCall={onLeave}
            isScreenSharing={isScreenSharing}
            onToggleScreenShare={onToggleScreenShare}
          />
        </div>
      </div>
    </div>
  );
};

export default CallInterface;
