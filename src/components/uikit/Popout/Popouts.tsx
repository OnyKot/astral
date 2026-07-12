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
import OverlayStackStore from '~/stores/OverlayStackStore';
import PopoutStore from '~/stores/PopoutStore';
import {isScrollbarDragActive} from '~/utils/ScrollbarDragState';

const POPOUT_OPEN_MS = 240;
const POPOUT_CLOSE_MS = 180;
const POPOUT_OPEN_EASE = 'cubic-bezier(0.2, 0.82, 0.24, 1)';
const POPOUT_CLOSE_EASE = 'cubic-bezier(0.28, 0, 0.2, 1)';

const animatedCloseHandlers = new Map<string, () => void>();

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
		const [isVisible, setIsVisible] = React.useState(true);
		const [isClosing, setIsClosing] = React.useState(false);
		const [targetInDOM, setTargetInDOM] = React.useState(true);
		const hasFocusedInitialRef = React.useRef(false);
		const closeFallbackTimerRef = React.useRef<number | null>(null);
		const isActive = isVisible && targetInDOM && !isClosing;

		const {
			ref: popoutRef,
			state,
			style,
		} = useAntiShiftFloating(target, isActive, {
			placement: position,
			offsetMainAxis,
			offsetCrossAxis,
			shouldAutoUpdate: shouldAutoUpdate && isActive,
			enableSmartBoundary: true,
			constrainHeight: true,
		});

		const {refs: focusRefs, context: focusContext} = useFloating({open: true});

		React.useLayoutEffect(() => {
			focusRefs.setReference(target);
		}, [focusRefs, target]);

		const mergedPopoutRef = useMergeRefs([popoutRef, focusRefs.setFloating]);

		const prefersReducedMotion = AccessibilityStore.useReducedMotion;
		const shouldAnimate = animationType === 'smooth' && !prefersReducedMotion;

		const finishClose = React.useCallback(() => {
			if (closeFallbackTimerRef.current != null) {
				window.clearTimeout(closeFallbackTimerRef.current);
				closeFallbackTimerRef.current = null;
			}
			setIsClosing(false);
			onClose?.();
			PopoutActionCreators.close(popoutKey);
		}, [onClose, popoutKey]);

		const beginClose = React.useCallback(() => {
			if (!isVisible || isClosing) {
				return;
			}

			if (!shouldAnimate) {
				setIsVisible(false);
				finishClose();
				return;
			}

			setIsClosing(true);

			const node = popoutRef.current;
			const armCloseTransition = () => {
				setIsVisible(false);

				if (!node) {
					finishClose();
					return;
				}

				let didFinish = false;
				const handleTransitionEnd = (event: TransitionEvent) => {
					if (didFinish || event.target !== node || event.propertyName !== 'opacity') {
						return;
					}
					didFinish = true;
					node.removeEventListener('transitionend', handleTransitionEnd);
					finishClose();
				};

				node.addEventListener('transitionend', handleTransitionEnd);
				closeFallbackTimerRef.current = window.setTimeout(() => {
					if (didFinish) {
						return;
					}
					didFinish = true;
					node.removeEventListener('transitionend', handleTransitionEnd);
					finishClose();
				}, POPOUT_CLOSE_MS + 48);
			};

			requestAnimationFrame(() => {
				requestAnimationFrame(armCloseTransition);
			});
		}, [finishClose, isClosing, isVisible, popoutRef, shouldAnimate]);

		React.useLayoutEffect(() => {
			return () => {
				if (closeFallbackTimerRef.current != null) {
					window.clearTimeout(closeFallbackTimerRef.current);
				}
			};
		}, []);

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
			const durationMs = isClosing ? POPOUT_CLOSE_MS : POPOUT_OPEN_MS;
			const duration = shouldAnimate ? `${durationMs}ms` : '0ms';
			const isPositioned = animationType === 'none' ? true : state.isReady;
			const transform = getTransform(shouldAnimate, isVisible, isPositioned, targetInDOM);
			const easing = isClosing ? POPOUT_CLOSE_EASE : POPOUT_OPEN_EASE;
			const isAnimating = shouldAnimate && (!isPositioned || isClosing);
			return {
				opacity: isVisible && targetInDOM ? 1 : 0,
				transform,
				transition: shouldAnimate ? `opacity ${duration} ${easing}, transform ${duration} ${easing}` : 'none',
				willChange: isAnimating ? ('transform, opacity' as const) : undefined,
				pointerEvents: isPositioned && targetInDOM && isVisible ? ('auto' as const) : ('none' as const),
				display: targetInDOM ? undefined : ('none' as const),
			};
		}, [isClosing, isVisible, state.isReady, animationType, shouldAnimate, targetInDOM]);

		const closeSelf = beginClose;

		React.useEffect(() => {
			animatedCloseHandlers.set(popoutKey, beginClose);
			return () => {
				animatedCloseHandlers.delete(popoutKey);
			};
		}, [beginClose, popoutKey]);

		React.useEffect(() => {
			const el = popoutRef.current;

			if (!document.contains(target)) {
				beginClose();
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

					beginClose();
				}
			};

			const observer = new MutationObserver(() => {
				if (!document.contains(target)) {
					setTargetInDOM(false);
					beginClose();
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
		}, [beginClose, onCloseRequest, popoutRef, target]);

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

		const canRender = targetInDOM && (animationType === 'none' || state.isReady || isClosing);
		const popoutZIndex = React.useMemo(() => {
			const boostedZIndex = zIndexBoost != null ? 1000 + zIndexBoost : undefined;
			const modalHost = target.closest('[role="dialog"][aria-modal="true"], .modal-backdrop, .focusLock');
			if (!modalHost) return boostedZIndex;
			return Math.max(boostedZIndex ?? 0, OverlayStackStore.peek() + 1);
		}, [target, zIndexBoost]);

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
							zIndex: popoutZIndex,
							...transitionStyles,
							visibility: canRender && (isVisible || isClosing) ? 'visible' : 'hidden',
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

		if (topPopout) {
			const animatedClose = animatedCloseHandlers.get(topPopout.key.toString());
			if (animatedClose) {
				animatedClose();
				return;
			}
		}

		PopoutActionCreators.closeAll();
	}, [topPopout]);

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
	return isVisible && isPositioned && targetInDOM ? 'translate3d(0, 0, 0) scale(1)' : 'translate3d(0, -3px, 0) scale(0.99)';
};
