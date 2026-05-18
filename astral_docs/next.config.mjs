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

import {createMDX} from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
	reactStrictMode: true,
	output: 'standalone',
	basePath: '/docs',
	images: {
		unoptimized: true,
	},
	compress: true,
	poweredByHeader: false,
	headers: async () => [
		{
			source: '/:path*',
			headers: [
				{key: 'X-Content-Type-Options', value: 'nosniff'},
				{key: 'X-Frame-Options', value: 'DENY'},
			],
		},
		{
			source: '/_next/static/:path*',
			headers: [{key: 'Cache-Control', value: 'public, max-age=31536000, immutable'}],
		},
	],
};

export default withMDX(config);
