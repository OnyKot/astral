import React from 'react';
import { ChevronLeft, Heart, Zap, Shield, Server, Copy, ExternalLink, Activity } from './Icon';
import { Language } from '../types';
import { translations } from '../translations';

interface DonatePageProps {
  onBack: () => void;
  lang: Language;
}

const DonatePage: React.FC<DonatePageProps> = ({ onBack, lang }) => {
  const t = translations[lang];

  const CryptoCard = ({ symbol, name, address, color }: { symbol: string, name: string, address: string, color: string }) => (
    <div className={`p-5 sm:p-6 rounded-2xl sm:rounded-[2rem] bg-gradient-to-br from-[#0f0f11] to-[#050505] border border-white/5 hover:border-${color}-500/20 transition-all duration-500 group relative overflow-hidden shadow-lg hover:shadow-[0_20px_40px_-15px_rgba(var(--${color}-500-rgb),0.2)] hover:-translate-y-1`}>
        <div className={`absolute inset-0 bg-gradient-to-br from-${color}-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
        <div className={`absolute -top-12 -right-12 w-32 h-32 bg-${color}-500/10 rounded-full blur-[30px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none`}></div>
        
        <div className="flex items-center justify-between mb-4 sm:mb-6 relative z-10">
            <div className="flex items-center gap-3 sm:gap-4">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-${color}-500/10 border border-${color}-500/20 flex items-center justify-center font-bold text-sm sm:text-base text-${color}-400 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500 shadow-inner`}>
                    {symbol}
                </div>
                <div>
                    <div className="font-bold text-white text-base sm:text-lg">{name}</div>
                    <div className={`text-[10px] sm:text-xs text-${color}-400/70 uppercase tracking-widest font-semibold`}>{symbol} {lang === 'ru' ? 'Сеть' : 'Network'}</div>
                </div>
            </div>
            <button 
                onClick={() => navigator.clipboard.writeText(address)}
                className={`p-2.5 rounded-xl bg-white/5 border border-white/5 text-zinc-400 hover:text-white hover:bg-${color}-500/20 hover:border-${color}-500/30 transition-all active:scale-90`}
                title={lang === 'ru' ? 'Скопировать адрес' : 'Copy Address'}
            >
                <Copy size={16} />
            </button>
        </div>
        <div className="bg-black/40 p-3 sm:p-4 rounded-xl border border-white/5 font-mono text-[10px] sm:text-xs text-zinc-400 break-all hover:text-white transition-colors cursor-pointer select-all relative z-10 flex items-center justify-between group/address">
            <span>{address}</span>
            <Copy size={12} className="opacity-0 group-hover/address:opacity-100 transition-opacity text-zinc-500" />
        </div>
    </div>
  );

  return (
    <div className="min-h-[100svh] w-full bg-[#020202] text-white relative overflow-y-auto overflow-x-hidden font-sans selection:bg-pink-500/30 touch-auto scroll-smooth">
      <div className="fixed inset-0 pointer-events-none z-0 transform-gpu">
          <div className="absolute top-[-10%] left-[10%] sm:left-[20%] w-[500px] sm:w-[800px] h-[500px] sm:h-[800px] bg-pink-900/15 rounded-full blur-[80px] sm:blur-[120px] opacity-40 animate-pulse-slow will-change-transform" />
          <div className="absolute bottom-[-10%] right-[10%] sm:right-[20%] w-[400px] sm:w-[600px] h-[400px] sm:h-[600px] bg-purple-900/15 rounded-full blur-[80px] sm:blur-[120px] opacity-30 will-change-transform" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]"></div>
      </div>

      <div className="fixed top-4 left-0 right-0 z-50 px-4 md:px-6 pointer-events-none flex justify-center transition-all duration-500">
          <nav className="pointer-events-auto w-full max-w-5xl rounded-2xl md:rounded-[2rem] transition-all duration-500 border bg-black/60 backdrop-blur-2xl border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.4)] py-3 px-4 md:px-6 flex justify-between items-center">
            <button 
                onClick={onBack}
                className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group"
            >
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-white/10 group-hover:border-white/30 transition-all active:scale-95">
                    <ChevronLeft size={16} />
                </div>
                <span className="text-xs sm:text-sm font-bold tracking-widest uppercase">{t.nav.back}</span>
            </button>
            <div className="flex items-center gap-3 group">
                <span className="font-black text-sm md:text-base tracking-widest uppercase select-none text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">Astral {t.nav.donate}</span>
                <Heart size={16} className="text-pink-500 fill-pink-500/20" />
            </div>
          </nav>
      </div>

      <div className="max-w-4xl mx-auto pt-24 sm:pt-32 pb-16 sm:pb-20 px-4 sm:px-6 relative z-10">
          <div className="text-center mb-12 sm:mb-16 animate-in fade-in slide-in-from-bottom-8 duration-1000 mt-[-5vh]">
              <div className="w-16 h-16 sm:w-24 sm:h-24 mx-auto bg-gradient-to-tr from-pink-500 to-purple-600 rounded-2xl sm:rounded-[2rem] flex items-center justify-center shadow-[0_0_50px_rgba(236,72,153,0.3)] mb-6 sm:mb-10 rotate-3 hover:rotate-12 transition-transform duration-500 cursor-default">
                  <Heart size={32} className="text-white fill-white animate-pulse sm:w-12 sm:h-12" />
              </div>
              <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tighter mb-4 sm:mb-6 text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-300">
                  {t.donate.title}
              </h1>
              <p className="text-base sm:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed px-2 font-light">
                  {t.donate.desc}
              </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-16 sm:mb-24 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
              <div className="p-6 sm:p-8 rounded-2xl sm:rounded-[2rem] bg-gradient-to-b from-zinc-900/50 to-black border border-white/5 flex flex-col items-center text-center hover:border-indigo-500/20 transition-colors group">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-500">
                      <Server size={28} className="text-indigo-400" />
                  </div>
                  <h3 className="font-bold text-white text-base sm:text-lg">{t.donate.why_1}</h3>
              </div>
              <div className="p-6 sm:p-8 rounded-2xl sm:rounded-[2rem] bg-gradient-to-b from-zinc-900/50 to-black border border-white/5 flex flex-col items-center text-center hover:border-yellow-500/20 transition-colors group">
                  <div className="w-14 h-14 rounded-2xl bg-yellow-500/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-500">
                      <Zap size={28} className="text-yellow-400" />
                  </div>
                  <h3 className="font-bold text-white text-base sm:text-lg">{t.donate.why_2}</h3>
              </div>
              <div className="p-6 sm:p-8 rounded-2xl sm:rounded-[2rem] bg-gradient-to-b from-zinc-900/50 to-black border border-white/5 flex flex-col items-center text-center hover:border-emerald-500/20 transition-colors group">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-500">
                      <Shield size={28} className="text-emerald-400" />
                  </div>
                  <h3 className="font-bold text-white text-base sm:text-lg">{t.donate.why_3}</h3>
              </div>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold mb-6 sm:mb-8 flex items-center gap-3">
              <Activity size={22} className="text-pink-500 sm:w-6 sm:h-6" />
              {t.donate.crypto_title}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-12 sm:mb-16 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
              <CryptoCard 
                symbol="BTC" 
                name="Bitcoin" 
                address="bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" 
                color="orange" 
              />
              <CryptoCard 
                symbol="ETH" 
                name="Ethereum" 
                address="0x71C7656EC7ab88b098defB751B7401B5f6d8976F" 
                color="blue" 
              />
              <CryptoCard 
                symbol="TON" 
                name="Toncoin" 
                address="UQBCI0...3D1s" 
                color="blue" 
              />
              <CryptoCard 
                symbol="USDT" 
                name="Tether (TRC20)" 
                address="TVj...8kk" 
                color="green" 
              />
          </div>

          <div className="p-8 sm:p-12 md:p-16 rounded-3xl sm:rounded-[3rem] bg-gradient-to-br from-zinc-900/80 to-black border border-white/10 text-center animate-in fade-in zoom-in-95 duration-1000 delay-500 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500/10 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none"></div>
              
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black mb-6 sm:mb-8 relative z-10">{t.donate.fiat_title}</h2>
              <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-4 sm:gap-6 relative z-10">
                  <a href="#" className="px-8 sm:px-10 py-4 sm:py-5 bg-[#FF424D] hover:bg-[#ff5c65] text-white font-bold rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,66,77,0.3)] hover:shadow-[0_0_50px_rgba(255,66,77,0.5)] text-sm sm:text-base">
                      <Heart size={20} fill="currentColor" className="sm:w-6 sm:h-6" />
                      Patreon
                  </a>
                  <a href="#" className="px-8 sm:px-10 py-4 sm:py-5 bg-[#0088cc] hover:bg-[#1fa3e0] text-white font-bold rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(0,136,204,0.3)] hover:shadow-[0_0_50px_rgba(0,136,204,0.5)] text-sm sm:text-base">
                      <Zap size={20} fill="currentColor" className="sm:w-6 sm:h-6" />
                      Boosty
                  </a>
              </div>
          </div>

      </div>
    </div>
  );
};

export default DonatePage;