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

import {Trans, useLingui} from '@lingui/react/macro';
import {CaretLeftIcon, CaretRightIcon, XIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import React from 'react';
import {StatusAwareAvatar} from '~/components/uikit/StatusAwareAvatar';
import type {UserRecord} from '~/records/UserRecord';
import styles from './StoriesRail.module.css';

interface StorySlide {
	id: string;
	title: string;
	subtitle: string;
	background: string;
	accent: string;
	durationMs: number;
}

interface StoryBundle {
	id: string;
	user: UserRecord;
	fresh: boolean;
	slides: Array<StorySlide>;
}

interface StoriesRailProps {
	users: Array<UserRecord>;
}

const storyPalettes = [
	{
		background:
			'radial-gradient(circle at 18% 18%, rgba(255,255,255,0.22), transparent 30%), linear-gradient(145deg, #6f63ff 0%, #34206b 46%, #090816 100%)',
		accent: '#8f86ff',
	},
	{
		background:
			'radial-gradient(circle at 82% 12%, rgba(255,255,255,0.22), transparent 30%), linear-gradient(145deg, #12b981 0%, #0d5f48 46%, #071412 100%)',
		accent: '#34d399',
	},
	{
		background:
			'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.2), transparent 30%), linear-gradient(145deg, #ff8a5b 0%, #7a2e21 48%, #16090a 100%)',
		accent: '#ff9f73',
	},
	{
		background:
			'radial-gradient(circle at 74% 20%, rgba(255,255,255,0.18), transparent 26%), linear-gradient(145deg, #25a7ff 0%, #17427a 42%, #08111b 100%)',
		accent: '#5bc3ff',
	},
];

const getSeed = (input: string): number => {
	let seed = 0;
	for (let i = 0; i < input.length; i += 1) {
		seed = (seed * 31 + input.charCodeAt(i)) % 100000;
	}
	return seed;
};

const buildStories = (users: Array<UserRecord>): Array<StoryBundle> =>
	users.slice(0, 12).map((user, index) => {
		const seed = getSeed(user.id);
		const displayName = user.globalName ?? user.username;
		const palette = storyPalettes[seed % storyPalettes.length];
		const count = 2 + (seed % 2);
		const fresh = index < 5;
		const slides = Array.from({length: count}, (_, slideIndex) => ({
			id: `${user.id}:${slideIndex}`,
			title:
				slideIndex === 0
					? displayName
					: slideIndex === 1
						? `${displayName} - ${(seed % 4) + 1}m`
						: `${displayName} - Highlight`,
			subtitle:
				slideIndex === 0
					? 'Quick daily drop'
					: slideIndex === 1
						? 'A small moment, shared fast'
						: 'Saved as a brighter moment',
			background: palette.background,
			accent: palette.accent,
			durationMs: 3400 + slideIndex * 400,
		}));

		return {
			id: user.id,
			user,
			fresh,
			slides,
		};
	});

export const StoriesRail: React.FC<StoriesRailProps> = observer(({users}) => {
	const {t} = useLingui();
	const reducedMotion = useReducedMotion() ?? false;
	const bundles = React.useMemo(() => buildStories(users), [users]);
	const [viewerOpen, setViewerOpen] = React.useState(false);
	const [bundleIndex, setBundleIndex] = React.useState(0);
	const [slideIndex, setSlideIndex] = React.useState(0);
	const [progress, setProgress] = React.useState(0);

	const activeBundle = bundles[bundleIndex] ?? null;
	const activeSlide = activeBundle?.slides[slideIndex] ?? null;

	const openStory = React.useCallback((index: number) => {
		setBundleIndex(index);
		setSlideIndex(0);
		setProgress(0);
		setViewerOpen(true);
	}, []);

	const closeViewer = React.useCallback(() => {
		setViewerOpen(false);
		setProgress(0);
	}, []);

	const goToPrevious = React.useCallback(() => {
		if (!activeBundle) return;
		if (slideIndex > 0) {
			setSlideIndex((current) => current - 1);
			setProgress(0);
			return;
		}
		if (bundleIndex > 0) {
			const previousBundle = bundles[bundleIndex - 1];
			setBundleIndex(bundleIndex - 1);
			setSlideIndex(Math.max(previousBundle.slides.length - 1, 0));
			setProgress(0);
		}
	}, [activeBundle, bundleIndex, bundles, slideIndex]);

	const goToNext = React.useCallback(() => {
		if (!activeBundle) return;
		if (slideIndex < activeBundle.slides.length - 1) {
			setSlideIndex((current) => current + 1);
			setProgress(0);
			return;
		}
		if (bundleIndex < bundles.length - 1) {
			setBundleIndex((current) => current + 1);
			setSlideIndex(0);
			setProgress(0);
			return;
		}
		closeViewer();
	}, [activeBundle, bundleIndex, bundles.length, closeViewer, slideIndex]);

	const handleViewerKeyDown = React.useCallback(
		(event: KeyboardEvent) => {
			if (!viewerOpen) return;
			if (event.key === 'Escape') closeViewer();
			if (event.key === 'ArrowLeft') goToPrevious();
			if (event.key === 'ArrowRight' || event.key === ' ') {
				event.preventDefault();
				goToNext();
			}
		},
		[closeViewer, goToNext, goToPrevious, viewerOpen],
	);

	React.useEffect(() => {
		if (!viewerOpen || !activeSlide || reducedMotion) return;
		setProgress(0);
		const startedAt = performance.now();
		let frame = 0;

		const tick = (now: number) => {
			const nextProgress = Math.min((now - startedAt) / activeSlide.durationMs, 1);
			setProgress(nextProgress);
			if (nextProgress >= 1) {
				goToNext();
				return;
			}
			frame = window.requestAnimationFrame(tick);
		};

		frame = window.requestAnimationFrame(tick);
		return () => {
			window.cancelAnimationFrame(frame);
		};
	}, [activeSlide, goToNext, reducedMotion, viewerOpen]);

	React.useEffect(() => {
		if (!viewerOpen) return;
		window.addEventListener('keydown', handleViewerKeyDown);
		return () => {
			window.removeEventListener('keydown', handleViewerKeyDown);
		};
	}, [handleViewerKeyDown, viewerOpen]);

	if (bundles.length === 0) {
		return null;
	}

	return (
		<>
			<div className={styles.rail}>
				<div className={styles.railHeader}>
					<div>
						<div className={styles.eyebrow}>{t`Stories`}</div>
						<h2 className={styles.title}>
							<Trans>Moments from friends</Trans>
						</h2>
					</div>
					<p className={styles.subtitle}>
						<Trans>Fast, visual updates that feel closer to Instagram than a plain friends list.</Trans>
					</p>
				</div>
				<div className={styles.scroller} role="list" aria-label={t`Stories`}>
					{bundles.map((bundle, index) => (
						<button
							key={bundle.id}
							type="button"
							role="listitem"
							className={styles.storyButton}
							onClick={() => openStory(index)}
						>
							<div className={clsx(styles.ring, bundle.fresh ? styles.ringFresh : styles.ringSeen)}>
								<div className={styles.avatarWrap}>
									<StatusAwareAvatar user={bundle.user} size={64} />
								</div>
							</div>
							<div className={styles.storyMeta}>
								<div className={styles.storyName}>{bundle.user.globalName ?? bundle.user.username}</div>
								<div className={styles.storyHint}>{bundle.fresh ? <Trans>New story</Trans> : <Trans>Seen</Trans>}</div>
							</div>
						</button>
					))}
				</div>
			</div>

			<AnimatePresence>
				{viewerOpen && activeBundle && activeSlide && (
					<motion.div
						className={styles.viewerBackdrop}
						initial={reducedMotion ? false : {opacity: 0}}
						animate={{opacity: 1}}
						exit={{opacity: 0}}
						transition={{duration: reducedMotion ? 0 : 0.2}}
					>
						<motion.div
							className={styles.viewer}
							initial={reducedMotion ? false : {opacity: 0, y: 16, scale: 0.98}}
							animate={{opacity: 1, y: 0, scale: 1}}
							exit={{opacity: 0, y: 10, scale: 0.985}}
							transition={{duration: reducedMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1]}}
							style={{background: activeSlide.background}}
						>
							<div className={styles.progressRow}>
								{activeBundle.slides.map((slide, index) => {
									const fill = index < slideIndex ? 1 : index === slideIndex ? progress : 0;
									return (
										<div key={slide.id} className={styles.progressTrack}>
											<div className={styles.progressFill} style={{transform: `scaleX(${fill})`}} />
										</div>
									);
								})}
							</div>

							<div className={styles.viewerHeader}>
								<div className={styles.viewerAuthor}>
									<StatusAwareAvatar user={activeBundle.user} size={40} />
									<div className={styles.viewerCopy}>
										<div className={styles.viewerName}>{activeBundle.user.globalName ?? activeBundle.user.username}</div>
										<div className={styles.viewerTime}>{activeSlide.subtitle}</div>
									</div>
								</div>
								<button type="button" className={styles.closeButton} onClick={closeViewer} aria-label={t`Close stories`}>
									<XIcon weight="bold" />
								</button>
							</div>

							<div className={styles.viewerBody}>
								<div className={styles.viewerChrome}>
									<div className={styles.viewerBadge}>{t`Astral story`}</div>
									<h3 className={styles.viewerTitle}>{activeSlide.title}</h3>
									<p className={styles.viewerText}>
										<Trans>Short-form moments, reactions and visual drops can live here once we wire the backend.</Trans>
									</p>
								</div>
							</div>

							<button
								type="button"
								className={clsx(styles.navZone, styles.navLeft)}
								onClick={goToPrevious}
								aria-label={t`Previous story`}
							>
								<span className={styles.navIcon}>
									<CaretLeftIcon weight="bold" />
								</span>
							</button>
							<button
								type="button"
								className={clsx(styles.navZone, styles.navRight)}
								onClick={goToNext}
								aria-label={t`Next story`}
							>
								<span className={styles.navIcon}>
									<CaretRightIcon weight="bold" />
								</span>
							</button>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</>
	);
});
