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

import {useLingui} from '@lingui/react/macro';
import {
	BookmarkSimpleIcon,
	ChatCircleDotsIcon,
	CompassIcon,
	GearIcon,
	ListIcon,
	PlusIcon,
	UserCircleIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import {CustomStatusDisplay} from '~/components/common/CustomStatusDisplay/CustomStatusDisplay';
import {FriendsIcon} from '~/components/icons/FriendsIcon';
import {AddGuildModal} from '~/components/modals/AddGuildModal';
import {CustomStatusBottomSheet} from '~/components/modals/CustomStatusBottomSheet';
import {UserSettingsModal} from '~/components/modals/UserSettingsModal';
import {StatusAwareAvatar} from '~/components/uikit/StatusAwareAvatar';
import {normalizeCustomStatus} from '~/lib/customStatus';
import {useLocation} from '~/lib/router';
import {Routes} from '~/Routes';
import MobileNavigationStore from '~/stores/MobileNavigationStore';
import ModalStore from '~/stores/ModalStore';
import PresenceStore from '~/stores/PresenceStore';
import UserStore from '~/stores/UserStore';
import * as RouterUtils from '~/utils/RouterUtils';
import styles from './MobileNavigationDrawer.module.css';

const MOBILE_FRIENDS_PATH = Routes.dmChannel('@friends');
const EDGE_SWIPE_START_MIN_PX = 14;
const EDGE_SWIPE_START_MAX_PX = 132;
const GESTURE_TRIGGER_PX = 58;

type GestureState = {
	mode: 'open' | 'close';
	startX: number;
	startY: number;
	currentX: number;
	startTs: number;
	status: 'pending' | 'locked' | 'cancelled';
};

type TouchGestureEvent = React.TouchEvent | TouchEvent;

const preventDefaultIfPossible = (event: TouchGestureEvent) => {
	const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : event;
	if (event.cancelable && nativeEvent.cancelable) {
		event.preventDefault();
	}
};

interface MobileNavigationMenuButtonProps {
	className?: string;
}

export const MobileNavigationMenuButton = observer(({className}: MobileNavigationMenuButtonProps) => {
	const {t} = useLingui();
	const handleClick = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		MobileNavigationStore.open();
	}, []);

	return (
		<button
			type="button"
			className={clsx(styles.menuButton, className)}
			onClick={handleClick}
			data-edge-swipe-ignore="true"
			aria-label={t`Open navigation menu`}
			aria-expanded={MobileNavigationStore.isOpen}
		>
			<ListIcon weight="bold" />
		</button>
	);
});

interface MobileNavigationDrawerProps {
	enableEdgeGesture?: boolean;
}

