/*
 * Copyright (C) 2026 Astral Contributors
 *
 * This file is part of Astral.
 *
 * Astral is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Astral is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Astral. If not, see <https://www.gnu.org/licenses/>.
 */

import {Readable} from 'node:stream';
import {S3ServiceException} from '@aws-sdk/client-s3';
import type {Context, Hono} from 'hono';
import type {HonoEnv} from '~/App';
import {Config} from '~/Config';

const DOWNLOAD_PREFIX = '/dl';
const DESKTOP_REDIRECT_PREFIX = `${DOWNLOAD_PREFIX}/desktop`;
const MOBILE_REDIRECT_PREFIX = `${DOWNLOAD_PREFIX}/mobile/android`;

type DesktopChannel = 'stable' | 'canary';
type DesktopPlatform = 'win32' | 'darwin' | 'linux';
type DesktopArch = 'x64' | 'arm64';

type DesktopFormat = 'setup' | 'dmg' | 'zip' | 'appimage' | 'deb' | 'rpm' | 'tar_gz';

type DesktopManifest = {
	channel: DesktopChannel;
	platform: DesktopPlatform;
	arch: DesktopArch;
	version: string;
	pub_date: string;
	files: Record<string, string>;
};

type AndroidManifest = {
	channel: DesktopChannel;
	platform: 'android';
	version: string;
	version_code: number;
	package_name: string;
	file: string;
	pub_date: string;
};

const isDesktopChannel = (value: string): value is DesktopChannel => value === 'stable' || value === 'canary';
const isDesktopPlatform = (value: string): value is DesktopPlatform =>
	value === 'win32' || value === 'darwin' || value === 'linux';
const isDesktopArch = (value: string): value is DesktopArch => value === 'x64' || value === 'arm64';
const isDesktopFormat = (value: string): value is DesktopFormat =>
	value === 'setup' ||
	value === 'dmg' ||
	value === 'zip' ||
	value === 'appimage' ||
	value === 'deb' ||
	value === 'rpm' ||
	value === 'tar_gz';

const buildKeyFromPath = (path: string): string | null => {
	if (!path.startsWith(DOWNLOAD_PREFIX)) {
		return null;
	}

	const stripped = path.slice(DOWNLOAD_PREFIX.length);
	const normalized = stripped.replace(/^\/+/u, '');
	return normalized.length > 0 ? normalized : null;
};

const normalizePlatformArchKey = (key: string): string | null => {
	const match = key.match(/^(desktop\/(stable|canary)\/(win32|darwin|linux))-(x64|arm64)(\/.*)$/u);
	if (!match) {
		return null;
	}

	const [, prefix, , , arch, suffix] = match;
	return `${prefix}/${arch}${suffix}`;
};

const firstForwardedValue = (headerValue: string): string => headerValue.split(',')[0]?.trim() ?? headerValue.trim();

const normalizeHostName = (host: string): string =>
	host
		.replace(/:\d+$/u, '')
		.replace(/^\[(.*)\]$/u, '$1')
		.toLowerCase();

const isLocalLikeHost = (host: string): boolean => {
	const hostname = normalizeHostName(host);

	return (
		hostname === 'localhost' ||
		hostname === '127.0.0.1' ||
		hostname === '::1' ||
		hostname === 'host.docker.internal' ||
		hostname.endsWith('.local') ||
		/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u.test(hostname) ||
		/^192\.168\.\d{1,3}\.\d{1,3}$/u.test(hostname) ||
		/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/u.test(hostname)
	);
};

const getExternalHost = (ctx: Context): string | null => {
	const forwardedHost = ctx.req.header('x-forwarded-host') ?? '';
	const host = forwardedHost.length > 0 ? firstForwardedValue(forwardedHost) : (ctx.req.header('host') ?? '');
	const normalizedHost = host.trim();
	return normalizedHost.length > 0 ? normalizedHost : null;
};

