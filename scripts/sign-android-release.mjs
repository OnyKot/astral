import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = new Map(
	process.argv.slice(2).map((arg) => {
		const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
		return [key, value];
	}),
);

const profile = args.get('profile') === 'debug' ? 'debug' : 'release';
const inputPath = args.get('input')
	? path.resolve(args.get('input'))
	: path.resolve('android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk');
const outputPath = args.get('output')
	? path.resolve(args.get('output'))
	: path.resolve('android', 'app', 'build', 'outputs', 'apk', 'release', `Astral-android-${profile}.apk`);

if (!fs.existsSync(inputPath)) {
	console.error(`Input APK not found: ${inputPath}`);
	process.exit(1);
}

function resolveAndroidHome() {
	if (process.env.ANDROID_HOME) {
		return process.env.ANDROID_HOME;
	}
	if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
		return path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
	}
	return path.join(os.homedir(), 'Android', 'Sdk');
}

function resolveApkSigner() {
	const buildToolsRoot = path.join(resolveAndroidHome(), 'build-tools');
	const versions = fs
		.readdirSync(buildToolsRoot, {withFileTypes: true})
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort((left, right) => right.localeCompare(left, undefined, {numeric: true}));

	for (const version of versions) {
		const candidate = path.join(
			buildToolsRoot,
			version,
			process.platform === 'win32' ? 'apksigner.bat' : 'apksigner',
		);
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	throw new Error(`Unable to locate apksigner under ${buildToolsRoot}`);
}

function resolveSigningProfile() {
	if (profile === 'debug') {
		return {
			keystore: path.join(os.homedir(), '.android', 'debug.keystore'),
			alias: 'androiddebugkey',
			storePass: 'android',
			keyPass: 'android',
		};
	}

	const keystore = process.env.ASTRAL_ANDROID_KEYSTORE_FILE;
	const alias = process.env.ASTRAL_ANDROID_KEY_ALIAS;
	const storePass = process.env.ASTRAL_ANDROID_STORE_PASSWORD;
	const keyPass = process.env.ASTRAL_ANDROID_KEY_PASSWORD;

	if (!keystore || !alias || !storePass || !keyPass) {
		throw new Error(
			'Release signing requires ASTRAL_ANDROID_KEYSTORE_FILE, ASTRAL_ANDROID_KEY_ALIAS, ASTRAL_ANDROID_STORE_PASSWORD, and ASTRAL_ANDROID_KEY_PASSWORD',
		);
	}

	return {keystore, alias, storePass, keyPass};
}

fs.copyFileSync(inputPath, outputPath);

const apksigner = resolveApkSigner();
const signing = resolveSigningProfile();
const result = spawnSync(
	apksigner,
	[
		'sign',
		'--ks',
		signing.keystore,
		'--ks-key-alias',
		signing.alias,
		'--ks-pass',
		`pass:${signing.storePass}`,
		'--key-pass',
		`pass:${signing.keyPass}`,
		outputPath,
	],
	{
		cwd: process.cwd(),
		stdio: 'inherit',
		shell: process.platform === 'win32',
	},
);

if (result.status !== 0) {
	process.exit(result.status ?? 1);
}

console.log(`Signed APK: ${outputPath}`);
