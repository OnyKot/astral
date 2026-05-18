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

import type {MessageEmbedResponse} from '~/channel/EmbedTypes';
import {BaseResolver} from '~/unfurler/resolvers/BaseResolver';

/*
 * Giphy pages ship a marketing HTML shell where og:image points at static
 * thumbnail frames. If we hand that off to the DefaultResolver we end up with
 * a plain link card showing three dead still-frames and a "Discover & share
 * this GIF on GIPHY" blurb — the exact broken state the user saw. Tenor has a
 * dedicated resolver for the same reason.
 *
 * This resolver short-circuits giphy.com URLs into a `gifv` embed using Giphy's
 * public direct-media CDN. Given any Giphy ID, `media.giphy.com/media/<id>/`
 * exposes predictable asset URLs (`giphy.gif`, `giphy.mp4`, `giphy_s.gif`)
 * without needing to scrape the HTML page. We extract the ID from the URL
 * pathname and build the media URLs from there.
 */

// Only the HTML landing pages — direct media subdomains are already handled
// by ImageResolver/VideoResolver (they hit the resolver chain first).
const GIPHY_HTML_HOSTS = new Set(['giphy.com', 'www.giphy.com']);

// Giphy IDs are base62 strings, typically 13-20 characters. We require at
// least 10 contiguous alphanumerics to avoid matching short slug words.
const GIPHY_ID_REGEX = /^[a-zA-Z0-9]{10,}$/;

export class GiphyResolver extends BaseResolver {
	match(url: URL, mimeType: string, _content: Uint8Array): boolean {
		return mimeType.startsWith('text/html') && GIPHY_HTML_HOSTS.has(url.hostname);
	}

	async resolve(url: URL, _content: Uint8Array, isNSFWAllowed: boolean = false): Promise<Array<MessageEmbedResponse>> {
		const id = this.extractId(url);
		if (!id) {
			return [];
		}

		const thumbnailURL = `https://media.giphy.com/media/${id}/giphy_s.gif`;
		const videoURL = `https://media.giphy.com/media/${id}/giphy.mp4`;

		const thumbnail = await this.resolveMediaURL(url, thumbnailURL, isNSFWAllowed);
		const video = await this.resolveMediaURL(url, videoURL, isNSFWAllowed);

		// If the media service couldn't reach either asset, return empty so
		// the message shows just the link rather than an empty gifv card.
		if (!thumbnail && !video) {
			return [];
		}

		const embed: MessageEmbedResponse = {
			type: 'gifv',
			url: url.href,
			provider: {name: 'Giphy', url: 'https://giphy.com'},
			thumbnail: thumbnail ?? undefined,
			video: video ?? undefined,
		};
		return [embed];
	}

	/**
	 * Pull the Giphy ID out of the URL pathname.
	 *
	 * Supported shapes:
	 *   /gifs/LTFmLb6e88cPz2sjux
	 *   /gifs/heart-breaker-LTFmLb6e88cPz2sjux   (slug-id format)
	 *   /stickers/LTFmLb6e88cPz2sjux
	 *   /embed/LTFmLb6e88cPz2sjux
	 *
	 * We scan path segments from the end and, for each, take the trailing
	 * chunk after the last '-' (strip any file extension). The first chunk
	 * that looks like a Giphy ID wins.
	 */
	private extractId(url: URL): string | null {
		const segments = url.pathname.split('/').filter(Boolean);
		for (let i = segments.length - 1; i >= 0; i--) {
			const withoutExt = segments[i].replace(/\.[a-zA-Z0-9]+$/, '');
			const tail = withoutExt.split('-').pop() ?? '';
			if (GIPHY_ID_REGEX.test(tail)) {
				return tail;
			}
		}
		return null;
	}
}
