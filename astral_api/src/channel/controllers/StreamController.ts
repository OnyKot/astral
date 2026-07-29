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

import type {Context} from 'hono';
import type {HonoApp, HonoEnv} from '~/App';
import {createChannelID} from '~/BrandedTypes';
import {APIErrorCodes} from '~/constants/API';
import {Permissions} from '~/constants/Channel';
import {BadRequestError, MissingPermissionsError} from '~/Errors';
import {DefaultUserOnly, LoginRequired} from '~/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '~/middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '~/RateLimitConfig';
import {createStringType, Int64Type, z} from '~/Schema';
import {Validator} from '~/Validator';

const streamKeyParam = z.object({stream_key: createStringType(1, 256)});

// The connection id is interpolated into the S3 object key and into the cache
// key for the preview (StreamPreviewService), so keep it to an opaque token
// charset instead of accepting arbitrary bytes from the path.
const CONNECTION_ID_RE = /^[A-Za-z0-9_-]{1,96}$/;

/* Largest value Cassandra's bigint column accepts; anything above is a 400, not a 500. */
const MAX_INT64 = 9223372036854775807n;

type ParsedStreamKey = {scope: 'guild' | 'dm'; guildId?: string; channelId: string; connectionId: string};

const parseStreamKey = (streamKey: string): ParsedStreamKey | null => {
	const parts = streamKey.split(':');
	if (parts.length !== 3) return null;
	const [scopeRaw, channelId, connectionId] = parts;
	if (!channelId || !connectionId) return null;
	if (!CONNECTION_ID_RE.test(connectionId)) return null;
	// Both branches must validate channelId as a snowflake: callers turn it into
	// a BigInt, and an unvalidated dm channelId would throw a SyntaxError (500)
	// instead of being rejected as a bad request. A digit-count bound is not
	// enough — the key may be 256 chars, and 20 digits still reaches 10^20, far
	// past int64, which the Cassandra driver rejects as a 500 where a bad channel
	// id has always been a 400/404. Check the actual range, the same way
	// Schema.ts does for snowflake query parameters.
	if (!/^[0-9]+$/.test(channelId) || BigInt(channelId) > MAX_INT64) return null;
	if (scopeRaw === 'dm') {
		return {scope: 'dm', channelId, connectionId};
	}
	if (!/^[0-9]+$/.test(scopeRaw)) return null;
	return {scope: 'guild', guildId: scopeRaw, channelId, connectionId};
};

/**
 * Authorizes a stream-key-addressed request against the channel encoded in the
 * key itself. Screen-share previews are keyed by `<scope>:<channelId>:<connectionId>`,
 * so the key's channel is the only trustworthy statement of what the caller is
 * reaching for — the caller must hold the same access the POST/upload path
 * requires, otherwise any authenticated account could read another channel's
 * frames (or overwrite its stream region) just by knowing the key.
 */
const assertStreamKeyAccess = async (ctx: Context<HonoEnv>, parsedKey: ParsedStreamKey) => {
	const userId = ctx.get('user').id;
	const channelId = createChannelID(BigInt(parsedKey.channelId));

	// getChannel enforces VIEW_CHANNEL for guild channels and recipient
	// membership for DMs; CONNECT is the extra gate the voice surface needs.
	const channel = await ctx.get('channelService').getChannel({userId, channelId});
	if (channel.guildId) {
		if (parsedKey.scope !== 'guild' || parsedKey.guildId !== channel.guildId.toString()) {
			throw new BadRequestError({code: APIErrorCodes.INVALID_REQUEST, message: 'Stream key scope mismatch'});
		}
		const hasConnect = await ctx.get('gatewayService').checkPermission({
			guildId: channel.guildId,
			channelId,
			userId,
			permission: Permissions.CONNECT,
		});
		if (!hasConnect) throw new MissingPermissionsError();
	} else if (parsedKey.scope !== 'dm') {
		throw new BadRequestError({code: APIErrorCodes.INVALID_REQUEST, message: 'Stream key scope mismatch'});
	}
};

