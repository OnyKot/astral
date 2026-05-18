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

import {FloatingFocusManager, useFloating, useMergeRefs} from '@floating-ui/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as PopoutActionCreators from '~/actions/PopoutActionCreators';
import {type Popout, PopoutKeyContext} from '~/components/uikit/Popout';
import styles from '~/components/uikit/Popout/Popout.module.css';
import {useAntiShiftFloating} from '~/hooks/useAntiShiftFloating';
import AccessibilityStore from '~/stores/AccessibilityStore';
import LayerManager from '~/stores/LayerManager';
import PopoutStore from '~/stores/PopoutStore';
import {isScrollbarDragActive} from '~/utils/ScrollbarDragState';

type PopoutItemProps = Omit<Popout, 'key'> & {
	popoutKey: string;
	isTopmost: boolean;
	hoverMode?: boolean;
	onContentMouseEnter?: () => void;
	onContentMouseLeave?: () => void;
};

const FOCUSABLE_SELECTOR =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [contenteditable=""], [contenteditable="true"]';

const findInitialFocusTarget = (root: HTMLElement): HTMLElement | null => {
	const explicit = root.querySelector<HTMLElement>('[data-autofocus], [autofocus]');
	if (explicit) {
		return explicit;
	}
	const focusable = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
	for (const element of focusable) {
		if (element.getAttribute('aria-hidden') === 'true') continue;
		return element;
	}
	return null;
};

const PopoutItem: React.FC<PopoutItemProps> = observer(
	({
		popoutKey,
		isTopmost,
		render,
		position,
		target,
		zIndexBoost,
		shouldAutoUpdate = true,
		offsetMainAxis = 8,
		offsetCrossAxis = 0,
		animationType = 'smooth',
		containerClass,
		onCloseRequest,
		onClose,
		returnFocusRef,
		hoverMode,
		onContentMouseEnter,
		onContentMouseLeave,
	}) => {
		const {
			ref: popoutRef,
			state,
			style,
		} = useAntiShiftFloating(target, true, {
			placement: position,
			offsetMainAxis,
			offsetCrossAxis,
			shouldAutoUpdate,
			enableSmartBoundary: true,
			constrainHeight: true,
		});

		const {refs: focusRefs, context: focusContext} = useFloating({open: true});

		React.useLayoutEffect(() => {
			focusRefs.setReference(target);
		}, [focusRefs, target]);

		const mergedPopoutRef = useMergeRefs([popoutRef, focusRefs.setFloating]);

		const prefersReducedMotion = AccessibilityStore.useReducedMotion;

		const [isVisible, setIsVisible] = React.useState(true);
		const [targetInDOM, setTargetInDOM] = React.useState(true);
		const hasFocusedInitialRef = React.useRef(false);

		React.useLayoutEffect(() => {
			if (!document.contains(target)) {
				setTargetInDOM(false);
				setIsVisible(false);
			}
		});

		React.useLayoutEffect(() => {
			if (!state.isReady || !isVisible || !targetInDOM || hasFocusedInitialRef.current) {
				return;
			}
			const root = popoutRef.current;
			if (!root) return;
			const focusTarget = findInitialFocusTarget(root) ?? root;
			if (focusTarget === root && !root.hasAttribute('tabindex')) {
				root.tabIndex = -1;
			}
			focusTarget?.focus({preventScroll: true});
			hasFocusedInitialRef.current = true;
		}, [state.isReady, isVisible, targetInDOM, popoutRef]);

		const transitionStyles = React.useMemo(() => {
			const shouldAnimate = animationType === 'smooth' && !prefersReducedMotion;
			const duration = shouldAnimate ? '220ms' : '0ms';
			const isPositioned = animationType === 'none' ? true : state.isReady;
			const transform = getTransform(shouldAnimate, isVisible, isPositioned, targetInDOM);
			/*
			 * Spring-style overshoot via cubic-bezier rather than framer-
			 * motion so we don't pay JS runtime per popout. The curve sets
			 * a slight bounce on opening (avatar profile, emoji popouts,
			 * tooltips on hover) so they feel anchored to the trigger
			 * instead of mechanically fading in. Opacity uses a softer
			 * ease-out so the visual hand-off matches.
			 */
			const easing = 'cubic-bezier(0.34, 1.36, 0.64, 1)';
			return {
				opacity: isVisible && targetInDOM ? 1 : 0,
				transform,
				transition: `opacity ${duration} cubic-bezier(0.22, 1, 0.36, 1)${shouldAnimate ? `, transform ${duration} ${easing}` : ''}`,
				pointerEvents: isPositioned && targetInDOM ? ('auto' as const) : ('none' as const),
				display: targetInDOM ? undefined : ('none' as const),
			};
		}, [isVisible, state.isReady, animationType, prefersReducedMotion, targetInDOM]);

		const closeSelf = React.useCallback(() => {
			setIsVisible(false);
			const closeDuration = animationType === 'smooth' && !prefersReducedMotion ? 250 : 0;

			setTimeout(() => {
				onClose?.();
				PopoutActionCreators.close(popoutKey);
			}, closeDuration);
		}, [animationType, prefersReducedMotion, onClose, popoutKey]);

		React.useEffect(() => {
			const el = popoutRef.current;

			if (!document.contains(target)) {
				setIsVisible(false);
				const closeDuration = animationType === 'smooth' && !prefersReducedMotion ? 250 : 0;
				setTimeout(() => {
					onClose?.();
					PopoutActionCreators.close(popoutKey);
				}, closeDuration);
				return;
			}

			const handleOutsideClick = (event: MouseEvent) => {
				if (isScrollbarDragActive()) {
					return;
				}

				if (LayerManager.hasType('contextmenu')) {
					return;
				}

				const targetElement = event.target;
				if (!(targetElement instanceof HTMLElement)) return;

				if (
					targetElement.closest('[role="dialog"][aria-modal="true"]') ||
					targetElement.className.includes('backdrop') ||
					targetElement.closest('.focusLock')
				) {
					return;
				}

				if (el && !el.contains(targetElement)) {
					if (onCloseRequest && !onCloseRequest(event)) {
						return;
					}

					setIsVisible(false);
					const closeDuration = animationType === 'smooth' && !prefersReducedMotion ? 250 : 0;

					setTimeout(() => {
						onClose?.();
						PopoutActionCreators.close(popoutKey);
					}, closeDuration);
				}
			};

			const observer = new MutationObserver(() => {
				if (!document.contains(target)) {
					setTargetInDOM(false);
					setIsVisible(false);
					const closeDuration = animationType === 'smooth' && !prefersReducedMotion ? 250 : 0;
					setTimeout(() => {
						onClose?.();
						PopoutActionCreators.close(popoutKey);
					}, closeDuration);
				}
			});

			observer.observe(document.body, {
				childList: true,
				subtree: true,
			});

			document.addEventListener('click', handleOutsideClick, true);

			return () => {
				observer.disconnect();
				document.removeEventListener('click', handleOutsideClick, true);
			};
		}, [popoutKey, target, onCloseRequest, onClose, animationType, prefersReducedMotion, popoutRef]);

		const handleMouseEnter = React.useCallback(() => {
			if (hoverMode && onContentMouseEnter) {
				onContentMouseEnter();
			}
		}, [hoverMode, onContentMouseEnter]);

		const handleMouseLeave = React.useCallback(() => {
			if (hoverMode && onContentMouseLeave) {
				onContentMouseLeave();
			}
		}, [hoverMode, onContentMouseLeave]);

		return (
			<FloatingFocusManager
				context={focusContext}
				disabled={!isTopmost}
				returnFocus={returnFocusRef ?? true}
				initialFocus={focusRefs.floating}
			>
				<PopoutKeyContext.Provider value={popoutKey}>
					<div
						ref={mergedPopoutRef}
						className={clsx(styles.popout, containerClass)}
						aria-modal
						role="dialog"
						tabIndex={-1}
						onMouseEnter={handleMouseEnter}
						onMouseLeave={handleMouseLeave}
						style={{
							...style,
							zIndex: zIndexBoost != null ? 1000 + zIndexBoost : undefined,
							...transitionStyles,
							visibility: state.isReady && isVisible && targetInDOM ? 'visible' : 'hidden',
						}}
					>
						{render({
							popoutKey,
							onClose: closeSelf,
						})}
					</div>
				</PopoutKeyContext.Provider>
			</FloatingFocusManager>
		);
	},
);