const getExternalProtocol = (ctx: Context, host: string | null): 'http' | 'https' => {
	const forwardedProtoHeader = ctx.req.header('x-forwarded-proto') ?? '';
	const forwardedProto =
		forwardedProtoHeader.length > 0
			? firstForwardedValue(forwardedProtoHeader).replace(/:$/u, '').toLowerCase()
			: '';

	if (forwardedProto === 'https') {
		return 'https';
	}

	if (forwardedProto === 'http' && host && isLocalLikeHost(host)) {
		return 'http';
	}

	return host && isLocalLikeHost(host) ? 'http' : 'https';
};

const buildExternalRedirectUrl = (ctx: Context, pathname: string): string => {
	const dest = new URL(ctx.req.url);
	const host = getExternalHost(ctx);

	if (host) {
		dest.host = host;
	}

	const protocol = getExternalProtocol(ctx, host);
	dest.protocol = `${protocol}:`;

	if (protocol === 'https') {
		dest.port = '';
	}

	dest.pathname = pathname;
	dest.search = '';
	dest.hash = '';

	return dest.toString();
};

const buildDownloadHeaders = (metadata: {
	contentLength: number;
	contentRange?: string | null;
	contentType?: string | null;
	cacheControl?: string | null;
	contentDisposition?: string | null;
	expires?: Date | null;
	etag?: string | null;
	lastModified?: Date | null;
}) => {
	const headers = new Headers();
	headers.set('Accept-Ranges', 'bytes');
	headers.set('Vary', 'Accept-Encoding, Range');

	if (metadata.cacheControl) {
		headers.set('Cache-Control', metadata.cacheControl);
	}

	headers.set('Content-Type', metadata.contentType ?? 'application/octet-stream');
	headers.set('Content-Length', metadata.contentLength.toString());

	if (metadata.contentDisposition) {
		headers.set('Content-Disposition', metadata.contentDisposition);
	}
	if (metadata.etag) {
		headers.set('ETag', metadata.etag);
	}
	if (metadata.expires) {
		headers.set('Expires', metadata.expires.toUTCString());
	}
	if (metadata.lastModified) {
		headers.set('Last-Modified', metadata.lastModified.toUTCString());
	}

	if (metadata.contentRange) {
		headers.set('Content-Range', metadata.contentRange);
	}

	return headers;
};

const readJsonObjectFromStorage = async <T>(ctx: Context, key: string): Promise<T | null> => {
	const storageService = ctx.get('storageService');

	const streamResult = await storageService.streamObject({
		bucket: Config.s3.buckets.downloads,
		key,
	});

	if (!streamResult) {
		return null;
	}

	const body = Readable.toWeb(streamResult.body);
	const text = await new Response(body as BodyInit).text();
	return JSON.parse(text) as T;
};

