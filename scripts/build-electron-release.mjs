import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rawChannel = process.argv[2]?.toLowerCase() ?? 'stable';
const channel = rawChannel === 'canary' ? 'canary' : 'stable';
const env = {...process.env, BUILD_CHANNEL: channel};

const cwd = process.cwd();
const repoOutput = path.join(cwd, 'dist-electron');

// Squirrel.Windows ships a bundled `rcedit`/`Update.exe` that cannot load files
// located at paths containing non-ASCII characters (e.g. a Cyrillic Windows user
// name). electron-builder's own tooling copes, but the Squirrel target dies with
// "Unable to load file". When the project path is non-ASCII on Windows we build
// into an ASCII-only directory and copy the installer artifacts back afterwards.
const ASCII_OUTPUT_DIR = 'C:\\astral-build\\dist-electron';
const projectPathHasNonAscii = /[^\u0000-\u007F]/.test(cwd);
const useAsciiOutput = process.platform === 'win32' && projectPathHasNonAscii;
const outputDir = useAsciiOutput ? ASCII_OUTPUT_DIR : repoOutput;

function run(command, args) {
	const result = spawnSync(command, args, {
		cwd,
		env,
		shell: process.platform === 'win32',
		stdio: 'inherit',
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

// Manual recursive copy. Node's fs.cpSync has a Windows quirk when overwriting
// existing files (spurious "operation completed successfully" errors), so we
// copy file-by-file with copyFileSync which overwrites cleanly.
function copyTree(fromDir, toDir) {
	fs.mkdirSync(toDir, {recursive: true});
	for (const entry of fs.readdirSync(fromDir, {withFileTypes: true})) {
		const src = path.join(fromDir, entry.name);
		const dest = path.join(toDir, entry.name);
		if (entry.isDirectory()) {
			copyTree(src, dest);
		} else if (entry.isFile()) {
			fs.copyFileSync(src, dest);
		}
	}
}

function copyArtifactsBack(fromDir, toDir) {
	if (fromDir === toDir || !fs.existsSync(fromDir)) return;

	fs.mkdirSync(toDir, {recursive: true});
	// The unpacked app is a large intermediate; only the installers/feeds matter.
	for (const entry of fs.readdirSync(fromDir, {withFileTypes: true})) {
		if (entry.name.startsWith('win-unpacked')) continue;
		const src = path.join(fromDir, entry.name);
		const dest = path.join(toDir, entry.name);
		if (entry.isDirectory()) {
			copyTree(src, dest);
		} else if (entry.isFile()) {
			fs.copyFileSync(src, dest);
		}
	}
	console.log(`Copied installer artifacts from ${fromDir} to ${toDir}`);
}

run('pnpm', ['electron:compile']);

const builderArgs = ['exec', 'electron-builder', '--config', 'electron-builder.config.cjs'];
if (useAsciiOutput) {
	fs.mkdirSync(outputDir, {recursive: true});
	builderArgs.push(`--config.directories.output=${outputDir.replace(/\\/g, '/')}`);
	console.log(`Project path contains non-ASCII characters; building into ${outputDir} to keep Squirrel happy.`);
}

run('pnpm', builderArgs);

if (useAsciiOutput) {
	copyArtifactsBack(outputDir, repoOutput);
}
