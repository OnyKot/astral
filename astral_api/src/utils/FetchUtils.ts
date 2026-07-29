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

import type {Readable} from 'node:stream';
import {isIP, type LookupFunction} from 'node:net';
import type {LookupAllOptions} from 'node:dns';
import {lookup as defaultLookup} from 'node:dns/promises';
import {Agent, errors, request} from 'undici';
import {ASTRAL_USER_AGENT} from '~/Constants';

interface RequestOptions {
	url: string;
	method?: 'GET' | 'POST' | 'HEAD';
	headers?: Record<string, string>;
	body?: unknown;
	signal?: AbortSignal;
	timeout?: number;
}

type UndiciResponse = Awaited<ReturnType<typeof request>>;
type ResponseBody = UndiciResponse['body'];

interface StreamResponse {
	stream: ResponseBody;
	headers: Headers;
	status: number;
	url: string;
}

interface RedirectResult {
	body: ResponseBody;
	headers: Record<string, string | Array<string>>;
	statusCode: number;
	finalUrl: string;
}

class HttpError extends Error {
	constructor(
		message: string,
		public readonly status?: number,
		public readonly response?: Response,
		public readonly isExpected = false,
	) {
		super(message);
		this.name = 'HttpError';
	}
}

// biome-ignore lint/complexity/noStaticOnlyClass: this is fine
class HttpClient {
	private static readonly DEFAULT_TIMEOUT = 30_000;
	// Only the standard web ports are reachable through server-side fetches
	// (unfurler/oEmbed/ActivityPub). Allowing arbitrary ports lets an attacker
	// probe internal services on high ports even when the host resolves to a
	// public IP.
	private static readonly ALLOWED_PORTS = new Set([80, 443]);
	private static readonly MAX_REDIRECTS = 5;
	private static readonly DEFAULT_HEADERS = {
		Accept: '*/*',
		'User-Agent': ASTRAL_USER_AGENT,
		'Cache-Control': 'no-cache, no-store, must-revalidate',
		Pragma: 'no-cache',
	};

	private static isDisallowedIPAddress(ip: string): boolean {
		if (ip === '::1' || ip === '::') return true;
		if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
		if (ip.startsWith('fe80:')) return true;

		// IPv6-mapped IPv4 (e.g. ::ffff:127.0.0.1) is a private IPv4 address
		// dressed in an IPv6 wrapper. The dotted-quad check below would miss it
		// (the leading segment "::ffff:127" is not a pure integer), so strip the
		// mapping prefix and re-run the IPv4 rules on the embedded address.
		const mappedIpv4 = ip.match(/^(?:::ffff:|::ffff:0:|64:ff9b::)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
		if (mappedIpv4) {
			return HttpClient.isDisallowedIPAddress(mappedIpv4[1]);
		}

		const parts = ip.split('.').map((part) => Number.parseInt(part, 10));
		if (parts.length !== 4 || parts.some(Number.isNaN)) return false;

		const [a, b] = parts;
		return (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168)
		);
	}

	// Resolves a hostname and returns the first safe address, or throws if
	// every resolved address is private/blocked. The returned address is
	// pinned for the actual request so undici cannot be rebinded to a
	// different (private) IP between the check and the connect (TOCTOU).
	private static async resolveSafeAddress(hostname: string): Promise<string> {
		const directIpVersion = isIP(hostname);
		if (directIpVersion) {
			if (HttpClient.isDisallowedIPAddress(hostname)) {
				throw new HttpError('Unsafe URL destination', 400, undefined, true);
			}
			return hostname;
		}

		const resolved = await defaultLookup(hostname, {all: true, verbatim: true} as LookupAllOptions);
		const safe = resolved.find(({address}) => !HttpClient.isDisallowedIPAddress(address));
		if (!safe) {
			throw new HttpError('Unsafe URL destination', 400, undefined, true);
		}
		return safe.address;
	}