export const StreamController = (app: HonoApp) => {
	app.patch(
		'/streams/:stream_key/stream',
		RateLimitMiddleware(RateLimitConfigs.CHANNEL_STREAM_UPDATE),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', z.object({region: createStringType(1, 64).optional()})),
		Validator('param', streamKeyParam),
		async (ctx) => {
			const {region} = ctx.req.valid('json');
			const streamKey = ctx.req.valid('param').stream_key;
			const parsedKey = parseStreamKey(streamKey);
			if (!parsedKey) {
				throw new BadRequestError({code: APIErrorCodes.INVALID_REQUEST, message: 'Invalid stream key format'});
			}
			await assertStreamKeyAccess(ctx, parsedKey);
			await ctx.get('cacheService').set(`stream_region:${streamKey}`, {region, updatedAt: Date.now()}, 60 * 60 * 24);
			return ctx.body(null, 204);
		},
	);

	app.get(
		'/streams/:stream_key/preview',
		RateLimitMiddleware(RateLimitConfigs.CHANNEL_STREAM_PREVIEW_GET),
		LoginRequired,
		DefaultUserOnly,
		Validator('param', streamKeyParam),
		async (ctx) => {
			const streamKey = ctx.req.valid('param').stream_key;
			const parsedKey = parseStreamKey(streamKey);
			if (!parsedKey) {
				throw new BadRequestError({code: APIErrorCodes.INVALID_REQUEST, message: 'Invalid stream key format'});
			}
			// Same authorization the upload path performs: without it any
			// authenticated account could read another channel's screen-share
			// frames straight off a connection id the gateway hands to every
			// VIEW_CHANNEL member.
			await assertStreamKeyAccess(ctx, parsedKey);
			const preview = await ctx.get('streamPreviewService').getPreview(streamKey);
			if (!preview) {
				return ctx.body(null, 404);
			}
			const payload: ArrayBuffer = preview.buffer.slice().buffer;
			const headers = {
				'Content-Type': preview.contentType || 'image/jpeg',
				'Cache-Control': 'no-store, private',
				Pragma: 'no-cache',
			};
			return ctx.newResponse(payload, 200, headers);
		},
	);

	app.post(
		'/streams/:stream_key/preview',
		RateLimitMiddleware(RateLimitConfigs.CHANNEL_STREAM_PREVIEW_POST),
		LoginRequired,
		DefaultUserOnly,
		Validator('param', streamKeyParam),
		async (ctx) => {
			const user = ctx.get('user');
			const streamKey = ctx.req.valid('param').stream_key;
			const userId = user.id;

			const parsedKey = parseStreamKey(streamKey);
			if (!parsedKey) {
				throw new BadRequestError({code: APIErrorCodes.INVALID_REQUEST, message: 'Invalid stream key format'});
			}

			const contentTypeHeader = ctx.req.header('content-type') ?? '';
			let body: Uint8Array;
			let channelId: ReturnType<typeof createChannelID>;
			let previewContentType = 'image/jpeg';

			if (contentTypeHeader.includes('multipart/form-data')) {
				// Binary upload — no base64, no memory spike
				const formData = await ctx.req.parseBody();
				const channelIdRaw = formData['channel_id'];
				const thumbnailFile = formData['thumbnail'];
				if (!channelIdRaw || typeof channelIdRaw !== 'string') {
					throw new BadRequestError({code: APIErrorCodes.INVALID_REQUEST, message: 'channel_id required'});
				}
				if (!thumbnailFile || !(thumbnailFile instanceof File)) {
					throw new BadRequestError({code: APIErrorCodes.INVALID_REQUEST, message: 'thumbnail file required'});
				}
				channelId = createChannelID(BigInt(channelIdRaw));
				body = new Uint8Array(await thumbnailFile.arrayBuffer());
				previewContentType = thumbnailFile.type || 'image/jpeg';
			} else {
				// Legacy JSON + base64
				const parsed = z.object({
					channel_id: Int64Type,
					thumbnail: createStringType(1, 2_000_000),
					content_type: createStringType(1, 64).optional(),
				}).safeParse(await ctx.req.json().catch(() => ({})));
				if (!parsed.success) {
					throw new BadRequestError({code: APIErrorCodes.INVALID_REQUEST, message: 'Invalid request body'});
				}
				channelId = createChannelID(parsed.data.channel_id);
				previewContentType = parsed.data.content_type ?? 'image/jpeg';
				try {
					body = Uint8Array.from(Buffer.from(parsed.data.thumbnail, 'base64'));
				} catch {
					throw new BadRequestError({code: APIErrorCodes.INVALID_REQUEST, message: 'Invalid thumbnail payload'});
				}
			}

			if (body.byteLength === 0) {
				throw new BadRequestError({code: APIErrorCodes.INVALID_REQUEST, message: 'Empty thumbnail payload'});
			}

			const channel = await ctx.get('channelService').getChannel({userId, channelId});
			if (channel.guildId) {
				const hasConnect = await ctx.get('gatewayService').checkPermission({
					guildId: channel.guildId, channelId, userId, permission: Permissions.CONNECT,
				});
				if (!hasConnect) throw new MissingPermissionsError();
			}
			if (channel.guildId && parsedKey.scope !== 'guild') {
				throw new BadRequestError({code: APIErrorCodes.INVALID_REQUEST, message: 'Stream key scope mismatch'});
			}
			if (!channel.guildId && parsedKey.scope !== 'dm') {
				throw new BadRequestError({code: APIErrorCodes.INVALID_REQUEST, message: 'Stream key scope mismatch'});
			}
			if (parsedKey.channelId !== channelId.toString()) {
				throw new BadRequestError({code: APIErrorCodes.INVALID_REQUEST, message: 'Stream key channel mismatch'});
			}

			await ctx.get('streamPreviewService').uploadPreview({
				streamKey, channelId, userId, body, contentType: previewContentType,
			});
			return ctx.body(null, 204);
		},
	);
};
