import React, { useState, useEffect } from 'react';
import { Command, Github, ArrowRight, Heart, ChevronLeft } from './Icon';
import { Language, UserCredentials } from '../types';
import { translations } from '../translations';

interface AuthPageProps {
  onComplete: (creds: UserCredentials, authToken: string) => void;
  onLocalLogin?: (nickname: string) => void;
  onBack: () => void;
  lang: Language;
}

const AuthPage: React.FC<AuthPageProps> = ({ onComplete, onLocalLogin, onBack, lang }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [betaCode, setBetaCode] = useState('');
  const [authError, setAuthError] = useState('');
  const [mounted, setMounted] = useState(false);
  
  const t = translations[lang];
  const isRu = lang === 'ru';
  const passwordPolicyHint = isRu
    ? 'Пароль: 8-128 символов, минимум 1 буква и 1 цифра.'
    : 'Password: 8-128 chars, at least 1 letter and 1 number.';

  useEffect(() => {
      setMounted(true);
  }, []);

  const requestAuth = async (path: string, payload: { name: string; password: string; betaCode?: string }) => {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let body: any = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {}
    }
    if (!response.ok) {
      throw new Error(typeof body?.error === 'string' ? body.error : `http_${response.status}`);
    }
    return body;
  };

  const toFriendlyAuthError = (code: string) => {
    if (code === 'invalid_nick') return isRu ? 'Ник должен быть от 2 до 32 символов.' : 'Nickname must be 2-32 characters.';
    if (code === 'invalid_password') return passwordPolicyHint;
    if (code === 'invalid_credentials') return isRu ? 'Неверный пароль.' : 'Invalid password.';
    if (code === 'user_not_found') return isRu ? 'Пользователь не найден. Выберите «Регистрация».' : 'User not found. Switch to Register.';
    if (code === 'user_exists') return isRu ? 'Пользователь уже существует. Выберите «Вход».' : 'User already exists. Switch to Login.';
    if (code === 'beta_code_required') return isRu ? 'Введите beta-код.' : 'Enter beta code.';
    if (code === 'invalid_beta_code') return isRu ? 'Неверный или неактивный beta-код.' : 'Invalid or inactive beta code.';
    return isRu ? 'Не удалось выполнить авторизацию. Попробуйте еще раз.' : 'Authentication failed. Please try again.';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password.trim()) {
      setAuthError(isRu ? 'Введите ник и пароль.' : 'Enter nickname and password.');
      return;
    }
    if (
      mode === 'register' &&
      (password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
    ) {
      setAuthError(passwordPolicyHint);
      return;
    }
    if (mode === 'register' && !betaCode.trim()) {
      setAuthError(isRu ? 'Введите beta-код.' : 'Enter beta code.');
      return;
    }

    setIsLoading(true);
    setAuthError('');

    try {
      const payload = mode === 'register'
        ? { name: name.trim(), password, betaCode: betaCode.trim().toUpperCase() }
        : { name: name.trim(), password };
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const result: any = await requestAuth(path, payload);

      const user = result?.user;
      const authToken = typeof result?.token === 'string' ? result.token : '';
      if (!authToken) {
        throw new Error('auth_failed');
      }
      const credentials: UserCredentials = {
        name: user?.name || name.trim(),
        id: user?.id || `user-${Math.random().toString(36).slice(2, 9)}`,
      };

      onComplete(credentials, authToken);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'auth_failed';
      setAuthError(toFriendlyAuthError(code));
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100svh] w-full bg-[#020202] flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans selection:bg-indigo-500/30">
      {/* Background Layers */}
      <div className="fixed inset-0 pointer-events-none z-0 transform-gpu">
          <div className="absolute top-[-20%] left-[-10%] sm:left-[10%] w-[500px] sm:w-[800px] h-[500px] sm:h-[800px] bg-indigo-900/15 rounded-full blur-[80px] sm:blur-[120px] opacity-40 animate-pulse-slow will-change-transform" />
          <div className="absolute bottom-[-20%] right-[-10%] sm:right-[10%] w-[400px] sm:w-[600px] h-[400px] sm:h-[600px] bg-violet-900/15 rounded-full blur-[80px] sm:blur-[120px] opacity-30 will-change-transform" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_80%,transparent_110%)]"></div>
      </div>

      {/* Floating Nav */}
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
            <div className="flex items-center gap-3">
                <span className="font-black text-sm md:text-base tracking-widest uppercase select-none text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400">Astral ID</span>
                <div className="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                    <Command size={12} className="text-indigo-400" />
                </div>
            </div>
          </nav>
      </div>

      <div className={`w-full max-w-md z-10 transition-all duration-1000 transform ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
        <div className="text-center mb-8 sm:mb-10 mt-16 sm:mt-0">
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-3 tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-400">{t.auth.title}</h2>
          <p className="text-zinc-400 text-sm sm:text-base font-light">{t.auth.subtitle}</p>
        </div>

        <div className="bg-gradient-to-br from-zinc-900/80 to-black border border-white/10 rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] backdrop-blur-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none"></div>
          
          <button
            type="button"
            className="w-full h-12 sm:h-14 bg-white hover:bg-zinc-100 text-black text-sm sm:text-base font-bold rounded-xl sm:rounded-2xl transition-all duration-300 flex items-center justify-center gap-3 mb-6 active:scale-[0.98] shadow-lg relative z-10"
          >
            <Github size={20} />
            {t.auth.github}
          </button>

          <div className="relative my-6 sm:my-8 relative z-10">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-widest font-mono">
              <span className="bg-black/80 px-4 py-1 rounded-full text-zinc-500 border border-white/5">{t.auth.or_anon}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-6 relative z-10 p-1 sm:p-1.5 bg-black/50 border border-white/5 rounded-xl sm:rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setAuthError('');
              }}
              className={`h-10 sm:h-11 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold tracking-wide transition-all duration-300 ${
                mode === 'login' 
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.15)]' 
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent'
              }`}
            >
              {isRu ? 'Вход' : 'Login'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setAuthError('');
              }}
              className={`h-10 sm:h-11 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold tracking-wide transition-all duration-300 ${
                mode === 'register' 
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.15)]' 
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent'
              }`}
            >
              {isRu ? 'Регистрация' : 'Register'}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5 relative z-10">
            <div className="space-y-2">
              <label className="text-[10px] sm:text-xs font-bold text-zinc-500 ml-1 uppercase tracking-widest font-mono">{t.auth.label_name}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.auth.placeholder_name}
                className="w-full h-12 sm:h-14 bg-black/40 border border-white/10 rounded-xl sm:rounded-2xl px-4 text-sm sm:text-base text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-inner"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] sm:text-xs font-bold text-zinc-500 ml-1 uppercase tracking-widest font-mono">{t.auth.label_pass}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.auth.placeholder_pass}
                className="w-full h-12 sm:h-14 bg-black/40 border border-white/10 rounded-xl sm:rounded-2xl px-4 text-sm sm:text-base text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-inner"
                required
              />
            </div>

            {mode === 'register' && (
              <div className="space-y-2">
                <label className="text-[10px] sm:text-xs font-bold text-zinc-500 ml-1 uppercase tracking-widest font-mono">
                  {isRu ? 'BETA-КОД' : 'BETA CODE'}
                </label>
                <input
                  type="text"
                  value={betaCode}
                  onChange={(e) => setBetaCode(e.target.value.toUpperCase())}
                  placeholder={isRu ? 'Введите beta-код' : 'Enter beta code'}
                  className="w-full h-12 sm:h-14 bg-black/40 border border-white/10 rounded-xl sm:rounded-2xl px-4 text-sm sm:text-base text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-inner"
                  required
                />
              </div>
            )}

            {authError && (
              <div className="text-xs sm:text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 animate-in fade-in zoom-in-95 duration-300">
                  {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full h-12 sm:h-14 text-white text-sm sm:text-base font-bold rounded-xl sm:rounded-2xl transition-all duration-300 flex items-center justify-center gap-3 mt-8 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg active:scale-[0.98] ${
                  mode === 'login' 
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 shadow-[0_0_20px_rgba(79,70,229,0.3)]' 
                    : 'bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 shadow-[0_0_20px_rgba(139,92,246,0.3)]'
              }`}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? (isRu ? 'Войти' : 'Login') : (isRu ? 'Регистрация' : 'Register')}
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            {onLocalLogin && (
              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => onLocalLogin(name)}
                  className="w-full h-11 sm:h-12 bg-white/5 text-zinc-300 text-xs sm:text-sm font-semibold rounded-xl hover:bg-white/10 border border-white/5 transition-all active:scale-[0.98]"
                >
                  {isRu ? 'Локальный вход (без backend)' : 'Local UI login (no backend)'}
                </button>
                <p className="text-[10px] sm:text-xs text-zinc-500 text-center mt-2 font-mono">
                  {isRu ? 'Режим только для локальной проверки интерфейса.' : 'For local interface preview only.'}
                </p>
              </div>
            )}
          </form>
        </div>

        <div className="mt-8 sm:mt-10 flex flex-col items-center gap-4 transition-all duration-1000 delay-300 transform opacity-100">
          <p className="text-[10px] sm:text-xs uppercase tracking-widest font-mono text-zinc-600">{t.auth.footer_donate}</p>
          <button className="flex items-center gap-2 px-4 py-2 rounded-full bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/20 text-xs sm:text-sm font-bold text-pink-400 hover:text-pink-300 transition-all hover:shadow-[0_0_15px_rgba(236,72,153,0.3)] group active:scale-95">
            <Heart size={14} className="text-pink-500 group-hover:scale-110 transition-transform" />
            {t.auth.btn_donate}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
