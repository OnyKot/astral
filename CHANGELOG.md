# Changelog

## [1.2.0] — 2026-02-28

### ✦ System Tray (Desktop)
- **Tray icon** — приложение теперь отображается в системном трее с иконкой Astral
- **Minimize to tray** — при закрытии окна приложение сворачивается в трей вместо полного выхода (Windows, macOS, Linux)
- **Контекстное меню трея** — Show/Hide окно, информация о голосовом канале, Mute/Deafen/Disconnect, Quit
- **Click toggle** — клик по иконке в трее показывает/скрывает главное окно
- **Tray hover popup** — при наведении на иконку в трее появляется оверлей с управлением голосовым каналом (список участников, кнопки Mute/Deafen/Disconnect)
- **IPC интеграция** — renderer <-> main process коммуникация для состояния голосового канала через tray

### ✦ Ссылки внутри приложения (Desktop)
- **ExternalLink** — ссылки (Terms of Service, Privacy Policy и др.) теперь открываются в дочернем окне внутри приложения вместо системного браузера
- **setWindowOpenHandler** — trusted-origin URL теперь разрешены как дочерние BrowserWindow
- **attachExternalLinkInterceptor** — в Electron используется `window.open()` вместо `shell.openExternal()` для trusted-origin ссылок
- **LandingPage** — все `<a href>` ссылки заменены на `<button onClick>` для корректной навигации внутри приложения

### ✦ Темы (Light / Dark)
- **Theme toggle** — переключатель тем в настройках теперь работает: `useEffect` переключает CSS-класс `dark`/`light` на `<html>`
- **Light theme CSS** — добавлены полные стили для светлой темы: фон, текст, карточки, бордеры, скроллбар, selection, grain overlay

### ✦ Оптимизация памяти (Desktop)
- **V8 flags** — `--max-old-space-size=256`, `--optimize-for-size`, `--gc-interval=100`
- **GPU memory** — `ReduceGpuMemoryUsage` feature flag
- **Windows-specific** — отключен `background-timer-throttling` и `renderer-backgrounding` для стабильности

### ✦ Инфраструктура
- **Preload API** — расширен интерфейс `ElectronAPI` методами для tray IPC (voice state, mute, deafen, disconnect)
- **Types** — добавлены типы `VoiceStateInfo`, `VoiceStateUser` в shared types
- **Window lifecycle** — экспортирована функция `setQuitting` для управления состоянием выхода
- **app.window-all-closed** — больше не завершает приложение (остаётся в трее)

### Изменённые файлы

**Electron (astral_app/src-electron/)**
- `main/tray.ts` — **новый** модуль системного трея
- `main/index.ts` — инициализация трея, IPC, memory flags, lifecycle
- `main/window.ts` — minimize-to-tray, setWindowOpenHandler для trusted URLs
- `preload/index.ts` — tray IPC API
- `common/types.ts` — VoiceStateInfo, ElectronAPI tray methods

**Web Client (astral_app/src/)**
- `components/common/ExternalLink.tsx` — in-app window вместо системного браузера
- `utils/NativeUtils.ts` — attachExternalLinkInterceptor использует window.open в Electron

**Root App**
- `App.tsx` — useEffect для theme toggle (dark/light class)
- `index.html` — light theme CSS стили
- `components/LandingPage.tsx` — `<a href>` → `<button onClick>` для внутренней навигации
- `version.json` — 1.0.0 → 1.2.0
- `astral_app/package.json` — 1.0.1 → 1.2.0
