import type { CapacitorConfig } from '@capacitor/cli';

const splitList = (value: string | undefined, fallback: Array<string>): Array<string> => {
  const values = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return values.length > 0 ? values : fallback;
};

const stableAppUrl = (
  process.env.ASTRAL_CAPACITOR_SERVER_URL ??
  process.env.ASTRAL_ELECTRON_STABLE_APP_URL ??
  'https://astraof.com'
).replace(/\/+$/, '');
const stableStartUrl = `${stableAppUrl}/channels/@me`;
const allowNavigation = splitList(process.env.ASTRAL_CAPACITOR_ALLOW_NAVIGATION, [
  'astraof.com',
  '*.astraof.com',
  'asrtal.ru',
  '*.asrtal.ru',
]);

const config: CapacitorConfig = {
  appId: 'app.astral',
  appName: 'Astral',
  webDir: 'dist',
  plugins: {
    Keyboard: {
      resize: 'ionic',
      resizeOnFullScreen: true,
    },
  },
  android: {
    backgroundColor: '#000000',
    allowMixedContent: false,
    overScrollMode: 'never',
    webContentsDebuggingEnabled: process.env.ASTRAL_CAPACITOR_WEB_DEBUGGING === '1',
  },
  server: {
    url: stableStartUrl,
    cleartext: false,
    allowNavigation,
  },
};

export default config;