export const MobileNavigationDrawer = observer(({enableEdgeGesture = true}: MobileNavigationDrawerProps) => {
	const {t} = useLingui();
	const location = useLocation();
	const user = UserStore.currentUser;
	const isOpen = MobileNavigationStore.isOpen;
	const isSettingsOpen = ModalStore.hasModalOfType(UserSettingsModal);
	const [dragOffset, setDragOffset] = React.useState<number | null>(null);
	const [customStatusSheetOpen, setCustomStatusSheetOpen] = React.useState(false);
	const gestureRef = React.useRef<GestureState | null>(null);

	React.useEffect(() => {
		MobileNavigationStore.close();
		setDragOffset(null);
	}, [location.pathname]);

	React.useEffect(() => {
		if (!isOpen) return;

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				MobileNavigationStore.close();
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => {
			document.body.style.overflow = previousOverflow;
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [isOpen]);

	const navigate = React.useCallback(
		(path: string) => {
			MobileNavigationStore.close();
			if (isSettingsOpen) {
				ModalActionCreators.pop();
			}
			if (location.pathname === path) {
				return;
			}
			RouterUtils.transitionTo(path);
		},
		[isSettingsOpen, location.pathname],
	);

	const openSettings = React.useCallback(() => {
		MobileNavigationStore.close();
		if (!isSettingsOpen) {
			ModalActionCreators.push(modal(() => <UserSettingsModal />));
		}
	}, [isSettingsOpen]);

	const startGesture = React.useCallback((mode: GestureState['mode'], event: TouchGestureEvent) => {
		if (event.touches.length !== 1) return;
		const touch = event.touches[0];
		if (!touch) return;
		gestureRef.current = {
			mode,
			startX: touch.clientX,
			startY: touch.clientY,
			currentX: touch.clientX,
			startTs: Date.now(),
			status: 'pending',
		};
	}, []);

	const moveGesture = React.useCallback((event: TouchGestureEvent) => {
		const gesture = gestureRef.current;
		const touch = event.touches[0];
		if (!gesture || !touch) return;

		const deltaX = touch.clientX - gesture.startX;
		const deltaY = touch.clientY - gesture.startY;
		const directedDeltaX = gesture.mode === 'open' ? deltaX : -deltaX;
		const absDeltaX = Math.abs(deltaX);
		const absDeltaY = Math.abs(deltaY);

		if (gesture.status === 'cancelled' || directedDeltaX < 0) {
			gesture.status = 'cancelled';
			setDragOffset(null);
			return;
		}

		if (gesture.status === 'pending') {
			if (absDeltaY >= 18 && absDeltaY >= absDeltaX * 1.12) {
				gesture.status = 'cancelled';
				setDragOffset(null);
				return;
			}
			if (absDeltaX < 10) return;
			if (absDeltaX < absDeltaY * 1.18) {
				gesture.status = 'cancelled';
				setDragOffset(null);
				return;
			}
			gesture.status = 'locked';
		}

		if (absDeltaY > 54 || absDeltaY > absDeltaX * 0.95) {
			gesture.status = 'cancelled';
			setDragOffset(null);
			return;
		}

		gesture.currentX = touch.clientX;
		const width = Math.min(336, window.innerWidth * 0.88);
		setDragOffset(
			gesture.mode === 'open'
				? Math.min(Math.max(deltaX, 0), width)
				: Math.max(Math.min(deltaX, 0), -width),
		);
		preventDefaultIfPossible(event);
	}, []);

	const finishGesture = React.useCallback(() => {
		const gesture = gestureRef.current;
		gestureRef.current = null;
		if (!gesture || gesture.status !== 'locked') {
			setDragOffset(null);
			return;
		}

		const deltaX = gesture.currentX - gesture.startX;
		const directedDeltaX = gesture.mode === 'open' ? deltaX : -deltaX;
		const elapsed = Math.max(Date.now() - gesture.startTs, 1);
		const shouldComplete =
			directedDeltaX >= GESTURE_TRIGGER_PX || (directedDeltaX >= 34 && directedDeltaX / elapsed >= 0.32);

		if (gesture.mode === 'open' && shouldComplete) {
			MobileNavigationStore.open();
		}
		if (gesture.mode === 'close' && shouldComplete) {
			MobileNavigationStore.close();
		}
		setDragOffset(null);
	}, []);

	const cancelGesture = React.useCallback(() => {
		gestureRef.current = null;
		setDragOffset(null);
	}, []);

	React.useEffect(() => {
		if (!enableEdgeGesture || isOpen) return;

		const handleTouchStart = (event: TouchEvent) => {
			if (event.touches.length !== 1) return;
			const touch = event.touches[0];
			if (!touch) return;
			if (touch.clientX < EDGE_SWIPE_START_MIN_PX || touch.clientX > EDGE_SWIPE_START_MAX_PX) return;

			const target = event.target as HTMLElement | null;
			if (
				target?.closest?.(
					'a, input, textarea, select, [data-edge-swipe-ignore="true"], [data-chat-edge-swipe-host="true"], [contenteditable="true"]',
				)
			) {
				return;
			}

			startGesture('open', event);
		};

		const handleTouchMove = (event: TouchEvent) => moveGesture(event);
		const handleTouchEnd = () => finishGesture();
		const handleTouchCancel = () => cancelGesture();

		window.addEventListener('touchstart', handleTouchStart, {passive: true});
		window.addEventListener('touchmove', handleTouchMove, {passive: false});
		window.addEventListener('touchend', handleTouchEnd);
		window.addEventListener('touchcancel', handleTouchCancel);

		return () => {
			window.removeEventListener('touchstart', handleTouchStart);
			window.removeEventListener('touchmove', handleTouchMove);
			window.removeEventListener('touchend', handleTouchEnd);
			window.removeEventListener('touchcancel', handleTouchCancel);
		};
	}, [cancelGesture, enableEdgeGesture, finishGesture, isOpen, moveGesture, startGesture]);

	const width = typeof window === 'undefined' ? 336 : Math.min(336, window.innerWidth * 0.88);
	const closedDragProgress = !isOpen && dragOffset != null ? Math.min(Math.max(dragOffset / width, 0), 1) : 0;
	const openDragProgress = isOpen && dragOffset != null ? Math.min(Math.max(1 + dragOffset / width, 0), 1) : 1;
	const progress = isOpen ? openDragProgress : closedDragProgress;
	const panelOffset = isOpen ? (dragOffset ?? 0) : -width + (dragOffset ?? 0);
	const contentOffset = Math.round(width * progress);
	const activePath = location.pathname;
	const customStatus = user ? normalizeCustomStatus(PresenceStore.getCustomStatus(user.id)) : null;

	React.useEffect(() => {
		const root = document.documentElement;
		if (!isOpen && dragOffset == null) {
			root.style.removeProperty('--mobile-navigation-content-offset');
			delete root.dataset.mobileNavigationDragging;
			return undefined;
		}

		root.style.setProperty('--mobile-navigation-content-offset', `${contentOffset}px`);
		if (dragOffset != null) {
			root.dataset.mobileNavigationDragging = 'true';
		} else {
			delete root.dataset.mobileNavigationDragging;
		}

		return () => {
			root.style.removeProperty('--mobile-navigation-content-offset');
			delete root.dataset.mobileNavigationDragging;
		};
	}, [contentOffset, dragOffset, isOpen]);

	const openAddGuild = React.useCallback(() => {
		MobileNavigationStore.close();
		ModalActionCreators.push(modal(() => <AddGuildModal initialView="create_guild" />));
	}, []);

	const openCustomStatusEditor = React.useCallback(() => {
		setCustomStatusSheetOpen(true);
	}, []);

	const items = [
		{
			key: 'chats',
			label: t`Chats`,
			icon: ChatCircleDotsIcon,
			onClick: () => navigate(Routes.ME),
			active: activePath === Routes.ME,
			badge: 0,
		},
		{
			key: 'friends',
			label: t`Friends`,
			icon: FriendsIcon,
			onClick: () => navigate(MOBILE_FRIENDS_PATH),
			active: activePath === MOBILE_FRIENDS_PATH,
			badge: 0,
		},
		{
			key: 'saved-messages',
			label: t`Favorite messages`,
			icon: BookmarkSimpleIcon,
			onClick: () => navigate(Routes.BOOKMARKS),
			active: activePath === Routes.BOOKMARKS,
			badge: 0,
		},
		{
			key: 'discover',
			label: t`Discover`,
			icon: CompassIcon,
			onClick: () => navigate(Routes.DISCOVERY),
			active: activePath.startsWith(Routes.DISCOVERY),
			badge: 0,
		},
		{
			key: 'create-community',
			label: t`Create Community`,
			icon: PlusIcon,
			onClick: openAddGuild,
			active: false,
			badge: 0,
		},
	];

	if (!user) return null;

	return (
		<div className={clsx(styles.root, (isOpen || dragOffset != null) && styles.rootActive)}>
			<button
				type="button"
				className={styles.backdrop}
				style={{opacity: progress}}
				onClick={MobileNavigationStore.close}
				aria-label={t`Close navigation menu`}
				tabIndex={isOpen ? 0 : -1}
			/>
			<aside
				className={clsx(styles.drawer, dragOffset != null && styles.drawerDragging)}
				style={{transform: `translate3d(${panelOffset}px, 0, 0)`}}
				aria-hidden={!isOpen && dragOffset == null}
				onTouchStart={(event) => startGesture('close', event)}
				onTouchMove={moveGesture}
				onTouchEnd={finishGesture}
				onTouchCancel={cancelGesture}
			>
				<div className={styles.drawerHeader}>
					<button
						type="button"
						className={styles.profileButton}
						onClick={() => navigate(Routes.YOU)}
						aria-label={t`Open profile`}
					>
						<StatusAwareAvatar user={user} size={64} showOffline disableMobileStatus />
						<span className={styles.profileCopy}>
							<span className={styles.profileName}>{user.globalName ?? user.username}</span>
							<span className={styles.profileTag}>@{user.username}</span>
						</span>
					</button>
					<button
						type="button"
						className={styles.customStatusButton}
						onClick={openCustomStatusEditor}
						aria-label={customStatus ? t`Edit custom status` : t`Set a custom status`}
					>
						{customStatus ? (
							<CustomStatusDisplay
								customStatus={customStatus}
								className={styles.customStatusText}
								emojiClassName={styles.customStatusEmoji}
								showTooltip={false}
								constrained
								animateOnParentHover
							/>
						) : (
							<span className={styles.customStatusPlaceholder}>{t`Set status`}</span>
						)}
					</button>
				</div>

				<nav className={styles.navigation} aria-label={t`Mobile navigation`}>
					{items.map(({key, label, icon: Icon, onClick, active, badge}) => (
						<button
							key={key}
							type="button"
							className={clsx(styles.navigationItem, active && styles.navigationItemActive)}
							onClick={onClick}
						>
							<Icon className={styles.navigationIcon} weight={active ? 'fill' : 'regular'} />
							<span>{label}</span>
							{badge ? <span className={styles.navigationBadge}>{Math.min(badge, 99)}</span> : null}
						</button>
					))}
				</nav>

				<div className={styles.drawerFooter}>
					<button
						type="button"
						className={clsx(styles.navigationItem, activePath === Routes.YOU && styles.navigationItemActive)}
						onClick={() => navigate(Routes.YOU)}
					>
						<UserCircleIcon className={styles.navigationIcon} weight={activePath === Routes.YOU ? 'fill' : 'regular'} />
						<span>{t`Profile`}</span>
					</button>
					<button
						type="button"
						className={clsx(styles.navigationItem, isSettingsOpen && styles.navigationItemActive)}
						onClick={openSettings}
					>
						<GearIcon className={styles.navigationIcon} weight={isSettingsOpen ? 'fill' : 'regular'} />
						<span>{t`Settings`}</span>
					</button>
				</div>
			</aside>
			<CustomStatusBottomSheet
				isOpen={customStatusSheetOpen}
				onClose={() => setCustomStatusSheetOpen(false)}
			/>
		</div>
	);
});
