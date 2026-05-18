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

import {FloatingOverlay, FloatingPortal} from '@floating-ui/react';
import {X as XIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import React from 'react';
import {useBottomSheetBackHandler} from '~/hooks/useBottomSheetBackHandler';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import OverlayStackStore from '~/stores/OverlayStackStore';
import {isNativeMobile} from '~/utils/NativeUtils';
import styles from './Sheet.module.css';

const DRAG_START_REGION_PX = 132;
const DRAG_DISMISS_DISTANCE_PX = 96;
const DRAG_DISMISS_VELOCITY_PX_PER_MS = 0.55;
const DRAG_EASE_THRESHOLD_PX = 220;

type Surface = 'primary' | 'secondary' | 'tertiary';

interface RootProps {
	isOpen: boolean;
	onClose: () => void;
	children: React.ReactNode;
	initialSnap?: number;
	snapPoints?: Array<number>;
	surface?: Surface;
	showHandle?: boolean;
	disableDrag?: boolean;
	disableDismiss?: boolean;
	avoidKeyboard?: boolean;
	zIndex?: number;
	modalEffectRootId?: string;
	backdropOpacity?: number;
	showBackdrop?: boolean;
	disableBackdropBlur?: boolean;
	className?: string;
}

const surfaceClassMap: Record<Surface, string> = {
	primary: styles.surfacePrimary,
	secondary: styles.surfaceSecondary,
	tertiary: styles.surfaceTertiary,
};

interface SheetRootContextValue {
	requestDismiss: () => void;
	disableDismiss: boolean;
}

const SheetRootContext = React.createContext<SheetRootContextValue | null>(null);

const findScrollableParent = (node: HTMLElement | null, root: HTMLElement | null): HTMLElement | null => {
	let current = node;
	while (current && current !== root) {
		const style = window.getComputedStyle(current);
		const canScrollY =
			(style.overflowY === 'auto' || style.overflowY === 'scroll') && current.scrollHeight > current.clientHeight + 1;
		if (canScrollY) {
			return current;
		}
		current = current.parentElement;
	}
	return null;
};

const RootComponent: React.FC<RootProps> = ({
	isOpen,
	onClose,
	children,
	initialSnap = 1,
	snapPoints = [0, 0.6, 1],
	surface = 'secondary',
	showHandle: _showHandle = true,
	disableDrag = false,
	disableDismiss = false,
	avoidKeyboard = true,
	zIndex: explicitZIndex,
	modalEffectRootId: _modalEffectRootId = 'root',
	backdropOpacity = 0.7,
	showBackdrop = true,
	disableBackdropBlur = false,
	className,
}) => {
	const [acquiredZIndex, setAcquiredZIndex] = React.useState<number | null>(null);
	const [dragOffsetY, setDragOffsetY] = React.useState(0);
	const [isDragging, setIsDragging] = React.useState(false);
	const rootRef = React.useRef<HTMLDivElement | null>(null);
	const dragStateRef = React.useRef<{
		active: boolean;
		startX: number;
		startY: number;
		lastY: number;
		startTime: number;
		lastTime: number;
	}>({
		active: false,
		startX: 0,
		startY: 0,
		lastY: 0,
		startTime: 0,
		lastTime: 0,
	});
	const prefersReducedMotion = useReducedMotion();
	const isMobileLayout = MobileLayoutStore.enabled;
	const resolvedSnap = React.useMemo(() => {
		const normalizedSnapPoints = Array.isArray(snapPoints) && snapPoints.length > 0 ? snapPoints : [0, 1];
		let nextSnap = Number.isFinite(initialSnap) ? Number(initialSnap) : 1;

		/*
		 * Support both fractional snaps (0..1) and index-style snaps from
		 * legacy callers. If the value is an integer > 1, treat it as index.
		 */
		if (Number.isInteger(nextSnap) && nextSnap > 1) {
			const clampedIndex = Math.max(0, Math.min(normalizedSnapPoints.length - 1, nextSnap));
			nextSnap = normalizedSnapPoints[clampedIndex] ?? 1;
		}

		if (!Number.isFinite(nextSnap)) {
			nextSnap = 1;
		}

		return Math.max(0, Math.min(1, nextSnap));
	}, [initialSnap, snapPoints]);

	React.useEffect(() => {
		if (isOpen) {
			const zIndex = OverlayStackStore.acquire();
			setAcquiredZIndex(zIndex);
			return () => {
				OverlayStackStore.release();
				setAcquiredZIndex(null);
			};
		}
		return undefined;
	}, [isOpen]);

	const zIndex = explicitZIndex ?? acquiredZIndex ?? OverlayStackStore.peek();

	useBottomSheetBackHandler(isOpen && !disableDismiss, onClose, isNativeMobile());

	const requestDismiss = React.useCallback(() => {
		if (disableDismiss) return;
		onClose();
	}, [disableDismiss, onClose]);

	React.useEffect(() => {
		if (!isOpen) {
			dragStateRef.current.active = false;
			setIsDragging(false);
			setDragOffsetY(0);
		}
	}, [isOpen]);

	const handleTouchStart = React.useCallback(
		(event: React.TouchEvent<HTMLDivElement>) => {
			if (!isMobileLayout || disableDrag || disableDismiss || event.touches.length !== 1) {
				return;
			}

			const touch = event.touches[0];
			const target = event.target as HTMLElement | null;
			const sheetRoot = rootRef.current;
			if (!touch || !sheetRoot) {
				return;
			}

			if (
				target?.closest(
					'input, textarea, select, button, a, [role="button"], [role="slider"], [contenteditable="true"], [data-sheet-drag-ignore="true"]',
				)
			) {
				return;
			}

			const sheetBounds = sheetRoot.getBoundingClientRect();
			const pointerInsideTopRegion = touch.clientY - sheetBounds.top <= DRAG_START_REGION_PX;
			if (!pointerInsideTopRegion) {
				return;
			}

			const scrollableParent = findScrollableParent(target, sheetRoot);
			if (scrollableParent && scrollableParent.scrollTop > 0) {
				return;
			}

			const now = performance.now();
			dragStateRef.current = {
				active: true,
				startX: touch.clientX,
				startY: touch.clientY,
				lastY: touch.clientY,
				startTime: now,
				lastTime: now,
			};
			setIsDragging(true);
		},
		[disableDismiss, disableDrag, isMobileLayout],
	);

	const handleTouchMove = React.useCallback((event: React.TouchEvent<HTMLDivElement>) => {
		const dragState = dragStateRef.current;
		if (!dragState.active || event.touches.length !== 1) {
			return;
		}

		const touch = event.touches[0];
		const deltaX = Math.abs(touch.clientX - dragState.startX);
		const deltaY = touch.clientY - dragState.startY;

		// Keep horizontal gestures and upward movements untouched.
		if (deltaY <= 0 || deltaX > Math.max(12, deltaY)) {
			return;
		}

		event.preventDefault();

		const easedDelta =
			Math.min(deltaY, DRAG_EASE_THRESHOLD_PX) * 0.92 +
			Math.max(0, deltaY - DRAG_EASE_THRESHOLD_PX) * 0.18;

		dragState.lastY = touch.clientY;
		dragState.lastTime = performance.now();
		setDragOffsetY(Math.max(0, easedDelta));
	}, []);

	const handleTouchEnd = React.useCallback(() => {
		const dragState = dragStateRef.current;
		if (!dragState.active) {
			return;
		}

		dragState.active = false;
		setIsDragging(false);

		const totalDeltaY = Math.max(0, dragState.lastY - dragState.startY);
		const elapsedMs = Math.max(1, dragState.lastTime - dragState.startTime);
		const velocity = totalDeltaY / elapsedMs;

		const shouldDismiss =
			totalDeltaY >= DRAG_DISMISS_DISTANCE_PX || velocity >= DRAG_DISMISS_VELOCITY_PX_PER_MS;

		if (shouldDismiss) {
			setDragOffsetY(0);
			requestDismiss();
			return;
		}

		setDragOffsetY(0);
	}, [requestDismiss]);

	/*
	 * Keep Escape behavior consistent with regular modal surfaces while
	 * respecting stack order and disableDismiss semantics.
	 */
	React.useEffect(() => {
		if (!isOpen || acquiredZIndex == null || disableDismiss) return;
		const handler = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			if (acquiredZIndex !== OverlayStackStore.peek()) return;
			event.stopPropagation();
			onClose();
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	}, [isOpen, acquiredZIndex, disableDismiss, onClose]);

	return (
		<AnimatePresence initial={false}>
			{isOpen && (
				<FloatingPortal>
					<FloatingOverlay
						data-rsbs-root=""
						lockScroll={avoidKeyboard}
						style={{
							position: 'fixed',
							inset: 0,
							overflow: 'hidden',
							zIndex,
							pointerEvents: showBackdrop ? 'auto' : 'none',
						}}
					>
						{showBackdrop && (
							<motion.div
								data-rsbs-backdrop=""
								className={styles.backdrop}
								onClick={requestDismiss}
								initial={{opacity: 0}}
								animate={{opacity: 1, transition: prefersReducedMotion ? {duration: 0.06} : {duration: 0.16, ease: [0.2, 0, 0, 1]}}}
								exit={{opacity: 0, transition: prefersReducedMotion ? {duration: 0.06} : {duration: 0.1, ease: [0.4, 0, 1, 1]}}}
								style={{
									position: 'absolute',
									inset: 0,
									background: `linear-gradient(160deg, rgba(3, 8, 20, ${Math.max(backdropOpacity - 0.2, 0)}) 0%, rgba(3, 8, 20, ${backdropOpacity}) 100%)`,
									backdropFilter: disableBackdropBlur ? 'none' : 'blur(10px) saturate(118%)',
									WebkitBackdropFilter: disableBackdropBlur ? 'none' : 'blur(10px) saturate(118%)',
								}}
							/>
						)}

						<motion.div
							data-rsbs-overlay=""
							className={clsx(styles.container, surfaceClassMap[surface])}
							initial={prefersReducedMotion ? {opacity: 0} : {y: '6%', opacity: 0.98}}
							animate={{
								y: 0,
								opacity: 1,
								transition: prefersReducedMotion
									? {duration: 0.06}
									: {duration: 0.18, ease: [0.22, 1, 0.36, 1]},
							}}
							exit={{
								...(prefersReducedMotion ? {opacity: 0} : {y: '6%', opacity: 0.98}),
								transition: prefersReducedMotion
									? {duration: 0.06}
									: {duration: 0.12, ease: [0.4, 0, 1, 1]},
							}}
							style={{
								position: 'absolute',
								inset: 0,
								willChange: 'transform, opacity',
							}}
							onClick={(event) => event.stopPropagation()}
						>
							<SheetRootContext.Provider value={{requestDismiss, disableDismiss}}>
								<div
									ref={rootRef}
									className={clsx(styles.root, className)}
									style={
										{
											'--sheet-open-snap': String(resolvedSnap),
											transform: dragOffsetY > 0 ? `translate3d(0, ${dragOffsetY}px, 0)` : undefined,
											transition:
												isDragging || dragOffsetY <= 0
													? undefined
													: 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
										} as React.CSSProperties
									}
									onTouchStart={handleTouchStart}
									onTouchMove={handleTouchMove}
									onTouchEnd={handleTouchEnd}
									onTouchCancel={handleTouchEnd}
								>
									{children}
								</div>
							</SheetRootContext.Provider>
						</motion.div>
					</FloatingOverlay>
				</FloatingPortal>
			)}
		</AnimatePresence>
	);
};

const Root = observer(RootComponent);

interface HandleProps {
	className?: string;
}

const Handle: React.FC<HandleProps> = ({className}) => (
	<div className={clsx(styles.handle, className)} aria-hidden="true">
		<div className={styles.handleBar} />
	</div>
);

type HeaderAlign = 'center' | 'start' | 'end';

interface HeaderProps {
	children?: React.ReactNode;
	leading?: React.ReactNode;
	trailing?: React.ReactNode;
	border?: boolean;
	align?: HeaderAlign;
	padding?: 'sm' | 'md' | 'lg';
	className?: string;
	safeAreaTop?: boolean;
	after?: React.ReactNode;
}

const headerAlignClassMap: Record<HeaderAlign, string> = {
	center: '',
	start: styles.headerAlignStart,
	end: styles.headerAlignEnd,
};

const headerPaddingClassMap: Record<'sm' | 'md' | 'lg', string> = {
	sm: styles.headerPaddingSm,
	md: styles.headerPaddingMd,
	lg: styles.headerPaddingLg,
};

const Header: React.FC<HeaderProps> = ({
	children,
	leading,
	trailing,
	border = true,
	align = 'center',
	padding = 'md',
	className,
	safeAreaTop = false,
	after,
}) => (
	<div
		className={clsx(
			styles.header,
			border && styles.headerBorder,
			headerPaddingClassMap[padding],
			headerAlignClassMap[align],
			safeAreaTop && styles.headerSafeArea,
			className,
		)}
	>
		<div className={styles.headerGrid}>
			<div className={clsx(styles.headerSlot, styles.headerSlotLeading)}>{leading}</div>
			<div className={styles.headerCenter}>{children}</div>
			<div className={clsx(styles.headerSlot, styles.headerSlotTrailing)}>{trailing}</div>
		</div>
		{after && <div className={styles.headerAfter}>{after}</div>}
	</div>
);

interface TitleProps {
	children: React.ReactNode;
	as?: 'h2' | 'h3' | 'span';
}

const Title: React.FC<TitleProps> = ({children, as: Component = 'h2'}) => (
	<Component className={styles.title}>{children}</Component>
);

interface SubtitleProps {
	children: React.ReactNode;
}

const Subtitle: React.FC<SubtitleProps> = ({children}) => <p className={styles.subtitle}>{children}</p>;

interface ContentProps {
	children: React.ReactNode;
	padding?: 'none' | 'md';
	scrollable?: boolean;
	className?: string;
}

const Content: React.FC<ContentProps> = ({children, padding = 'md', scrollable = true, className}) => (
	<div className={clsx(styles.content, padding === 'none' && styles.contentNoPadding, className)}>
		<div className={clsx(styles.contentInner, !scrollable && styles.contentStatic)}>{children}</div>
	</div>
);

interface SectionProps {
	children: React.ReactNode;
	className?: string;
}

const Section: React.FC<SectionProps> = ({children, className}) => (
	<div className={clsx(styles.section, className)}>{children}</div>
);

interface FooterProps {
	children: React.ReactNode;
	border?: boolean;
	className?: string;
}

const Footer: React.FC<FooterProps> = ({children, border = true, className}) => (
	<div className={clsx(styles.footer, !border && styles.footerNoBorder, className)}>{children}</div>
);

interface ActionsProps {
	children: React.ReactNode;
	className?: string;
}

const Actions: React.FC<ActionsProps> = ({children, className}) => (
	<div className={clsx(styles.actions, className)}>{children}</div>
);

interface DividerProps {
	className?: string;
}

const Divider: React.FC<DividerProps> = ({className}) => <div className={clsx(styles.divider, className)} />;

interface CloseButtonProps {
	onClick: () => void;
	className?: string;
}

const CloseButton: React.FC<CloseButtonProps> = ({onClick, className}) => (
	<button type="button" onClick={onClick} className={clsx(styles.closeButton, className)} aria-label="Close">
		<XIcon weight="bold" />
	</button>
);

export {Root, Handle, Header, Title, Subtitle, Content, Section, Footer, Actions, Divider, CloseButton};
