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

import Link from 'next/link';

export default function NotFound() {
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				minHeight: '60vh',
				padding: '2rem',
				textAlign: 'center',
				gap: '1rem',
			}}
		>
			<h1 style={{fontSize: '3rem', fontWeight: 800, color: '#e2e8f0', margin: 0}}>404</h1>
			<p style={{fontSize: '1.125rem', color: '#94a3b8', maxWidth: '28rem'}}>
				This page doesn't exist. It may have been moved or the URL is incorrect.
			</p>
			<div style={{display: 'flex', gap: '0.75rem', marginTop: '0.5rem'}}>
				<Link
					href="/"
					style={{
						padding: '0.625rem 1.5rem',
						borderRadius: '0.75rem',
						background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
						color: '#fff',
						fontWeight: 600,
						fontSize: '0.875rem',
						textDecoration: 'none',
					}}
				>
					Documentation Home
				</Link>
				<Link
					href="/ask"
					style={{
						padding: '0.625rem 1.5rem',
						borderRadius: '0.75rem',
						background: 'rgba(255,255,255,0.06)',
						border: '1px solid rgba(255,255,255,0.1)',
						color: '#e2e8f0',
						fontWeight: 600,
						fontSize: '0.875rem',
						textDecoration: 'none',
					}}
				>
					Ask AI Assistant
				</Link>
			</div>
		</div>
	);
}
