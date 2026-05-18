import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();
const androidRoot = path.join(projectRoot, 'android');
const rawArgs = process.argv.slice(2);
const modeArg = rawArgs.find((arg) => !arg.startsWith('--'))?.toLowerCase();
const mode =
	modeArg === 'debug'
		? 'debug'
		: modeArg === 'play' || modeArg === 'bundle'
			? 'bundle'
			: 'release';
const envFileArg = rawArgs.find((arg) => arg.startsWith('--env-file='))?.split('=').slice(1).join('=');
const defaultEnvFile = path.join(projectRoot, 'android', 'signing', 'play-upload.env');
const envFilePath = envFileArg
	? path.resolve(projectRoot, envFileArg)
	: existsSync(defaultEnvFile)
		? defaultEnvFile
		: null;

function binaryExists(binary) {
	const checker = process.platform === 'win32' ? 'where.exe' : 'which';
	const result = spawnSync(checker, [binary], {
		cwd: projectRoot,
		shell: false,
		stdio: 'ignore',
	});

	return result.status === 0;
}

const packageManagerCommand = (() => {
	if (binaryExists('pnpm')) {
		return {command: 'pnpm', prefix: []};
	}

	const corepackBinary = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
	if (binaryExists(corepackBinary)) {
		return {command: corepackBinary, prefix: ['pnpm']};
	}

	return {command: 'pnpm', prefix: []};
})();

function resolveCommand(command, args) {
	if (command !== 'pnpm') {
		return {command, args};
	}

	return {
		command: packageManagerCommand.command,
		args: [...packageManagerCommand.prefix, ...args],
	};
}

function parseEnvValue(rawValue) {
	const value = rawValue.trim();
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	return value;
}

function loadEnvFile(filePath) {
	if (!filePath || !existsSync(filePath)) {
		return {};
	}

	const fileContents = readFileSync(filePath, 'utf8');

	if (!fileContents) {
		return {};
	}

	return Object.fromEntries(
		fileContents
			.split(/\r?\n/u)
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith('#'))
			.map((line) => {
				const separatorIndex = line.indexOf('=');
				if (separatorIndex === -1) {
					return null;
				}

				const key = line.slice(0, separatorIndex).trim();
				const value = parseEnvValue(line.slice(separatorIndex + 1));
				return [key, value];
			})
			.filter(Boolean),
	);
}

const envFromFile = loadEnvFile(envFilePath);

function withDefaultEnv() {
	const env = {...envFromFile, ...process.env};

	if (process.platform === 'win32') {
		const studioJbr = 'C:\\Program Files\\Android\\Android Studio\\jbr';
		if (existsSync(studioJbr)) {
			env.JAVA_HOME = studioJbr;
		}
	}

	if (!env.JAVA_HOME && process.platform === 'darwin') {
		env.JAVA_HOME = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
	}

	if (!env.ANDROID_HOME) {
		if (process.platform === 'win32' && env.LOCALAPPDATA) {
			env.ANDROID_HOME = path.join(env.LOCALAPPDATA, 'Android', 'Sdk');
		} else {
			env.ANDROID_HOME = path.join(os.homedir(), 'Android', 'Sdk');
		}
	}

	if (!env.ANDROID_SDK_ROOT) {
		env.ANDROID_SDK_ROOT = env.ANDROID_HOME;
	}

	return env;
}

function run(command, args, cwd = projectRoot) {
	const resolved = resolveCommand(command, args);
	const result = spawnSync(resolved.command, resolved.args, {
		cwd,
		env: withDefaultEnv(),
		shell: process.platform === 'win32',
		stdio: 'inherit',
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

function runWithStatus(command, args, cwd = projectRoot) {
	const resolved = resolveCommand(command, args);
	return spawnSync(resolved.command, resolved.args, {
		cwd,
		env: withDefaultEnv(),
		shell: process.platform === 'win32',
		stdio: 'inherit',
	});
}

function hasCommand(command, args = ['--version']) {
	const resolved = resolveCommand(command, args);
	const result = spawnSync(resolved.command, resolved.args, {
		cwd: projectRoot,
		env: withDefaultEnv(),
		shell: process.platform === 'win32',
		stdio: 'ignore',
	});

	return result.status === 0;
}

function buildWebBundle() {
	if (hasCommand('cargo')) {
		run('pnpm', ['build']);
		return;
	}

	console.warn('[android-build] cargo was not found; reusing the existing WebAssembly bundle.');
	if (hasCommand('go')) {
		run('pnpm', ['generate:colors']);
	} else {
		console.warn('[android-build] go was not found; reusing the existing generated color system.');
	}
	run('pnpm', ['generate:masks']);
	run('pnpm', ['generate:css-types']);
	run('pnpm', ['exec', 'tsc', '--noEmit']);
	const linguiStrictCompile = runWithStatus('pnpm', ['lingui:compile']);
	if (linguiStrictCompile.status !== 0) {
		console.warn(
			'[android-build] strict Lingui compile failed because of existing missing translations; retrying without --strict for Android packaging.',
		);
		run('pnpm', ['exec', 'lingui', 'compile']);
	}
	rmSync(path.join(projectRoot, 'dist'), {recursive: true, force: true});
	run('pnpm', ['exec', 'rspack', 'build', '--mode', 'production']);
	run('pnpm', ['exec', 'tsx', 'scripts/build-sw.mjs']);
}

buildWebBundle();
run('pnpm', ['exec', 'cap', 'sync', 'android']);

const command = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
const args = [mode === 'debug' ? 'assembleDebug' : mode === 'bundle' ? 'bundleRelease' : 'assembleRelease'];
run(command, args, androidRoot);
