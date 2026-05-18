import {spawnSync} from 'node:child_process';

const rawChannel = process.argv[2]?.toLowerCase() ?? 'stable';
const channel = rawChannel === 'canary' ? 'canary' : 'stable';
const env = {...process.env, BUILD_CHANNEL: channel};

function run(command, args) {
	const result = spawnSync(command, args, {
		cwd: process.cwd(),
		env,
		shell: process.platform === 'win32',
		stdio: 'inherit',
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

run('pnpm', ['electron:compile']);
run('pnpm', ['exec', 'electron-builder', '--config', 'electron-builder.config.cjs']);
