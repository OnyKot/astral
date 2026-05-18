import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const gitDir = path.join(root, '.git');
const hooksDir = path.join(gitDir, 'hooks');
const hookFile = path.join(hooksDir, 'pre-push');

if (!fs.existsSync(gitDir)) {
  process.exit(0);
}

fs.mkdirSync(hooksDir, { recursive: true });

const hookContent = `#!/usr/bin/env sh
echo "[pre-push] running checks..."
npm run check:prepush
status=$?
if [ $status -ne 0 ]; then
  echo "[pre-push] checks failed. Push aborted."
  exit $status
fi
echo "[pre-push] checks passed."
`;

fs.writeFileSync(hookFile, hookContent, 'utf8');

try {
  fs.chmodSync(hookFile, 0o755);
} catch {}
