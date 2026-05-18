import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Maximize2 } from './Icon';
import { User } from '../types';

interface MiniCallWidgetProps {
  participants: User[];
  onExpand: () => void;
  onLeave: () => void;
  isMuted: boolean;
  toggleMute: () => void;
  isVideoOff: boolean;
  toggleVideo: () => void;
}

const MiniCallWidget: React.FC<MiniCallWidgetProps> = ({
  participants,
  onExpand,
  onLeave,
  isMuted,
  toggleMute,
  isVideoOff,
  toggleVideo
}) => {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get active speakers or just first few participants
  const visibleParticipants = participants.slice(0, 3);
  const speakingUser = participants.find(p => p.isSpeaking && !p.isMuted);

  return (
    <div className="fixed top-2 left-2 right-2 z-[200] flex justify-center animate-in slide-in-from-top-full duration-500">
      <div 
        onClick={onExpand}
        className="
            w-full max-w-[390px] bg-[#1c1c1e]/90 backdrop-blur-2xl 
            rounded-[32px] shadow-[0_8px_40px_rgba(0,0,0,0.6)] 
            border border-white/5 flex items-center p-2 pl-3 gap-3
            cursor-pointer active:scale-[0.98] transition-all group
        "
      >
        {/* Left: Animated Waveform Icon (Telegram Style) */}
        <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 relative overflow-hidden">
             {/* Animated Bars */}
             <div className="flex gap-[2px] items-end h-4 pb-0.5">
                 <div className="w-[3px] bg-black/40 rounded-full animate-[pulse_0.8s_ease-in-out_infinite] h-2" />
                 <div className="w-[3px] bg-black/40 rounded-full animate-[pulse_1.1s_ease-in-out_infinite] h-4" />
                 <div className="w-[3px] bg-black/40 rounded-full animate-[pulse_1.3s_ease-in-out_infinite] h-3" />
                 <div className="w-[3px] bg-black/40 rounded-full animate-[pulse_0.9s_ease-in-out_infinite] h-2" />
             </div>
        </div>

        {/* Center: Call Info & Timer */}
        <div className="flex-1 flex flex-col justify-center min-w-0">
            <span className="text-sm font-bold text-white truncate leading-tight">
                {speakingUser ? speakingUser.name : 'Astral Call'}
            </span>
            <div className="flex items-center gap-2">
                <span className="text-xs text-green-400 font-mono tracking-wider font-medium">{formatTime(duration)}</span>
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">{participants.length} peers</span>
            </div>
        </div>

        {/* Right: Overlapped Avatars & Controls */}
        <div className="flex items-center gap-3 pr-1">
             <div className="flex -space-x-3">
                {visibleParticipants.map((p, idx) => (
                    <div key={p.id} className="w-8 h-8 rounded-full border-2 border-[#1c1c1e] bg-zinc-800 overflow-hidden relative z-0">
                         {p.avatarUrl ? (
                             <img src={p.avatarUrl} className="w-full h-full object-cover" />
                         ) : (
                             <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white">
                                {p.name.slice(0, 1)}
                             </div>
                         )}
                    </div>
                ))}
             </div>

             <div className="h-6 w-[1px] bg-white/10 mx-1"></div>

             <button 
                onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >
                {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            
            <button 
                onClick={(e) => { e.stopPropagation(); onLeave(); }}
                className="w-10 h-10 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
            >
                <PhoneOff size={18} />
            </button>
        </div>
      </div>
    </div>
  );
};

export default MiniCallWidget;