export function DownloadController(routes: Hono<HonoEnv>): void {
	// Squirrel Windows: autoUpdater fetches GET /dl/desktop/{channel}/win32/{arch}
	// and expects a plain-text RELEASES file (Squirrel format)
	routes.get(`${DESKTOP_REDIRECT_PREFIX}/:channel/win32/:arch`, async (ctx) => {
		const channelRaw = ctx.req.param('channel') ?? '';
		const archRaw = ctx.req.param('arch') ?? '';
		if (!isDesktopChannel(channelRaw) || !isDesktopArch(archRaw)) {
			return ctx.text('Not Found', 404);
		}
		const key = `desktop/${channelRaw}/win32/${archRaw}/RELEASES`;
		try {
			const storageService = ctx.get('storageService');
			const result = await storageService.streamObject({bucket: Config.s3.buckets.downloads, key});
			if (!result) return ctx.text('Not Found', 404);
			const headers = buildDownloadHeaders(result);
			headers.set('Content-Type', 'text/plain');
			return new Response(Readable.toWeb(result.body) as BodyInit, {headers});
		} catch (error) {
			if (error instanceof S3ServiceException && (error.name === 'NoSuchKey' || error.name === 'NotFound')) {
				return ctx.text('Not Found', 404);
			}
			throw error;
		}
	});

	routes.get(`${DESKTOP_REDIRECT_PREFIX}/:channel/:plat/:arch/latest/:format`, async (ctx) => {
		const channelRaw = ctx.req.param('channel') ?? '';
		const platRaw = ctx.req.param('plat') ?? '';
		const archRaw = ctx.req.param('arch') ?? '';
		const formatRaw = ctx.req.param('format') ?? '';

		if (
			!isDesktopChannel(channelRaw) ||
			!isDesktopPlatform(platRaw) ||
			!isDesktopArch(archRaw) ||
			!isDesktopFormat(formatRaw)
		) {
			return ctx.text('Not Found', 404);
		}

		const manifestKey = `desktop/${channelRaw}/${platRaw}/${archRaw}/manifest.json`;

		try {
			const manifest = await readJsonObjectFromStorage<DesktopManifest>(ctx, manifestKey);
			if (!manifest || !manifest.files) {
				return ctx.text('Not Found', 404);
			}

			const filename = manifest.files[formatRaw];
			if (!filename || filename.trim().length === 0) {
				return ctx.text('Not Found', 404);
			}

			const encodedFilename = encodeURIComponent(filename);
			const res = ctx.redirect(
				buildExternalRedirectUrl(
					ctx,
					`${DOWNLOAD_PREFIX}/desktop/${channelRaw}/${platRaw}/${archRaw}/${encodedFilename}`,
				),
				302,
			);
			res.headers.set('Cache-Control', 'no-store');
			return res;
		} catch (error) {
			if (error instanceof S3ServiceException && (error.name === 'NoSuchKey' || error.name === 'NotFound')) {
				return ctx.text('Not Found', 404);
			}
			throw error;
		}
	});

	routes.get(`${MOBILE_REDIRECT_PREFIX}/:channel/latest/apk`, async (ctx) => {
		const channelRaw = ctx.req.param('channel') ?? '';
		if (!isDesktopChannel(channelRaw)) {
			return ctx.text('Not Found', 404);
		}

		const manifestKey = `mobile/android/${channelRaw}/manifest.json`;

		try {
			const manifest = await readJsonObjectFromStorage<AndroidManifest>(ctx, manifestKey);
			const filename = manifest?.file?.trim() ?? '';
			if (!filename) {
				return ctx.text('Not Found', 404);
			}

			const encodedFilename = encodeURIComponent(filename);
			const res = ctx.redirect(
				buildExternalRedirectUrl(
					ctx,
					`${MOBILE_REDIRECT_PREFIX}/${channelRaw}/${encodedFilename}`,
				),
				302,
			);
			res.headers.set('Cache-Control', 'no-store');
			return res;
		} catch (error) {
			if (error instanceof S3ServiceException && (error.name === 'NoSuchKey' || error.name === 'NotFound')) {
				return ctx.text('Not Found', 404);
			}
			throw error;
		}
	});

	routes.get(`${DOWNLOAD_PREFIX}/android/arm64/apk`, (ctx) => {
		const res = ctx.redirect(
			buildExternalRedirectUrl(ctx, `${MOBILE_REDIRECT_PREFIX}/stable/latest/apk`),
			302,
		);
		res.headers.set('Cache-Control', 'no-store');
		return res;
	});

	routes.get(`${DOWNLOAD_PREFIX}/*`, async (ctx) => {
		const key = buildKeyFromPath(ctx.req.path);
		if (!key) {
			return ctx.text('Not Found', 404);
		}

		const storageService = ctx.get('storageService');
		const rangeHeader = ctx.req.header('range');
		const keysToTry = [key];
		const normalizedKey = normalizePlatformArchKey(key);
		if (normalizedKey) {
			keysToTry.push(normalizedKey);
		}

		for (const candidateKey of keysToTry) {
			try {
				const streamResult = await storageService.streamObject({
					bucket: Config.s3.buckets.downloads,
					key: candidateKey,
					range: rangeHeader ?? undefined,
				});

				if (!streamResult) {
					continue;
				}

				const headers = buildDownloadHeaders(streamResult);
				const status = streamResult.contentRange ? 206 : 200;
				const body = Readable.toWeb(streamResult.body);
				return new Response(body as BodyInit, {headers, status});
			} catch (error) {
				if (error instanceof S3ServiceException && (error.name === 'NoSuchKey' || error.name === 'NotFound')) {
					continue;
				}
				throw error;
			}
		}

		return ctx.text('Not Found', 404);
	});
}
