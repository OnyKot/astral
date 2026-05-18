import React, { useRef, useState, useEffect } from 'react';
import { LayoutGrid, MessageSquare, Users } from './Icon';

interface MobileNavProps {
  activeTab: 'servers' | 'dms' | 'profile';
  setActiveTab: (tab: 'servers' | 'dms' | 'profile') => void;
  lang: 'en' | 'ru';
  isHidden?: boolean;
}

const MobileNav: React.FC<MobileNavProps> = ({ activeTab, setActiveTab, lang, isHidden = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  
  // States for smart hiding
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isScrollingDown, setIsScrollingDown] = useState(false);
  const lastScrollY = useRef(0);
  const touchStartY = useRef(0);

  const tabs = ['servers', 'dms', 'profile'] as const;
  const activeIndex = tabs.indexOf(activeTab);

  // --- KEYBOARD DETECTION ---
  useEffect(() => {
    const handleFocus = (e: FocusEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            setIsKeyboardOpen(true);
        }
    };
    const handleBlur = () => {
        setIsKeyboardOpen(false);
    };

    // Advanced: Visual Viewport resize (reliable for mobile keyboards)
    const handleResize = () => {
        if (window.visualViewport && window.visualViewport.height < window.innerHeight * 0.75) {
             setIsKeyboardOpen(true);
        } else {
             setIsKeyboardOpen(false);
        }
    };

    window.addEventListener('focusin', handleFocus);
    window.addEventListener('focusout', handleBlur);
    window.visualViewport?.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('focusin', handleFocus);
        window.removeEventListener('focusout', handleBlur);
        window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, []);

  // --- SCROLL / SWIPE DETECTION ---
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
        touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
        const currentY = e.touches[0].clientY;
        const diff = currentY - touchStartY.current;

        // If moving finger UP (scrolling down content) -> Hide
        if (diff < -10) { 
            setIsScrollingDown(true);
        } 
        // If moving finger DOWN (scrolling up content) -> Show
        else if (diff > 10) {
            setIsScrollingDown(false);
        }
    };

    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchmove', handleTouchMove);
    
    return () => {
        window.removeEventListener('touchstart', handleTouchStart);
        window.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);


  // Sync pill position
  useEffect(() => {
    if (pillRef.current) {
        pillRef.current.style.transition = 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)';
        pillRef.current.style.transform = `translateX(${activeIndex * 100}%)`;
    }
  }, [activeIndex]);

  // Determine visibility
  const shouldHide = isHidden || isKeyboardOpen || isScrollingDown;

  return (
    <div 
        className={`
            md:hidden fixed bottom-6 left-0 right-0 z-[60] flex justify-center pointer-events-none touch-none
            transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
            ${shouldHide ? 'translate-y-[180%] opacity-0 scale-95' : 'translate-y-0 opacity-100 scale-100'}
        `}
    >
      <div 
        ref={containerRef}
        className="pointer-events-auto relative flex items-center justify-between p-1 bg-[#111]/80 backdrop-blur-xl border border-white/10 rounded-[32px] shadow-[0_8px_32px_rgba(0,0,0,0.6)] w-auto min-w-[280px] h-[58px] ring-1 ring-white/5 overflow-hidden select-none"
      >
        
        {/* Sliding Background Pill */}
        <div className="absolute top-1 bottom-1 left-1 w-[calc(33.33%-2.66px)] pointer-events-none z-0">
             <div 
                ref={pillRef}
                className={`w-full h-full rounded-[24px] shadow-lg border border-white/10 will-change-transform transition-colors duration-300 ${activeTab === 'dms' ? 'bg-indigo-600 shadow-indigo-500/20' : 'bg-[#27272a]'}`}
             />
        </div>

        {/* Tab 1: Servers */}
        <div 
          onClick={() => setActiveTab('servers')}
          className="relative w-24 h-full flex flex-col items-center justify-center gap-1 z-10 cursor-pointer active:scale-90 transition-transform duration-100"
        >
          <div className={`transition-all duration-300 ${activeTab === 'servers' ? 'scale-100 text-white' : 'text-zinc-500 scale-90'}`}>
            <LayoutGrid size={22} strokeWidth={activeTab === 'servers' ? 2.5 : 2} />
          </div>
        </div>
        
        {/* Tab 2: DMs */}
        <div 
          onClick={() => setActiveTab('dms')}
          className="relative w-24 h-full flex flex-col items-center justify-center gap-1 z-10 cursor-pointer active:scale-90 transition-transform duration-100"
        >
          <div className={`transition-all duration-300 ${activeTab === 'dms' ? 'scale-100 text-white' : 'text-zinc-500 scale-90'}`}>
            <MessageSquare size={22} strokeWidth={activeTab === 'dms' ? 2.5 : 2} />
          </div>
        </div>

        {/* Tab 3: Profile */}
        <div 
          onClick={() => setActiveTab('profile')}
          className="relative w-24 h-full flex flex-col items-center justify-center gap-1 z-10 cursor-pointer active:scale-90 transition-transform duration-100"
        >
          <div className={`transition-all duration-300 ${activeTab === 'profile' ? 'scale-110 ring-2 ring-white text-white' : 'scale-100 opacity-60 text-zinc-500'}`}>
             <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500" />
          </div>
        </div>

      </div>
    </div>
  );
};

export default MobileNav;