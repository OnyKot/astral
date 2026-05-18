import React from 'react';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, MonitorUp, 
} from './Icon';

interface ControlBarProps {
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing?: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onEndCall: () => void;
  onToggleScreenShare?: () => void;
}

const ControlBar: React.FC<ControlBarProps> = ({
  isMuted,
  isVideoOff,
  isScreenSharing = false,
  onToggleMute,
  onToggleVideo,
  onEndCall,
  onToggleScreenShare
}) => {
  return (
    <div className="flex items-center gap-2 sm:gap-3 px-2 py-2">
        
        {/* Audio Toggle */}
        <div className="relative group">
           <button
            onClick={onToggleMute}
            className={`
              w-12 h-12 md:w-14 md:h-14 flex items-center justify-center rounded-full transition-all duration-300 active:scale-90
              ${isMuted 
                ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]' 
                : 'bg-zinc-800 hover:bg-zinc-700 text-white'}
            `}
          >
             {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
        </div>

        {/* Video Toggle */}
         <div className="relative group">
            <button
            onClick={onToggleVideo}
            className={`
                w-12 h-12 md:w-14 md:h-14 flex items-center justify-center rounded-full transition-all duration-300 active:scale-90
                ${isVideoOff 
                ? 'bg-zinc-800 text-red-400' 
                : 'bg-zinc-800 hover:bg-zinc-700 text-white'}
            `}
            >
              {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
            </button>
        </div>

        {/* Screen Share (New) */}
        <div className="relative group">
            <button
            onClick={onToggleScreenShare}
            className={`w-12 h-12 md:w-14 md:h-14 flex items-center justify-center rounded-full transition-all duration-300 active:scale-90 ${
              isScreenSharing
                ? 'bg-indigo-600 text-white shadow-[0_0_18px_rgba(99,102,241,0.45)]'
                : 'bg-zinc-800 hover:bg-zinc-700 text-white'
            }`}
            >
              <MonitorUp size={20} />
            </button>
        </div>

        <div className="w-[1px] h-8 bg-white/10 mx-1 md:mx-2"></div>

        {/* End Call */}
        <div className="relative group">
            <button
            onClick={onEndCall}
            className="w-16 md:w-20 h-12 md:h-14 flex items-center justify-center rounded-full bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:bg-red-700 hover:w-24 transition-all duration-500 active:scale-90 group"
            >
            <PhoneOff size={24} className="group-hover:rotate-[135deg] transition-transform duration-500" />
            </button>
        </div>
    </div>
  );
};

export default ControlBar;