export const Popouts: React.FC = observer(() => {
	const prevPopoutKeysRef = React.useRef<Set<string>>(new Set());
	const popouts = PopoutStore.getPopouts();
	const topPopout = popouts.length ? popouts[popouts.length - 1] : null;
	const needsBackdrop = Boolean(topPopout && !topPopout.disableBackdrop);

	React.useEffect(() => {
		const currentKeys = new Set(Object.keys(PopoutStore.popouts));
		const prevKeys = prevPopoutKeysRef.current;

		currentKeys.forEach((key) => {
			if (!prevKeys.has(key)) {
				LayerManager.addLayer('popout', key);
			}
		});

		prevKeys.forEach((key) => {
			if (!currentKeys.has(key)) {
				LayerManager.removeLayer('popout', key);
			}
		});

		prevPopoutKeysRef.current = currentKeys;
	}, [PopoutStore.popouts]);

	React.useEffect(() => {
		return () => {
			prevPopoutKeysRef.current.forEach((key) => {
				LayerManager.removeLayer('popout', key);
			});

			queueMicrotask(() => {
				document.querySelectorAll('[data-floating-ui-portal]').forEach((portal) => {
					if (!portal.hasChildNodes() || !document.body.contains(portal.parentElement)) {
						portal.remove();
					}
				});
			});
		};
	}, []);

	const handleBackdropPointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		if (isScrollbarDragActive()) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		PopoutActionCreators.closeAll();
	}, []);

	return (
		<div className={styles.popouts} data-popouts-root data-overlay-pass-through="true">
			{needsBackdrop && (
				<div className={styles.backdrop} onPointerDown={handleBackdropPointerDown} aria-hidden="true" />
			)}
			{popouts.map((popout) => (
				<PopoutItem
					{...popout}
					key={popout.key}
					popoutKey={popout.key.toString()}
					isTopmost={topPopout?.key === popout.key}
				/>
			))}
		</div>
	);
});

const getTransform = (
	shouldAnimate: boolean,
	isVisible: boolean,
	isPositioned: boolean,
	targetInDOM: boolean,
): string => {
	if (!shouldAnimate) return 'scale(1)';
	/*
	 * Drop scale a touch lower (0.94 instead of 0.98) and add a small
	 * vertical translate so the popout feels like it slides down from
	 * the avatar/trigger element instead of just scaling in place.
	 * Combined with the spring cubic-bezier in transitionStyles this
	 * gives a tactile "pop" without animation library overhead.
	 */
	return isVisible && isPositioned && targetInDOM ? 'translateY(0) scale(1)' : 'translateY(-4px) scale(0.94)';
};
