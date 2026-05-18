import React, { useEffect, useState } from 'react';

const Preloader: React.FC<{ onFinish: () => void }> = ({ onFinish }) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let finished = false;
    let minTimer: number | null = null;
    let loadTimer: number | null = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      setLoading(false);
      window.setTimeout(onFinish, 260);
    };

    minTimer = window.setTimeout(() => {
      if (document.readyState === 'complete') {
        finish();
      }
    }, 550);

    if (document.readyState === 'complete') {
      loadTimer = window.setTimeout(finish, 120);
    } else {
      const onWindowLoad = () => finish();
      window.addEventListener('load', onWindowLoad, { once: true });
      loadTimer = window.setTimeout(finish, 1800);
      return () => {
        if (minTimer !== null) window.clearTimeout(minTimer);
        if (loadTimer !== null) window.clearTimeout(loadTimer);
        window.removeEventListener('load', onWindowLoad);
      };
    }

    return () => {
      if (minTimer !== null) window.clearTimeout(minTimer);
      if (loadTimer !== null) window.clearTimeout(loadTimer);
    };
  }, [onFinish]);

  return (
    <div 
      className={`fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center transition-opacity duration-300 ${loading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
      <div className="relative">
        {/* Orbiting Rings */}
        <div className="absolute inset-0 w-32 h-32 border border-blue-500/30 rounded-full animate-[spin_3s_linear_infinite]" />
        <div className="absolute inset-0 w-32 h-32 border border-purple-500/30 rounded-full animate-[spin_4s_linear_infinite_reverse] scale-75" />
        
        {/* Core */}
        <div className="w-32 h-32 flex items-center justify-center relative">
          <div className="w-4 h-4 bg-white rounded-full shadow-[0_0_20px_white] animate-pulse" />
          
          {/* Particles */}
          <div className="absolute w-full h-full animate-[spin_10s_linear_infinite]">
             <div className="absolute top-0 left-1/2 w-1 h-1 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]" />
             <div className="absolute bottom-0 right-1/2 w-1 h-1 bg-purple-500 rounded-full shadow-[0_0_10px_#a855f7]" />
             <div className="absolute top-1/2 left-0 w-1 h-1 bg-cyan-500 rounded-full shadow-[0_0_10px_#06b6d4]" />
          </div>
        </div>

        {/* Text */}
        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
            <h1 className="text-xl font-bold tracking-[0.3em] text-white uppercase mb-1">Astral</h1>
            <div className="flex gap-1 justify-center">
                <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce delay-75" />
                <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce delay-150" />
                <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce delay-300" />
            </div>
        </div>
      </div>
    </div>
  );
};

export default Preloader;
