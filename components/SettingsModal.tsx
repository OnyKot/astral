import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Mic, Video, Users, Shield, Sliders, ChevronLeft, ChevronRight, LogOut, Globe, Lock, Plus } from './Icon';
import { AnimatePresence, motion } from 'framer-motion';
import { Language, TodoItem, UserCredentials, UserSettings } from '../types';
import { translations } from '../translations';

interface PasswordChangeResult {
  ok: boolean;
  message: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  currentUser: UserCredentials | null;
  settings: UserSettings;
  onSaveSettings: (patch: Partial<UserSettings>) => void;
  onChangeLanguage: (lang: Language) => void;
  onChangePassword: (oldPassword: string, newPassword: string) => Promise<PasswordChangeResult>;
  todos: TodoItem[];
  onAddTodo: (text: string) => void;
  onToggleTodo: (todoId: string) => void;
  onRemoveTodo: (todoId: string) => void;
  onLogout: () => void;
}

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

const BUTTON_MOTION = {
  whileHover: { scale: 1.015, y: -1 },
  whileTap: { scale: 0.97 },
  transition: { type: 'spring', stiffness: 420, damping: 28, mass: 0.6 },
} as const;

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  lang,
  currentUser,
  settings,
  onSaveSettings,
  onChangeLanguage,
  onChangePassword,
  todos,
  onAddTodo,
  onToggleTodo,
  onRemoveTodo,
  onLogout,
}) => {
  const isRu = lang === 'ru';
  const [activeTab, setActiveTab] = useState('menu');
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [todoDraft, setTodoDraft] = useState('');
  const [passwordResult, setPasswordResult] = useState<PasswordChangeResult | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [isMicTestActive, setIsMicTestActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micTestError, setMicTestError] = useState<string | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micDataRef = useRef<Uint8Array | null>(null);
  const micAnimationFrameRef = useRef<number | null>(null);
  const micRunIdRef = useRef(0);
  const t = translations[lang];

  const stopPreview = () => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((track) => track.stop());
      previewStreamRef.current = null;
    }
    if (previewRef.current) {
      previewRef.current.srcObject = null;
    }
  };

  const clearMicAnimation = () => {
    if (micAnimationFrameRef.current !== null) {
      cancelAnimationFrame(micAnimationFrameRef.current);
      micAnimationFrameRef.current = null;
    }
  };

  const stopMicTestResources = () => {
    clearMicAnimation();
    micAnalyserRef.current = null;
    micDataRef.current = null;

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (micAudioContextRef.current) {
      const context = micAudioContextRef.current;
      micAudioContextRef.current = null;
      void context.close().catch(() => {});
    }
  };

  const stopMicTest = () => {
    micRunIdRef.current += 1;
    stopMicTestResources();
    setIsMicTestActive(false);
    setMicLevel(0);
  };

  const startMicTest = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicTestError(isRu ? 'Браузер не поддерживает доступ к микрофону.' : 'Microphone access is not supported in this browser.');
      return;
    }

    const AudioContextCtor = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AudioContextCtor) {
      setMicTestError(isRu ? 'Не удалось запустить аудио-анализатор.' : 'Audio analyzer is not available in this browser.');
      return;
    }

    const audioConstraints: MediaTrackConstraints = {
      noiseSuppression: settings.noiseSuppression,
      echoCancellation: settings.echoCancellation,
      autoGainControl: settings.autoGainControl,
    };
    if (settings.inputDeviceId) {
      audioConstraints.deviceId = { exact: settings.inputDeviceId };
    }

    const runId = micRunIdRef.current + 1;
    micRunIdRef.current = runId;

    stopMicTestResources();
    setMicLevel(0);
    setMicTestError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
      if (micRunIdRef.current !== runId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      micStreamRef.current = stream;

      const context = new AudioContextCtor();
      micAudioContextRef.current = context;
      if (micRunIdRef.current !== runId) {
        void context.close().catch(() => {});
        return;
      }
      if (context.state === 'suspended') {
        await context.resume().catch(() => {});
      }

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);

      micAnalyserRef.current = analyser;
      micDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      setIsMicTestActive(true);

      const updateLevel = () => {
        const activeAnalyser = micAnalyserRef.current;
        const data = micDataRef.current;
        if (!activeAnalyser || !data || micRunIdRef.current !== runId) return;

        activeAnalyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          sum += data[i];
        }
        const normalized = Math.min(1, (sum / data.length) / 170);
        setMicLevel((prev) => (prev * 0.45) + (normalized * 0.55));
        micAnimationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      micAnimationFrameRef.current = requestAnimationFrame(updateLevel);
    } catch {
      if (micRunIdRef.current !== runId) return;
      stopMicTestResources();
      setIsMicTestActive(false);
      setMicLevel(0);
      setMicTestError(isRu ? 'Не удалось открыть микрофон. Проверьте разрешения в браузере.' : 'Failed to access microphone. Check browser permissions.');
    }
  };

  const loadDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(list.filter((item) => item.kind === 'audioinput'));
      setAudioOutputs(list.filter((item) => item.kind === 'audiooutput'));
      setVideoInputs(list.filter((item) => item.kind === 'videoinput'));
    } catch {}
  };

  useEffect(() => {
    if (!isOpen) {
      setActiveTab('menu');
      stopPreview();
      stopMicTest();
      return;
    }

    void loadDevices();
    const onDeviceChange = () => { void loadDevices(); };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'voice-video') {
      stopPreview();
      stopMicTest();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) return;

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: settings.videoDeviceId
        ? { deviceId: { exact: settings.videoDeviceId } }
        : true,
    };

    navigator.mediaDevices.getUserMedia(constraints)
      .then((stream) => {
        stopPreview();
        previewStreamRef.current = stream;
        if (previewRef.current) {
          previewRef.current.srcObject = stream;
        }
      })
      .catch(() => {
        stopPreview();
      });

    return () => stopPreview();
  }, [isOpen, activeTab, settings.videoDeviceId]);

  useEffect(() => {
    return () => {
      stopPreview();
      stopMicTest();
    };
  }, []);

  useEffect(() => {
    if (!isOpen || activeTab !== 'voice-video' || !isMicTestActive) return;
    void startMicTest();
  }, [
    isOpen,
    activeTab,
    isMicTestActive,
    settings.inputDeviceId,
    settings.noiseSuppression,
    settings.echoCancellation,
    settings.autoGainControl,
  ]);

  const tabs = [
    { id: 'voice-video', label: t.settings.tab_voice, icon: Mic, color: 'text-green-400', bg: 'bg-green-500/10' },
    { id: 'appearance', label: t.settings.tab_appear, icon: Sliders, color: 'text-pink-400', bg: 'bg-pink-500/10' },
    { id: 'privacy', label: t.settings.tab_privacy, icon: Shield, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    { id: 'todo', label: isRu ? 'Планировщик' : 'Planner', icon: Sliders, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { id: 'account', label: t.settings.tab_account, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  ];

  const isMenu = activeTab === 'menu';
  const activeTitle = useMemo(
    () => tabs.find((tab) => tab.id === activeTab)?.label || (isRu ? 'Настройки' : 'Settings'),
    [activeTab, isRu],
  );

  if (!isOpen) return null;

  const ToggleRow = ({
    label,
    checked,
    onChange,
  }: {
    label: string;
    checked: boolean;
    onChange: (next: boolean) => void;
  }) => (
    <label className="flex items-center justify-between gap-3 text-sm text-zinc-300">
      <span>{label}</span>
      <motion.button
        {...BUTTON_MOTION}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-all ${
          checked
            ? 'bg-indigo-600 border-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.4)]'
            : 'bg-zinc-800 border-zinc-600'
        }`}
      >
        <motion.span
          animate={{ x: checked ? 20 : 0 }}
          transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.4 }}
          className="absolute left-1 inline-block h-4 w-4 rounded-full bg-white"
        />
      </motion.button>
    </label>
  );

  const renderDeviceOptions = (devices: MediaDeviceInfo[], fallback: string) => {
    if (devices.length === 0) {
      return <option value="">{fallback}</option>;
    }
    return (
      <>
        <option value="">{isRu ? 'Системное устройство' : 'System Default'}</option>
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `${fallback} ${device.deviceId.slice(0, 5)}`}
          </option>
        ))}
      </>
    );
  };

  const renderVoiceVideoTab = () => (
    <div className="space-y-5">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{isRu ? 'Устройство ввода' : 'Input Device'}</label>
          <select
            value={settings.inputDeviceId}
            onChange={(e) => onSaveSettings({ inputDeviceId: e.target.value })}
            className="w-full h-10 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-sm text-white"
          >
            {renderDeviceOptions(audioInputs, isRu ? 'Микрофон' : 'Microphone')}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{isRu ? 'Устройство вывода' : 'Output Device'}</label>
          <select
            value={settings.outputDeviceId}
            onChange={(e) => onSaveSettings({ outputDeviceId: e.target.value })}
            className="w-full h-10 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-sm text-white"
          >
            {renderDeviceOptions(audioOutputs, isRu ? 'Динамик' : 'Speaker')}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{isRu ? 'Камера' : 'Camera Device'}</label>
        <select
          value={settings.videoDeviceId}
          onChange={(e) => onSaveSettings({ videoDeviceId: e.target.value })}
          className="w-full h-10 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-sm text-white"
        >
          {renderDeviceOptions(videoInputs, isRu ? 'Камера' : 'Camera')}
        </select>
      </div>

      <div className="rounded-xl border border-white/10 bg-zinc-950/40 p-4 space-y-3">
        <div className="text-sm font-semibold text-white">{isRu ? 'Обработка звука' : 'Audio Processing'}</div>
        <ToggleRow
          label={isRu ? 'Шумоподавление' : 'Noise suppression'}
          checked={settings.noiseSuppression}
          onChange={(next) => onSaveSettings({ noiseSuppression: next })}
        />
        <ToggleRow
          label={isRu ? 'Эхо-подавление' : 'Echo cancellation'}
          checked={settings.echoCancellation}
          onChange={(next) => onSaveSettings({ echoCancellation: next })}
        />
        <ToggleRow
          label={isRu ? 'Автоматическая громкость' : 'Auto gain control'}
          checked={settings.autoGainControl}
          onChange={(next) => onSaveSettings({ autoGainControl: next })}
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-zinc-950/40 p-4 space-y-3">
        <div className="text-sm font-semibold text-white">{isRu ? 'Параметры звонка по умолчанию' : 'Call Defaults'}</div>
        <ToggleRow
          label={isRu ? 'Заходить с выключенным микрофоном' : 'Join with microphone muted'}
          checked={settings.startMuted}
          onChange={(next) => onSaveSettings({ startMuted: next })}
        />
        <ToggleRow
          label={isRu ? 'Заходить с выключенной камерой' : 'Join with camera disabled'}
          checked={settings.startVideoOff}
          onChange={(next) => onSaveSettings({ startVideoOff: next })}
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-zinc-950/40 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-white">{isRu ? 'Проверка микрофона' : 'Microphone Check'}</div>
            <p className="text-xs text-zinc-500">
              {isRu ? 'Запустите режим и скажите пару слов для проверки уровня сигнала.' : 'Start the mode and say a few words to verify input level.'}
            </p>
          </div>
          <motion.button
            {...BUTTON_MOTION}
            type="button"
            onClick={() => {
              if (isMicTestActive) {
                stopMicTest();
                return;
              }
              void startMicTest();
            }}
            className={`h-10 px-4 rounded-md border text-sm font-semibold ${
              isMicTestActive
                ? 'bg-red-500/20 border-red-400/30 text-red-200 hover:bg-red-500/25'
                : 'bg-emerald-500/20 border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/25'
            }`}
          >
            {isMicTestActive ? (isRu ? 'Остановить' : 'Stop') : (isRu ? 'Начать проверку' : 'Start test')}
          </motion.button>
        </div>

        <div className="h-3 rounded-full bg-zinc-900 border border-white/10 overflow-hidden">
          <motion.div
            className={`h-full ${
              micLevel > 0.75 ? 'bg-red-400' : micLevel > 0.4 ? 'bg-amber-300' : 'bg-emerald-400'
            }`}
            animate={{
              width: `${Math.max(isMicTestActive ? 3 : 0, Math.round(micLevel * 100))}%`,
            }}
            transition={{ type: 'spring', stiffness: 170, damping: 24, mass: 0.4 }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            {isMicTestActive
              ? (isRu ? 'Говорите в микрофон, индикатор должен двигаться.' : 'Speak into your microphone, the meter should move.')
              : (isRu ? 'Режим проверки выключен.' : 'Check mode is off.')}
          </span>
          <span className="font-mono text-zinc-400">{Math.round(micLevel * 100)}%</span>
        </div>

        {micTestError && (
          <p className="text-xs text-red-300">{micTestError}</p>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-zinc-950/40 p-4">
        <div className="text-sm font-semibold text-white mb-3">{isRu ? 'Предпросмотр камеры' : 'Camera Preview'}</div>
        <div className="aspect-video rounded-lg bg-black border border-zinc-800 overflow-hidden">
          <video ref={previewRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        </div>
      </div>
    </div>
  );

  const renderAppearanceTab = () => (
    <div className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-zinc-950/40 p-4 space-y-3">
        <div className="text-sm font-semibold text-white flex items-center gap-2">
          <Globe size={14} />
          {isRu ? 'Язык' : 'Language'}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <motion.button
            {...BUTTON_MOTION}
            onClick={() => onChangeLanguage('ru')}
            className={`h-10 rounded-md text-sm font-semibold ${lang === 'ru' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'}`}
          >
            Русский
          </motion.button>
          <motion.button
            {...BUTTON_MOTION}
            onClick={() => onChangeLanguage('en')}
            className={`h-10 rounded-md text-sm font-semibold ${lang === 'en' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'}`}
          >
            English
          </motion.button>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-zinc-950/40 p-4 space-y-3">
        <div className="text-sm font-semibold text-white">{isRu ? 'Тема' : 'Theme'}</div>
        <select
          value={settings.theme}
          onChange={(e) => onSaveSettings({ theme: e.target.value as 'dark' | 'light' })}
          className="w-full h-10 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-sm text-white"
        >
          <option value="dark">{isRu ? 'Темная' : 'Dark'}</option>
          <option value="light">{isRu ? 'Светлая (beta)' : 'Light (beta)'}</option>
        </select>
      </div>
    </div>
  );

  const renderPrivacyTab = () => (
    <div className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-zinc-950/40 p-4 space-y-3">
        <div className="text-sm font-semibold text-white">{isRu ? 'Приватность' : 'Privacy'}</div>
        <ToggleRow
          label={isRu ? 'Режим призрака (скрывать настоящий ник в звонках)' : 'Ghost mode (hide real nickname in calls)'}
          checked={settings.privacyMode}
          onChange={(next) => onSaveSettings({ privacyMode: next })}
        />
        <ToggleRow
          label={isRu ? 'Скрывать бейдж онлайн-статуса' : 'Hide online status badge'}
          checked={settings.hideOnlineStatus}
          onChange={(next) => onSaveSettings({ hideOnlineStatus: next })}
        />
      </div>
    </div>
  );

  const renderAccountTab = () => (
    <div className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-zinc-950/40 p-4 space-y-2">
        <div className="text-sm font-semibold text-white">{isRu ? 'Аккаунт' : 'Account'}</div>
        <div className="text-sm text-zinc-300">{isRu ? 'Ник' : 'Nickname'}: {currentUser?.name || (isRu ? 'Гость' : 'Guest')}</div>
        <div className="text-xs text-zinc-500 font-mono">ID: {currentUser?.id || 'n/a'}</div>
      </div>

      <div className="rounded-xl border border-white/10 bg-zinc-950/40 p-4 space-y-3">
        <div className="text-sm font-semibold text-white flex items-center gap-2">
          <Lock size={14} />
          {isRu ? 'Сменить пароль' : 'Change Password'}
        </div>
        <input
          type="password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          placeholder={isRu ? 'Текущий пароль' : 'Current password'}
          className="w-full h-10 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-sm text-white"
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={isRu ? 'Новый пароль' : 'New password'}
          className="w-full h-10 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-sm text-white"
        />
        <p className="text-[11px] text-zinc-500">
          {isRu ? 'Требование: 8-128 символов, минимум 1 буква и 1 цифра.' : 'Requirement: 8-128 chars, at least 1 letter and 1 number.'}
        </p>
        <motion.button
          {...BUTTON_MOTION}
          disabled={passwordSaving || !oldPassword || !newPassword}
          onClick={async () => {
            setPasswordSaving(true);
            const result = await onChangePassword(oldPassword, newPassword);
            setPasswordResult(result);
            setPasswordSaving(false);
            if (result.ok) {
              setOldPassword('');
              setNewPassword('');
            }
          }}
          className="h-10 px-4 rounded-md bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 disabled:opacity-50"
        >
          {passwordSaving ? (isRu ? 'Сохранение...' : 'Saving...') : (isRu ? 'Обновить пароль' : 'Update Password')}
        </motion.button>
        {passwordResult && (
          <p className={`text-xs ${passwordResult.ok ? 'text-emerald-300' : 'text-red-300'}`}>
            {passwordResult.message}
          </p>
        )}
      </div>

      <motion.button
        {...BUTTON_MOTION}
        onClick={onLogout}
        className="w-full h-11 rounded-md bg-red-500/20 text-red-300 text-sm font-semibold hover:bg-red-500/30 flex items-center justify-center gap-2"
      >
        <LogOut size={16} />
        {isRu ? 'Выйти' : 'Log out'}
      </motion.button>
    </div>
  );

  const renderTodoTab = () => (
    <div className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-zinc-950/40 p-4 space-y-3">
        <div className="text-sm font-semibold text-white">
          {isRu ? 'Личные задачи' : 'Personal tasks'}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!todoDraft.trim()) return;
            onAddTodo(todoDraft);
            setTodoDraft('');
          }}
        >
          <input
            type="text"
            value={todoDraft}
            onChange={(event) => setTodoDraft(event.target.value)}
            placeholder={isRu ? 'Новая задача' : 'New task'}
            className="flex-1 h-10 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-sm text-white"
          />
          <motion.button
            {...BUTTON_MOTION}
            type="submit"
            className="h-10 px-4 rounded-md bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 flex items-center gap-2"
          >
            <Plus size={14} />
            {isRu ? 'Добавить' : 'Add'}
          </motion.button>
        </form>
      </div>

      <div className="rounded-xl border border-white/10 bg-zinc-950/40 p-4 space-y-2">
        {todos.length === 0 && (
          <div className="text-sm text-zinc-500">
            {isRu ? 'Задач пока нет.' : 'No tasks yet.'}
          </div>
        )}
        {todos.map((todo) => (
          <div key={todo.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
            <input
              type="checkbox"
              checked={todo.done}
              onChange={() => onToggleTodo(todo.id)}
              className="accent-indigo-500"
            />
            <div className={`flex-1 text-sm ${todo.done ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
              {todo.text}
            </div>
            <motion.button
              {...BUTTON_MOTION}
              onClick={() => onRemoveTodo(todo.id)}
              className="h-7 px-2 rounded bg-red-500/15 text-red-300 hover:bg-red-500/25 text-xs"
            >
              {isRu ? 'Удалить' : 'Delete'}
            </motion.button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <motion.div
      className="fixed inset-0 z-[50] flex items-center justify-center bg-black md:bg-black/80 md:backdrop-blur-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="w-full h-full md:max-w-4xl md:h-[85vh] bg-black md:bg-[#09090b] md:border md:border-white/10 md:rounded-3xl shadow-2xl flex overflow-hidden relative"
        initial={{ y: 16, opacity: 0.96, scale: 0.985 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className={`flex-1 md:w-[320px] md:flex-none flex flex-col bg-black md:bg-[#050505] md:border-r md:border-white/5 transition-all duration-300 ${!isMenu ? 'hidden md:flex' : 'flex'}`}>
          <div className="md:hidden h-14 flex items-center justify-center sticky top-0 bg-black/80 backdrop-blur-md z-20 border-b border-white/5">
            <span className="font-bold text-lg text-white">{isRu ? 'Настройки' : 'Settings'}</span>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pb-24 md:pb-0">
            <div className="px-4 py-6 space-y-1">
              <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest px-4 mb-2">{isRu ? 'Настройки' : 'Settings'}</div>
              {tabs.map((tab) => {
                const isTabActive = activeTab === tab.id && !isMenu;
                return (
                  <motion.button
                    {...BUTTON_MOTION}
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all ${
                      isTabActive ? 'bg-white/10 border-white/5 shadow-sm' : 'hover:bg-white/5 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full ${tab.bg} flex items-center justify-center ${tab.color}`}>
                        <tab.icon size={18} />
                      </div>
                      <span className="font-semibold text-sm text-zinc-200">{tab.label}</span>
                    </div>
                    <motion.div
                      animate={{ x: isTabActive ? 2 : 0, opacity: isTabActive ? 1 : 0.5 }}
                      transition={{ duration: 0.16 }}
                    >
                      <ChevronRight size={16} className="text-zinc-700" />
                    </motion.div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>

        <div className={`flex-1 flex-col bg-black md:bg-[#09090b] relative ${!isMenu ? 'flex' : 'hidden md:flex'}`}>
          <div className="h-14 md:h-16 px-4 md:px-6 flex items-center justify-between border-b border-white/5 sticky top-0 bg-black/80 backdrop-blur-xl z-20">
            <div className="flex items-center justify-center w-full md:justify-start md:w-auto relative">
              <motion.button
                {...BUTTON_MOTION}
                onClick={() => setActiveTab('menu')}
                className="md:hidden absolute left-0 p-2 text-zinc-400 hover:text-white"
              >
                <ChevronLeft size={24} />
              </motion.button>
              <h2 className="text-lg font-bold text-white tracking-tight">{activeTitle}</h2>
            </div>
            <motion.button
              {...BUTTON_MOTION}
              onClick={onClose}
              className="hidden md:flex w-8 h-8 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white"
            >
              <X size={18} />
            </motion.button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar pb-24 md:pb-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                className="max-w-xl mx-auto space-y-8"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                {activeTab === 'voice-video' && renderVoiceVideoTab()}
                {activeTab === 'appearance' && renderAppearanceTab()}
                {activeTab === 'privacy' && renderPrivacyTab()}
                {activeTab === 'todo' && renderTodoTab()}
                {activeTab === 'account' && renderAccountTab()}
                {activeTab === 'menu' && (
                  <div className="text-sm text-zinc-500">{isRu ? 'Выберите раздел слева.' : 'Select a section on the left.'}</div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default SettingsModal;
