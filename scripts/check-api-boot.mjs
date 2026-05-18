import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const processRef = spawn(process.execPath, ['backend/server.mjs'], {
  stdio: 'pipe',
  cwd: process.cwd(),
  env: {
    ...process.env,
    BACKEND_PORT: '0',
  },
});

let bootFailed = false;

processRef.on('error', (error) => {
  bootFailed = true;
  console.error('[check:api:boot] failed to spawn backend:', error.message);
});

processRef.stderr.on('data', (chunk) => {
  const text = String(chunk || '').trim();
  if (text) {
    console.error(`[check:api:boot] stderr: ${text}`);
  }
});

processRef.stdout.on('data', (chunk) => {
  const text = String(chunk || '').trim();
  if (text) {
    console.log(`[check:api:boot] ${text}`);
  }
});

await delay(1200);

if (bootFailed || processRef.exitCode !== null) {
  processRef.kill('SIGTERM');
  process.exit(1);
}

processRef.kill('SIGTERM');
await delay(200);
process.exit(0);