	// Validates scheme + port, and returns the pinned IP to connect to. The
	// caller passes this IP to undici via a custom connect lookup so the
	// request lands on exactly the address we validated.
	private static async assertSafeDestination(urlString: string): Promise<{pinnedIp: string}> {
		const parsedUrl = new URL(urlString);
		if (!['http:', 'https:'].includes(parsedUrl.protocol))
			throw new HttpError('Unsupported protocol', 400, undefined, true);

		const hostname = parsedUrl.hostname;
		if (hostname === 'localhost') throw new HttpError('Unsafe URL destination', 400, undefined, true);

		const port = parsedUrl.port ? Number.parseInt(parsedUrl.port, 10) : parsedUrl.protocol === 'https:' ? 443 : 80;
		if (!HttpClient.ALLOWED_PORTS.has(port)) {
			throw new HttpError('Unsafe URL destination', 400, undefined, true);
		}

		const pinnedIp = await HttpClient.resolveSafeAddress(hostname);
		return {pinnedIp};
	}

	// Builds a connect lookup that forces undici to dial the pre-validated IP,
	// closing the DNS-rebinding window. undici calls the lookup with
	// (hostname, options, callback); we ignore the hostname and hand back the
	// pinned address so TLS SNI / Host header still use the original name.
	private static pinnedLookup(pinnedIp: string): LookupFunction {
		return (_hostname, options, callback) => {
			const family = isIP(pinnedIp) === 6 ? 6 : 4;
			// undici's connect calls this with {all: true} and then reads addresses[0].address.
			// Answering with a bare string in that mode leaves it reading `undefined`, which
			// surfaces as "Invalid IP address: undefined" and fails every outbound fetch —
			// which is what silently disabled link unfurling / embeds.
			if ((options as {all?: boolean} | undefined)?.all) {
				(callback as unknown as (err: null, addresses: Array<{address: string; family: number}>) => void)(null, [
					{address: pinnedIp, family},
				]);
				return;
			}
			callback(null, pinnedIp, family);
		};
	}

	// A short-lived dispatcher that dials only the pinned IP. Created per
	// request because each destination resolves to a different address; the
	// connection is short-lived and the agent is closed after the response is
	// consumed by the caller.
	private static pinnedDispatcher(pinnedIp: string): Agent {
		return new Agent({connect: {lookup: HttpClient.pinnedLookup(pinnedIp)}});
	}

	private static getHeadersForUrl(_url: string, customHeaders?: Record<string, string>): Record<string, string> {
		return {...HttpClient.DEFAULT_HEADERS, ...customHeaders};
	}

	private static createCombinedController(...signals: Array<AbortSignal>): AbortController {
		const controller = new AbortController();
		for (const signal of signals) {
			if (signal.aborted) {
				controller.abort(signal.reason);
				break;
			}
			signal.addEventListener('abort', () => controller.abort(signal.reason), {once: true});
		}
		return controller;
	}

