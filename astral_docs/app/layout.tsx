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

import {RootProvider} from 'fumadocs-ui/provider/next';
import './global.css';
import type {Metadata, Viewport} from 'next';
import {Inter} from 'next/font/google';

const inter = Inter({
	subsets: ['latin'],
});

export const metadata: Metadata = {
	metadataBase: new URL('https://astraof.com'),
	title: {
		template: 'Astral API Docs | %s',
		default: 'Astral API Docs',
	},
	description: 'Official API documentation for Astral',
	icons: {
		icon: [
			{url: 'https://astraof.com/web/favicon.ico'},
			{url: 'https://astraof.com/web/favicon-16x16.png', sizes: '16x16', type: 'image/png'},
			{url: 'https://astraof.com/web/favicon-32x32.png', sizes: '32x32', type: 'image/png'},
		],
		apple: {url: 'https://astraof.com/web/apple-touch-icon.png', sizes: '180x180'},
	},
};

export const viewport: Viewport = {
	themeColor: '#4641D9',
};

export default function Layout({children}: LayoutProps<'/'>) {
	return (
		<html lang="en" className={inter.className} suppressHydrationWarning>
			<body className="flex min-h-screen flex-col">
				<RootProvider theme={{attribute: 'class', defaultTheme: 'dark', forcedTheme: 'dark', disableTransitionOnChange: true}}>
					{children}
				</RootProvider>
			</body>
		</html>
	);
}


