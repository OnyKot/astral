import React, { useState, useEffect, useRef } from 'react';
import { Zap, ChevronDown, Globe, Heart, Github, Command, ArrowRight, Shield, Cpu, Activity, Server, Lock, Share2, Menu, X } from './Icon';
import { Language } from '../types';
import { translations } from '../translations';

interface LandingPageProps {
  onGetStarted: () => void;
  onNavigate: (page: 'about' | 'donate') => void;
  onOpenExternal?: (url: string) => void;
  lang: Language;
  setLang: (l: Language) => void;
}

interface LandingLiveStats {
  onlinePeers: number;
  activeRooms: number;
  avgPeersPerRoom: number;
  uptimeSec: number;
  downtimePercent: number;
  freeTierPercent: number;
  maxPeersPerRoom: number;
  usersCount: number;
  invitesCount: number;
  activeInvitesCount: number;
}

const DEFAULT_LIVE_STATS: LandingLiveStats = {
  onlinePeers: 0,
  activeRooms: 0,
  avgPeersPerRoom: 0,
  uptimeSec: 0,
  downtimePercent: 0,
  freeTierPercent: 100,
  maxPeersPerRoom: 8,
  usersCount: 0,
  invitesCount: 0,
  activeInvitesCount: 0,
};

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onNavigate, onOpenExternal, lang, setLang }) => {
  const safeOpen = (url: string) => {
    if (onOpenExternal) {
      onOpenExternal(url);
    } else if (typeof window !== 'undefined' && (window as any).electron?.openExternal) {
      (window as any).electron.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener');
    }
  };
  const t = translations[lang];
  const repoUrl = 'https://github.com/Ivantech123/Astro-';
  const windowsInstallerUrl = '/dl/desktop/stable/win32/x64/latest/setup';
  const docsLinks = [
    { href: '/marketing/privacy', ru: 'Политика конфиденциальности', en: 'Privacy Policy' },
    { href: '/marketing/terms', ru: 'Условия использования', en: 'Terms of Service' },
    { href: '/marketing/security', ru: 'Безопасность', en: 'Security' },
    { href: '/marketing/guidelines', ru: 'Правила сообщества', en: 'Community Guidelines' },
  ];
  const appLinks = [
    { href: '/login', ru: 'Web (сейчас)', en: 'Web (now)', internal: true },
    { href: windowsInstallerUrl, ru: 'Windows (установщик)', en: 'Windows (installer)', internal: false },
    { href: repoUrl, ru: 'Android APK (скоро)', en: 'Android APK (soon)', internal: false },
  ];
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [liveStats, setLiveStats] = useState<LandingLiveStats>(DEFAULT_LIVE_STATS);
  const [apiLatencyMs, setApiLatencyMs] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrolled(container.scrollTop > 20);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;

    const pollStats = async () => {
      const startedAt = performance.now();
      try {
        const response = await fetch('/api/public/stats', { method: 'GET', cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        const raw = payload?.stats;
        if (!raw || typeof raw !== 'object' || stopped) return;

        setLiveStats({
          onlinePeers: Math.max(0, Math.round(toFiniteNumber(raw.onlinePeers))),
          activeRooms: Math.max(0, Math.round(toFiniteNumber(raw.activeRooms))),
          avgPeersPerRoom: Math.max(0, toFiniteNumber(raw.avgPeersPerRoom)),
          uptimeSec: Math.max(0, Math.round(toFiniteNumber(raw.uptimeSec))),
          downtimePercent: Math.max(0, toFiniteNumber(raw.downtimePercent)),
          freeTierPercent: Math.max(0, Math.min(100, toFiniteNumber(raw.freeTierPercent, 100))),
          maxPeersPerRoom: Math.max(1, Math.round(toFiniteNumber(raw.maxPeersPerRoom, 8))),
          usersCount: Math.max(0, Math.round(toFiniteNumber(raw.usersCount))),
          invitesCount: Math.max(0, Math.round(toFiniteNumber(raw.invitesCount))),
          activeInvitesCount: Math.max(0, Math.round(toFiniteNumber(raw.activeInvitesCount))),
        });
        setApiLatencyMs(Math.max(1, Math.round(performance.now() - startedAt)));
      } catch {}
    };

    void pollStats();
    timer = window.setInterval(() => {
      void pollStats();
    }, 5000);

    return () => {
      stopped = true;
      if (timer !== null) {
        window.clearInterval(timer);
      }
    };
  }, []);

  const compactFormatter = new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  });

  const onlineText = `+ ${compactFormatter.format(liveStats.onlinePeers)}`;
  const latencyText = `${apiLatencyMs ?? 0}ms`;
  const downtimeText = `${liveStats.downtimePercent.toFixed(2)}%`;
  const freeText = `${Math.round(liveStats.freeTierPercent)}%`;
  const possibilitiesText = liveStats.activeRooms > 0 ? `${liveStats.activeRooms}` : `${liveStats.maxPeersPerRoom}x`;

  const scrollToContent = () => {
    if (containerRef.current) {
        containerRef.current.scrollTo({ 
            top: window.innerHeight, 
            behavior: 'smooth' 
        });
    }
  };

  const FeatureCard = ({ icon: Icon, title, desc, delay }: { icon: any, title: string, desc: string, delay: string }) => (
    <div className={`group relative p-6 sm:p-8 rounded-2xl sm:rounded-[2rem] bg-gradient-to-b from-[#0f0f11] to-[#050505] border border-white/5 hover:border-indigo-500/20 transition-all duration-500 hover:-translate-y-1 sm:hover:-translate-y-2 hover:shadow-[0_20px_40px_-15px_rgba(99,102,241,0.2)] ${delay} overflow-hidden`}>
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
        
        <div className="relative z-10 w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-indigo-500/10 to-purple-500/10 border border-white/10 flex items-center justify-center mb-5 sm:mb-8 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500 shadow-inner">
            <Icon size={24} className="text-indigo-400 sm:w-7 sm:h-7 drop-shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
        </div>
        <h3 className="relative z-10 text-xl sm:text-2xl font-bold text-white mb-3 sm:mb-4 tracking-tight">{title}</h3>
        <p className="relative z-10 text-zinc-400 leading-relaxed text-sm sm:text-base font-light">{desc}</p>
    </div>
  );

  return (
    <div 
        ref={containerRef}
        className="h-screen w-full bg-black text-white flex flex-col relative overflow-hidden font-sans selection:bg-indigo-500/30"
    >
      
      {/* --- BACKGROUND LAYERS --- */}
      <div className="fixed inset-0 pointer-events-none z-0 transform-gpu bg-[#020202]">
          {/* Deep Space Gradients */}
          <div className="absolute top-[-20%] left-[-10%] w-[500px] md:w-[800px] h-[500px] md:h-[800px] bg-indigo-900/10 rounded-full blur-[120px] opacity-40 animate-pulse-slow"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[600px] md:w-[1000px] h-[600px] md:h-[1000px] bg-violet-900/10 rounded-full blur-[150px] opacity-30"></div>
          
          {/* Subtle Starfield / Noise */}
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
          
          {/* Refined Grid Pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]"></div>
      </div>

      {/* --- MAIN CONTENT --- */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 w-full h-full">
        <div className="w-full max-w-5xl mx-auto flex flex-col items-center text-center mt-[-5vh]">
            
            {/* Logo Anchor */}
            <div className="mb-12 sm:mb-16 animate-in fade-in zoom-in-95 duration-1000 delay-200">
                <div className="w-24 h-24 sm:w-32 sm:h-32 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-[2rem] sm:rounded-[3rem] flex items-center justify-center shadow-[0_0_60px_rgba(99,102,241,0.4)] animate-pulse-slow">
                    <Command size={48} className="text-white sm:w-16 sm:h-16 drop-shadow-lg" />
                </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center w-full gap-5 sm:gap-8 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300 px-4">
                <button 
                    onClick={onGetStarted}
                    className="w-full sm:w-auto h-16 sm:h-20 px-10 sm:px-12 bg-white text-black font-black tracking-wider text-base sm:text-lg rounded-full hover:bg-zinc-200 transition-all duration-300 flex items-center justify-center gap-3 shadow-[0_0_50px_rgba(255,255,255,0.15)] hover:shadow-[0_0_80px_rgba(255,255,255,0.3)] hover:scale-105 active:scale-95 group"
                >
                    {lang === 'ru' ? 'ВОЙТИ В ASTRAL' : 'SIGN IN TO ASTRAL'}
                    <div className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center group-hover:bg-black/10 transition-colors">
                        <ArrowRight size={18} className="text-black group-hover:translate-x-0.5 transition-transform" />
                    </div>
                </button>
                <a
                    href={windowsInstallerUrl}
                    className="w-full sm:w-auto h-16 sm:h-20 px-10 sm:px-12 bg-white/5 backdrop-blur-2xl text-white font-bold tracking-wider text-base sm:text-lg rounded-full border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-300 flex items-center justify-center gap-3 hover:scale-105 active:scale-95 group shadow-lg"
                >
                    <Share2 size={22} className="text-zinc-400 group-hover:text-white transition-colors" />
                    {lang === 'ru' ? 'СКАЧАТЬ' : 'DOWNLOAD'}
                </a>
            </div>

            <div className="mt-8 sm:mt-10 w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 px-4 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-500">
                <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 text-left">
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 mb-3">
                        {lang === 'ru' ? 'Документы' : 'Documents'}
                    </p>
                    <div className="flex flex-col gap-2">
                        {docsLinks.map((link) => (
                            <button
                                key={link.href}
                                onClick={() => safeOpen(link.href)}
                                className="text-sm text-zinc-300 hover:text-white transition-colors text-left"
                            >
                                {lang === 'ru' ? link.ru : link.en}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 text-left">
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 mb-3">
                        {lang === 'ru' ? 'Приложение' : 'Application'}
                    </p>
                    <p className="text-sm text-zinc-400 mb-3">
                        {lang === 'ru'
                            ? 'Десктоп и APK в подготовке. Пока используйте веб-версию.'
                            : 'Desktop and APK are in progress. Use the web version for now.'}
                    </p>
                    <div className="flex flex-col gap-2">
                        {appLinks.map((link) => (
                            <button
                                key={link.ru}
                                onClick={() => link.internal ? onGetStarted() : safeOpen(link.href)}
                                className="text-sm text-zinc-300 hover:text-white transition-colors text-left"
                            >
                                {lang === 'ru' ? link.ru : link.en}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
      </main>

      {/* --- FOOTER --- */}
      <footer className="relative z-10 w-full py-8 sm:py-12 border-t border-white/5 bg-black/40 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-0">
              <div className="flex flex-col items-center md:items-start gap-1">
                  <span className="text-white font-black tracking-widest text-lg">ASTRAL 2026</span>
                  <span className="text-zinc-600 text-xs font-mono uppercase">Decentralized Protocol</span>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8">
                  <button onClick={() => onNavigate('about')} className="text-zinc-400 hover:text-white text-sm font-medium transition-colors uppercase tracking-wide hover:underline underline-offset-4 decoration-white/20">
                      {t.nav.about}
                  </button>
                  <button onClick={() => onNavigate('donate')} className="text-zinc-400 hover:text-white text-sm font-medium transition-colors uppercase tracking-wide hover:underline underline-offset-4 decoration-white/20">
                      {t.nav.donate}
                  </button>
                  <button onClick={() => safeOpen('/marketing/privacy')} className="text-zinc-400 hover:text-white text-sm font-medium transition-colors uppercase tracking-wide hover:underline underline-offset-4 decoration-white/20">
                      {lang === 'ru' ? 'Приватность' : 'Privacy'}
                  </button>
                  <button onClick={() => safeOpen('/marketing/terms')} className="text-zinc-400 hover:text-white text-sm font-medium transition-colors uppercase tracking-wide hover:underline underline-offset-4 decoration-white/20">
                      {lang === 'ru' ? 'Условия' : 'Terms'}
                  </button>
                  <button onClick={() => safeOpen(repoUrl)} className="text-zinc-400 hover:text-white text-sm font-medium transition-colors uppercase tracking-wide hover:underline underline-offset-4 decoration-white/20">
                      Github
                  </button>
                  <button onClick={() => setLang(lang === 'en' ? 'ru' : 'en')} className="text-zinc-500 hover:text-zinc-300 text-sm font-bold transition-colors uppercase tracking-wide border border-white/10 px-3 py-1 rounded-full hover:bg-white/5">
                      {lang === 'en' ? 'RU' : 'EN'}
                  </button>
              </div>
          </div>
      </footer>

    </div>
  );
};

export default LandingPage;