	private static createTimeoutController(timeout: number): AbortController {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort('Request timed out'), timeout);
		controller.signal.addEventListener('abort', () => clearTimeout(timeoutId), {once: true});
		return controller;
	}

	private static async handleRedirect(
		statusCode: number,
		headers: Record<string, string | Array<string>>,
		currentUrl: string,
		options: RequestOptions,
		signal: AbortSignal,
		redirectCount = 0,
	): Promise<RedirectResult> {
		if (redirectCount >= HttpClient.MAX_REDIRECTS) {
			throw new HttpError(`Maximum number of redirects (${HttpClient.MAX_REDIRECTS}) exceeded`);
		}

		if (![301, 302, 303, 307, 308].includes(statusCode)) {
			throw new HttpError(`Expected redirect status but got ${statusCode}`);
		}

		const location = headers.location;
		if (!location) {
			throw new HttpError('Received redirect response without Location header', statusCode);
		}

		const redirectUrl = new URL(Array.isArray(location) ? location[0] : location, currentUrl).toString();
		const {pinnedIp} = await HttpClient.assertSafeDestination(redirectUrl);
		const requestHeaders = HttpClient.getHeadersForUrl(redirectUrl, options.headers);

		const redirectMethod = statusCode === 303 ? 'GET' : (options.method ?? 'GET');
		const redirectBody = statusCode === 303 ? undefined : options.body;

		const {
			statusCode: newStatusCode,
			headers: newHeaders,
			body,
		} = await request(redirectUrl, {
			method: redirectMethod,
			headers: requestHeaders,
			body: redirectBody ? JSON.stringify(redirectBody) : undefined,
			signal,
			dispatcher: HttpClient.pinnedDispatcher(pinnedIp),
		});

		if ([301, 302, 303, 307, 308].includes(newStatusCode)) {
			return HttpClient.handleRedirect(
				newStatusCode,
				newHeaders as Record<string, string | Array<string>>,
				redirectUrl,
				options,
				signal,
				redirectCount + 1,
			);
		}

		return {
			body,
			headers: newHeaders as Record<string, string | Array<string>>,
			statusCode: newStatusCode,
			finalUrl: redirectUrl,
		};
	}

	public static async sendRequest(options: RequestOptions): Promise<StreamResponse> {
		const timeoutController = HttpClient.createTimeoutController(options.timeout ?? HttpClient.DEFAULT_TIMEOUT);
		const combinedController = options.signal
			? HttpClient.createCombinedController(options.signal, timeoutController.signal)
			: timeoutController;
		const headers = HttpClient.getHeadersForUrl(options.url, options.headers);
		const {pinnedIp} = await HttpClient.assertSafeDestination(options.url);

		try {
			const {
				statusCode,
				headers: responseHeaders,
				body,
			} = await request(options.url, {
				method: options.method ?? 'GET',
				headers,
				body: options.body ? JSON.stringify(options.body) : undefined,
				signal: combinedController.signal,
				dispatcher: HttpClient.pinnedDispatcher(pinnedIp),
			});

			let finalBody = body;
			let finalHeaders = responseHeaders;
			let finalStatusCode = statusCode;
			let finalUrl = options.url;

			if (statusCode === 304) {
				return {
					stream: body,
					headers: new Headers(responseHeaders as Record<string, string>),
					status: statusCode,
					url: options.url,
				};
			}

			if ([301, 302, 303, 307, 308].includes(statusCode)) {
				const redirectResult = await HttpClient.handleRedirect(
					statusCode,
					responseHeaders as Record<string, string | Array<string>>,
					options.url,
					options,
					combinedController.signal,
				);
				finalBody = redirectResult.body;
				finalHeaders = redirectResult.headers;
				finalStatusCode = redirectResult.statusCode;
				finalUrl = redirectResult.finalUrl;
			}

			const headersObject = new Headers();
			for (const [key, value] of Object.entries(finalHeaders)) {
				if (Array.isArray(value)) {
					for (const v of value) {
						headersObject.append(key, v);
					}
				} else if (value) {
					headersObject.set(key, value);
				}
			}

			return {
				stream: finalBody,
				headers: headersObject,
				status: finalStatusCode,
				url: finalUrl,
			};
		} catch (error) {
			if (error instanceof HttpError) {
				throw error;
			}

			if (error instanceof errors.RequestAbortedError) {
				throw new HttpError('Request aborted', undefined, undefined, true);
			}
			if (error instanceof errors.BodyTimeoutError) {
				throw new HttpError('Request timed out', undefined, undefined, true);
			}
			if (error instanceof errors.ConnectTimeoutError) {
				throw new HttpError('Connection timeout', undefined, undefined, true);
			}
			if (error instanceof errors.SocketError) {
				throw new HttpError(`Socket error: ${error.message}`, undefined, undefined, true);
			}

			const errorMessage = error instanceof Error ? error.message : 'Request failed';
			const isNetworkError =
				error instanceof Error &&
				(error.message.includes('ENOTFOUND') ||
					error.message.includes('ECONNREFUSED') ||
					error.message.includes('ECONNRESET') ||
					error.message.includes('ETIMEDOUT') ||
					error.message.includes('EAI_AGAIN') ||
					error.message.includes('EHOSTUNREACH') ||
					error.message.includes('ENETUNREACH'));

			throw new HttpError(errorMessage, undefined, undefined, isNetworkError);
		}
	}

	public static async streamToString(stream: Readable): Promise<string> {
		const chunks: Array<Uint8Array> = [];
		for await (const chunk of stream) {
			chunks.push(new Uint8Array(Buffer.from(chunk)));
		}
		return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf-8');
	}
}

export const {sendRequest, streamToString} = HttpClient;
