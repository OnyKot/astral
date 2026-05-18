import React, { useRef, useEffect } from 'react';
import { MicOff, MoreVertical, VideoOff } from './Icon';
import { User } from '../types';

interface VideoFrameProps {
  stream: MediaStream | null;
  user: User;
  isLocal?: boolean;
  audioOutputDeviceId?: string;
}

const VideoFrame: React.FC<VideoFrameProps> = ({ stream, user, isLocal = false, audioOutputDeviceId = '' }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    element.srcObject = stream ?? null;
    if (!stream) return;

    const ensurePlayback = async () => {
      try {
        await element.play();
      } catch {
        // Autoplay may be blocked until user interaction.
      }
    };

    void ensurePlayback();
    const handleLoadedMetadata = () => {
      void ensurePlayback();
    };
    element.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => {
      element.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [stream]);

  useEffect(() => {
    if (!videoRef.current || isLocal) return;
    const element = videoRef.current as HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> };
    if (!audioOutputDeviceId || typeof element.setSinkId !== 'function') return;
    void element.setSinkId(audioOutputDeviceId).catch(async () => {
      try {
        await element.setSinkId?.('default');
      } catch {
        // Keep browser-selected output if explicit sink cannot be applied.
      }
    });
  }, [audioOutputDeviceId, isLocal]);

  return (
    <div className={`
      relative w-full h-full group overflow-hidden rounded-[24px] md:rounded-[32px] bg-[#111] border border-white/5 shadow-2xl transition-all duration-300 transform
      ${user.isSpeaking ? 'ring-2 ring-green-500/50' : 'hover:border-white/10'}
    `}>
      
      {/* 
        Layer 1: Avatar / Fallback 
        Always present, sits behind video. 
      */}
      <div className={`
          absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-tr from-[#080808] via-[#111] to-[#080808] z-10
      `}>
             {/* Dynamic Ambient Glow */}
             <div className={`absolute inset-0 transition-opacity duration-500 ${user.isSpeaking ? 'opacity-30' : 'opacity-0'} bg-green-500 blur-[80px] pointer-events-none`} />
             
             <div className="relative">
                {user.isSpeaking && !user.isMuted && (
                    <div className="absolute inset-0 rounded-full border border-green-500/50 animate-[ping_2s_linear_infinite]" />
                )}
                <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-[#18181b] border border-white/5 flex items-center justify-center text-3xl font-bold text-gray-500 shadow-2xl z-10 relative overflow-hidden">
                    {user.avatarUrl ? (
                        <img src={user.avatarUrl} className="w-full h-full rounded-full object-cover" />
                    ) : (
                        <span>
                            {user.name.slice(0, 2).toUpperCase()}
                        </span>
                    )}
                </div>
                {/* Status indicator on Avatar */}
                <div className={`absolute bottom-1 right-1 w-6 h-6 rounded-full border-4 border-[#111] z-20 flex items-center justify-center transition-all duration-300 ${user.isMuted ? 'bg-red-500' : 'bg-green-500'}`}>
                    {user.isMuted && <MicOff size={10} className="text-white" />}
                </div>
             </div>
      </div>

      {/* 
        Layer 2: Video Feed
        Sits on top. Fades in/out based on video state.
        Dimensions match parent exactly (absolute inset-0).
      */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`
            absolute inset-0 w-full h-full object-cover z-20
            transition-all duration-500 ease-in-out
            ${user.isVideoOff ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'} 
            ${isLocal ? '-scale-x-100' : ''}
        `}
      />
      
      {/* Layer 3: HUD Overlays (Name, etc) - Always on top */}
      <div className="absolute inset-0 z-30 pointer-events-none">
          {/* Bottom Identity HUD */}
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10">
                <span className="text-xs font-bold text-white uppercase tracking-tighter truncate max-w-[120px]">
                    {user.name} {isLocal && <span className="text-green-500 opacity-80 ml-1">YOU</span>}
                </span>
                {user.isVideoOff && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-200">
                    <VideoOff size={10} />
                    CAM OFF
                  </span>
                )}
                {user.isScreenSharing && (
                  <span className="inline-flex items-center rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-200">
                    SCREEN
                  </span>
                )}
              </div>
              
              <button className="pointer-events-auto w-8 h-8 rounded-full bg-black/60 backdrop-blur-md border border-white/5 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-90">
                <MoreVertical size={14} />
              </button>
          </div>
      </div>

    </div>
  );
};

export default VideoFrame;
