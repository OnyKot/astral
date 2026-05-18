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

import {docs} from 'fumadocs-mdx:collections/server';
import {type InferPageType, loader} from 'fumadocs-core/source';
import {lucideIconsPlugin} from 'fumadocs-core/source/lucide-icons';

export const DOCS_BASE_PATH = '/docs';

export const source = loader({
	baseUrl: '/',
	source: docs.toFumadocsSource(),
	plugins: [lucideIconsPlugin()],
});

export function getPageImage(page: InferPageType<typeof source>) {
	const segments = [...page.slugs, 'image.png'];

	return {
		segments,
		url: `${DOCS_BASE_PATH}/og/docs/${segments.join('/')}`,
	};
}

export async function getLLMText(page: InferPageType<typeof source>) {
	const processed = await page.data.getText('processed');

	return `# ${page.data.title}

${processed}`;
}
