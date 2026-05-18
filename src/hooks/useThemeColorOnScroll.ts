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

/*
 * Dynamic iOS status bar / Android browser chrome tint based on the
 * channel message list scroll position.
 *
 * When the user scrolls away from the top, we darken the <meta
 * name="theme-color"> slightly so the iOS status bar / Android
 * browser chrome gets a subtle tint that signals "there's content
 * above, scroll up to see it". At the top, we return to the
 * baseline color so it matches the channel header.
 *
 * Note: iOS Safari with apple-mobile-web-app-status-bar-style=
 * "black-translucent" already shows the content under the status
 * bar, so this hook mostly affects Android Chrome + PWAs on iOS.
 *
 * Throttled via requestAnimationFrame so we update at most once per
 * frame even on fast scroll.
 */

import {useEffect, useRef} from 'react';

const META_SELECTOR = 'meta[name="theme-color"]';

interface UseThemeColorOnScrollArgs {
	scrollElementRef: React.RefObject<HTMLElement | null>;
	/** Base color when at scroll top. Defaults to current meta value. */
	baseColor?: string;
	/** Color when scrolled past threshold. */
	scrolledColor: string;
	/** Scroll distance (px) that triggers the tinted state. */
	threshold?: number;
}

export function useThemeColorOnScroll({
	scrollElementRef,
	baseColor,
	scrolledColor,
	threshold = 32,
}: UseThemeColorOnScrollArgs): void {
	const rafRef = useRef<number | null>(null);
	const lastStateRef = useRef<'top' | 'scrolled' | null>(null);

	useEffect(() => {
		const meta = document.querySelector<HTMLMetaElement>(META_SELECTOR);
		if (!meta) return;
		const originalColor = baseColor ?? meta.content;

		const scrollEl = scrollElementRef.current;
		if (!scrollEl) return;

		const update = () => {
			rafRef.current = null;
			const scrollTop = scrollEl.scrollTop ?? 0;
			const nextState: 'top' | 'scrolled' = scrollTop > threshold ? 'scrolled' : 'top';
			if (nextState === lastStateRef.current) return;
			lastStateRef.current = nextState;
			meta.content = nextState === 'scrolled' ? scrolledColor : originalColor;
		};

		const onScroll = () => {
			if (rafRef.current != null) return;
			rafRef.current = requestAnimationFrame(update);
		};

		scrollEl.addEventListener('scroll', onScroll, {passive: true});
		// Run once to set initial state
		update();

		return () => {
			scrollEl.removeEventListener('scroll', onScroll);
			if (rafRef.current != null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
			// Restore original on unmount so we don't leak a stale tint
			// into other screens.
			meta.content = originalColor;
			lastStateRef.current = null;
		};
	}, [scrollElementRef, baseColor, scrolledColor, threshold]);
}
