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

import {useCallback, useRef} from 'react';

/*
 * Telegram-style "Thanos snap" disintegrate effect for DOM nodes.
 *
 * Implementation: SVG `feTurbulence` + `feDisplacementMap` filter.
 * On call we drop a single global SVG element into the body that
 * defines the filter, then apply the filter to the target node and
 * animate the displacement scale + opacity + translate. The filter's
 * fractal-noise displacement spreads each pixel of the rendered node
 * outward, producing the same "dissolve into dust" look as Telegram
 * without needing to snapshot the DOM into a canvas (which broke on
 * any message containing CDN images because of CORS-tainted canvas).
 *
 * SMIL `<animate>` inside the filter drives the displacement scale on
 * the GPU; CSS transitions on the host element handle opacity and
 * the slight horizontal drift so everything stays in lockstep with
 * `prefers-reduced-motion` (we just resolve immediately if reduced).
 *
 * Returns a Promise that resolves when the animation finishes so
 * callers can chain `await disintegrate()` before the actual delete
 * API call.
 */

interface DisintegrateOptions {
	durationMs?: number;
	driftX?: number;
	driftY?: number;
}

const DEFAULT_OPTIONS: Required<DisintegrateOptions> = {
	durationMs: 1100,
	driftX: 80,
	driftY: -40,
};

const FILTER_ID_PREFIX = 'astral-thanos-snap';
let filterCounter = 0;

const prefersReducedMotion = (): boolean =>
	typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

function ensureFilterRoot(): SVGSVGElement {
	let svg = document.querySelector<SVGSVGElement>('svg[data-thanos-filter-root]');
	if (svg) return svg;

	svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
	svg.setAttribute('data-thanos-filter-root', 'true');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('width', '0');
	svg.setAttribute('height', '0');
	svg.style.position = 'absolute';
	svg.style.width = '0';
	svg.style.height = '0';
	svg.style.overflow = 'hidden';
	svg.style.pointerEvents = 'none';
	document.body.appendChild(svg);
	return svg;
}

function spawnFilter(durationMs: number): {filterId: string; cleanup: () => void} {
	const root = ensureFilterRoot();
	const filterId = `${FILTER_ID_PREFIX}-${++filterCounter}`;

	const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
	filter.setAttribute('id', filterId);
	filter.setAttribute('x', '-50%');
	filter.setAttribute('y', '-50%');
	filter.setAttribute('width', '200%');
	filter.setAttribute('height', '200%');

	const turbulence = document.createElementNS('http://www.w3.org/2000/svg', 'feTurbulence');
	turbulence.setAttribute('type', 'fractalNoise');
	turbulence.setAttribute('baseFrequency', '0.018');
	turbulence.setAttribute('numOctaves', '2');
	turbulence.setAttribute('result', 'noise');

	const displacement = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap');
	displacement.setAttribute('in', 'SourceGraphic');
	displacement.setAttribute('in2', 'noise');
	displacement.setAttribute('scale', '0');
	displacement.setAttribute('xChannelSelector', 'R');
	displacement.setAttribute('yChannelSelector', 'G');

	const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
	animate.setAttribute('attributeName', 'scale');
	animate.setAttribute('from', '0');
	animate.setAttribute('to', '180');
	animate.setAttribute('dur', `${durationMs}ms`);
	animate.setAttribute('fill', 'freeze');
	animate.setAttribute('calcMode', 'spline');
	animate.setAttribute('keySplines', '0.32 0 0.67 0');
	displacement.appendChild(animate);

	filter.appendChild(turbulence);
	filter.appendChild(displacement);
	root.appendChild(filter);

	// Kick the SMIL animation explicitly — some browsers don't auto-start
	// when the element is created via DOM and isn't yet inserted at the
	// time of `appendChild`. beginElement() forces it to play now.
	try {
		(animate as any).beginElement?.();
	} catch {
		// Safari throws on beginElement when the document hasn't yet
		// painted; the animation still triggers via the `dur` fallback.
	}

	const cleanup = () => {
		if (filter.parentNode) {
			filter.parentNode.removeChild(filter);
		}
	};

	return {filterId, cleanup};
}

export function useThanosDisintegrate<T extends HTMLElement>(externalRef?: React.RefObject<T | null>): {
	ref: React.MutableRefObject<T | null>;
	disintegrate: (options?: DisintegrateOptions) => Promise<void>;
} {
	const internalRef = useRef<T | null>(null);
	const resolvedRef = externalRef ?? internalRef;

	const disintegrate = useCallback(
		async (options?: DisintegrateOptions) => {
			const node = resolvedRef.current;
			if (!node) return;
			if (prefersReducedMotion()) return;

			const opts = {...DEFAULT_OPTIONS, ...(options ?? {})};

			/*
			 * Clone the node into a fixed-position overlay attached to
			 * <body>. The clone animates independently of React — when
			 * the gateway delete dispatch unmounts the original node
			 * milliseconds later, the animation keeps running on the
			 * clone until completion.
			 *
			 * Without this indirection the filter was applied to the
			 * real node, which got unmounted by MESSAGE_DELETE before
			 * the 1.1s SMIL animation could finish — users saw nothing
			 * at all. The overlay outlives React's DOM updates.
			 */
			const rect = node.getBoundingClientRect();
			const clone = node.cloneNode(true) as HTMLElement;
			clone.style.position = 'fixed';
			clone.style.left = `${rect.left}px`;
			clone.style.top = `${rect.top}px`;
			clone.style.width = `${rect.width}px`;
			clone.style.height = `${rect.height}px`;
			clone.style.margin = '0';
			clone.style.pointerEvents = 'none';
			clone.style.zIndex = '9999';
			clone.setAttribute('aria-hidden', 'true');
			clone.setAttribute('data-thanos-clone', 'true');
			document.body.appendChild(clone);

			// Hide the original so we don't render it twice. The real
			// node will be unmounted by the gateway dispatch shortly.
			const originalVisibility = node.style.visibility;
			node.style.visibility = 'hidden';

			const {filterId, cleanup} = spawnFilter(opts.durationMs);

			clone.style.filter = `url(#${filterId})`;
			clone.style.transition =
				`transform ${opts.durationMs}ms cubic-bezier(0.4, 0, 0.7, 0.1), ` +
				`opacity ${opts.durationMs}ms cubic-bezier(0.4, 0, 0.7, 0.1)`;

			// Force a reflow so the browser registers the starting state
			// before we apply the end state. Without this the transition
			// is skipped and the element jumps straight to opacity:0.
			void clone.offsetWidth;

			clone.style.transform = `translate(${opts.driftX}px, ${opts.driftY}px)`;
			clone.style.opacity = '0';

			return new Promise<void>((resolve) => {
				const finish = () => {
					cleanup();
					if (clone.parentNode) clone.parentNode.removeChild(clone);
					// Only restore visibility if the original is still in
					// the DOM — if React already unmounted it, this no-ops.
					if (node.isConnected) {
						node.style.visibility = originalVisibility;
					}
					resolve();
				};
				window.setTimeout(finish, opts.durationMs + 50);
			});
		},
		[resolvedRef],
	);

	return {ref: internalRef, disintegrate};
}
