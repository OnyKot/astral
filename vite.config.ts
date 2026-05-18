import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET?.trim();
const previewAllowedHosts = process.env.VITE_ALLOWED_HOSTS
  ? process.env.VITE_ALLOWED_HOSTS.split(',').map((item) => item.trim()).filter(Boolean)
  : true;

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: apiProxyTarget
      ? {
          '/api': {
            target: apiProxyTarget,
            changeOrigin: true,
            secure: false,
          },
        }
      : undefined,
  },
  preview: {
    host: '0.0.0.0',
    port: 5175,
    allowedHosts: previewAllowedHosts,
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
