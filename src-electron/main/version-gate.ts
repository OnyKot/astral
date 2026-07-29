/*
 * Copyright (C) 2026 Astral Contributors
 *
 * Blocks outdated desktop shells before loading the web app.
 */

import {app, shell} from 'electron';
import log from 'electron-log';
import {BUILD_CHANNEL} from '../common/build-channel.js';

const VERSION_PART_SPLIT_PATTERN = /[.-]/u;
const NUMERIC_PREFIX_PATTERN = /^\d+/u;

function normalizeComparableVersion(value: string | null | undefined): Array<number> {
	if (!value) {
		return [];
	}

	return value
		.split(VERSION_PART_SPLIT_PATTERN)
		.map((part) => {
			const match = part.match(NUMERIC_PREFIX_PATTERN);
			if (!match) {
				return null;
			}
			const parsed = Number.parseInt(match[0], 10);
			return Number.isFinite(parsed) ? parsed : null;
		})
		.filter((part): part is number => part !== null);
}

function compareVersionStrings(left: string | null | undefined, right: string | null | undefined): number {
	const leftParts = normalizeComparableVersion(left);
	const rightParts = normalizeComparableVersion(right);
	const length = Math.max(leftParts.length, rightParts.length);

	for (let index = 0; index < length; index += 1) {
		const leftPart = leftParts[index] ?? 0;
		const rightPart = rightParts[index] ?? 0;
		if (leftPart > rightPart) {
			return 1;
		}
		if (leftPart < rightPart) {
			return -1;
		}
	}

	return 0;
}

function buildDownloadUrl(origin: string): string {
	const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
	if (process.platform === 'win32') {
		return `${origin}/dl/desktop/${BUILD_CHANNEL}/win32/${arch}/latest/setup`;
	}
	return `${origin}/download#desktop`;
}

function buildBlockedPageHtml(args: {
	currentVersion: string;
	requiredVersion: string;
	downloadUrl: string;
	notes?: string;
}): string {
	const notesBlock = args.notes
		? `<p class="notes">${escapeHtml(args.notes)}</p>`
		: '<p>Установите новый installer и перезапустите Astral.</p>';

	return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Нужно обновление — Astral</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f1117; color: #e8ecf8; margin: 0; min-height: 100vh; display: grid; place-items: center; }
    .card { max-width: 520px; padding: 32px; border: 1px solid #2a3145; border-radius: 16px; background: #151923; }
    h1 { margin: 0 0 12px; font-size: 1.5rem; }
    p { margin: 0 0 12px; line-height: 1.5; color: #b8c0d9; }
    .meta { font-family: ui-monospace, monospace; font-size: 0.85rem; }
    a.button { display: inline-block; margin-top: 16px; padding: 10px 16px; border-radius: 10px; background: #5865f2; color: white; text-decoration: none; font-weight: 600; }
    .notes { color: #f0d48a; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Требуется обновление</h1>
    <p>Эта версия Astral Desktop больше не поддерживается.</p>
    <p class="meta">Ваша версия: ${escapeHtml(args.currentVersion)}<br/>Минимальная: ${escapeHtml(args.requiredVersion)}</p>
    ${notesBlock}
    <a class="button" href="${escapeHtml(args.downloadUrl)}">Скачать обновление</a>
  </div>
</body>
</html>`;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

export interface VersionGateResult {
	allowed: boolean;
	blockedPageHtml?: string;
	requiredVersion?: string;
}

export async function evaluateDesktopVersionGate(appOrigin: string): Promise<VersionGateResult> {
	const currentVersion = app.getVersion();

	try {
		const response = await fetch(`${appOrigin.replace(/\/$/, '')}/version.json`, {
			headers: {'Cache-Control': 'no-cache'},
			signal: AbortSignal.timeout(8000),
		});

		if (!response.ok) {
			log.warn('[VersionGate] version.json unavailable', response.status);
			return {allowed: true};
		}

		const payload = (await response.json()) as {
			desktop?: {minVersion?: string};
			notes?: string;
		};

		const requiredVersion = payload.desktop?.minVersion;
		if (!requiredVersion) {
			return {allowed: true};
		}

		if (compareVersionStrings(currentVersion, requiredVersion) >= 0) {
			return {allowed: true};
		}

		const downloadUrl = buildDownloadUrl(appOrigin);
		log.warn('[VersionGate] desktop shell blocked', {currentVersion, requiredVersion});

		return {
			allowed: false,
			requiredVersion,
			blockedPageHtml: buildBlockedPageHtml({
				currentVersion,
				requiredVersion,
				downloadUrl,
				notes: payload.notes,
			}),
		};
	} catch (error) {
		log.warn('[VersionGate] check failed, allowing startup', error);
		return {allowed: true};
	}
}

export async function openDesktopUpdateDownload(appOrigin: string): Promise<void> {
	await shell.openExternal(buildDownloadUrl(appOrigin));
}
