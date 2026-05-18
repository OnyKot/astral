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

import {notFound} from 'next/navigation';
import {ImageResponse} from 'next/og';
import {getPageImage, source} from '@/lib/source';

export const revalidate = false;

export async function GET(_req: Request, {params}: RouteContext<'/og/docs/[...slug]'>) {
	const {slug} = await params;
	const page = source.getPage(slug.slice(0, -1));
	if (!page) notFound();

	const title = page.data.title ?? 'Astral API Docs';
	const description = page.data.description ?? 'Official developer documentation for Astral';
	const localeLabel = page.locale === 'ru' ? 'Русская документация' : 'Developer Documentation';
	const pathLabel = page.slugs.length > 0 ? `/docs/${page.slugs.join('/')}` : '/docs';

	return new ImageResponse(
		<div
			style={{
				display: 'flex',
				width: '100%',
				height: '100%',
				position: 'relative',
				overflow: 'hidden',
				background: 'linear-gradient(180deg, #090c15 0%, #04050a 100%)',
				color: '#f8fafc',
				padding: '56px',
				fontFamily: 'Inter, Arial, sans-serif',
			}}
		>
			<div
				style={{
					position: 'absolute',
					inset: '-10% auto auto 72%',
					width: '420px',
					height: '420px',
					borderRadius: '999px',
					background: 'radial-gradient(circle, rgba(124,130,255,0.36) 0%, rgba(124,130,255,0) 68%)',
				}}
			/>
			<div
				style={{
					position: 'absolute',
					inset: '58% auto auto -4%',
					width: '480px',
					height: '300px',
					borderRadius: '999px',
					background: 'radial-gradient(circle, rgba(56,189,248,0.12) 0%, rgba(56,189,248,0) 72%)',
				}}
			/>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'space-between',
					width: '100%',
					height: '100%',
					position: 'relative',
					padding: '28px',
					borderRadius: '36px',
					border: '1px solid rgba(148, 163, 184, 0.18)',
					background: 'linear-gradient(180deg, rgba(14,19,33,0.88) 0%, rgba(9,12,21,0.82) 100%)',
					boxShadow: '0 30px 90px rgba(0, 0, 0, 0.35)',
				}}
			>
				<div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
					<div style={{display: 'flex', alignItems: 'center', gap: '18px'}}>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: '72px',
								height: '72px',
								borderRadius: '24px',
								border: '1px solid rgba(148, 163, 255, 0.22)',
								background:
									'radial-gradient(circle at 30% 18%, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0) 38%), linear-gradient(160deg, #6f76ff 0%, #4f46e5 55%, #191f35 100%)',
								boxShadow: '0 18px 48px rgba(79, 70, 229, 0.35)',
								fontSize: '34px',
								fontWeight: 800,
								letterSpacing: '-0.08em',
							}}
						>
							A
						</div>
						<div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
							<div style={{display: 'flex', fontSize: '28px', fontWeight: 800, letterSpacing: '-0.04em'}}>Astral</div>
							<div style={{display: 'flex', fontSize: '16px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(226,232,240,0.62)'}}>
								API Docs
							</div>
						</div>
					</div>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							height: '46px',
							padding: '0 18px',
							borderRadius: '999px',
							border: '1px solid rgba(148, 163, 184, 0.15)',
							background: 'rgba(15, 23, 42, 0.48)',
							fontSize: '18px',
							color: 'rgba(226,232,240,0.74)',
						}}
					>
						astraof.com/docs
					</div>
				</div>

				<div style={{display: 'flex', flexDirection: 'column', maxWidth: '780px'}}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							alignSelf: 'flex-start',
							height: '40px',
							padding: '0 18px',
							borderRadius: '999px',
							background: 'rgba(99, 102, 241, 0.16)',
							border: '1px solid rgba(129, 140, 248, 0.22)',
							fontSize: '18px',
							fontWeight: 700,
							color: '#c7d2fe',
						}}
					>
						{localeLabel}
					</div>
					<div style={{display: 'flex', marginTop: '28px', fontSize: '74px', fontWeight: 800, lineHeight: 1.04, letterSpacing: '-0.06em'}}>
						{title}
					</div>
					<div
						style={{
							display: 'flex',
							marginTop: '22px',
							fontSize: '28px',
							lineHeight: 1.35,
							color: 'rgba(226,232,240,0.76)',
							maxWidth: '760px',
						}}
					>
						{description}
					</div>
				</div>

				<div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							height: '46px',
							padding: '0 18px',
							borderRadius: '999px',
							background: 'rgba(255,255,255,0.05)',
							border: '1px solid rgba(148, 163, 184, 0.15)',
							fontSize: '18px',
							fontWeight: 700,
							color: '#f8fafc',
						}}
					>
						Astral 2.0 Docs
					</div>
					<div style={{display: 'flex', fontSize: '18px', color: 'rgba(226,232,240,0.56)'}}>{pathLabel}</div>
				</div>
			</div>
		</div>,
		{width: 1200, height: 630},
	);
}

export function generateStaticParams() {
	return source.getPages().map((page) => ({
		lang: page.locale,
		slug: getPageImage(page).segments,
	}));
}
