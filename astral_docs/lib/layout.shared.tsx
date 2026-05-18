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

import type {BaseLayoutProps} from 'fumadocs-ui/layouts/shared';
import {AstralDocsBrand} from '@/components/AstralDocsBrand';

/*
 * Header layout: brand on the left, GitHub icon on the right, and
 * nothing else. Previously we tried `type: "main"` / `type: "menu"`
 * entries for Quickstart / Reference / Libraries / Русский, but
 * fumadocs mirrors header links into the sidebar on narrow viewports
 * which made the sidebar show the header pills + the page tree at the
 * same time — looked like every entry was "empty". Primary navigation
 * now lives entirely in the sidebar tree (see content/docs/meta.json
 * section separators) and the Libraries landing card grid.
 */
export function baseOptions(): BaseLayoutProps {
	return {
		themeSwitch: {
			enabled: false,
		},
		nav: {
			title: <AstralDocsBrand />,
		},
		links: [
			{
				type: 'button',
				text: 'Ask AI',
				url: '/ask',
			},
			{
				type: 'button',
				text: 'EN',
				url: '/',
			},
			{
				type: 'button',
				text: 'RU',
				url: '/ru',
			},
			{
				type: 'icon',
				text: 'GitHub',
				url: 'https://github.com/Ivantech123/Astro-',
				external: true,
				icon: (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="currentColor"
						aria-hidden="true"
					>
						<path d="M12 .5C5.65.5.5 5.66.5 12.04c0 5.1 3.29 9.42 7.86 10.95.58.1.79-.25.79-.55 0-.27-.01-1.16-.02-2.1-3.2.7-3.87-1.39-3.87-1.39-.52-1.34-1.27-1.69-1.27-1.69-1.04-.72.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.02 1.77 2.69 1.26 3.34.97.1-.75.4-1.26.72-1.55-2.55-.29-5.24-1.29-5.24-5.74 0-1.27.45-2.31 1.19-3.13-.12-.3-.52-1.49.11-3.1 0 0 .98-.31 3.2 1.2.93-.26 1.93-.39 2.92-.4 1 .01 2 .14 2.93.4 2.22-1.51 3.2-1.2 3.2-1.2.63 1.61.23 2.8.11 3.1.74.82 1.19 1.86 1.19 3.13 0 4.46-2.69 5.45-5.26 5.73.41.36.78 1.05.78 2.13 0 1.54-.01 2.79-.01 3.16 0 .31.21.66.8.55 4.57-1.53 7.85-5.85 7.85-10.95C23.5 5.66 18.35.5 12 .5z" />
					</svg>
				),
			},
		],
	};
}
