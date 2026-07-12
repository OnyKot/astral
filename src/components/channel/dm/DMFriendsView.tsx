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
import {MagnifyingGlassIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as UserProfileActionCreators from '~/actions/UserProfileActionCreators';
import {RelationshipTypes} from '~/Constants';
import {ChannelHeader} from '~/components/channel/ChannelHeader';
import {AddFriendView} from '~/components/channel/dm/AddFriendView';
import {FriendsList} from '~/components/channel/friends/views/FriendsList';
import {PendingFriendsView} from '~/components/channel/friends/views/PendingFriendsView';
import {Input} from '~/components/form/Input';
import {FriendsIcon} from '~/components/icons/FriendsIcon';
import {MobileNavigationMenuButton} from '~/components/layout/MobileNavigationDrawer';
import {AddFriendModal} from '~/components/modals/AddFriendModal';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {MentionBadge} from '~/components/uikit/MentionBadge';
import {useAstralDocumentTitle} from '~/hooks/useAstralDocumentTitle';
import type {RelationshipRecord} from '~/records/RelationshipRecord';
import FriendsTabStore from '~/stores/FriendsTabStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import RelationshipStore from '~/stores/RelationshipStore';
import {hapticSelection} from '~/utils/haptics';
import styles from './DMFriendsView.module.css';

type FriendsTab = 'online' | 'all' | 'pending' | 'add';

interface TabButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
	tab: FriendsTab;
	activeTab: FriendsTab;
	onClick: (tab: FriendsTab) => void;
	label: string;
	badge?: number;
}

const TabButton = observer(
	React.forwardRef<HTMLButtonElement, TabButtonProps>(
		({tab, activeTab, onClick, label, badge, className, ...props}, ref) => {
			const isActive = activeTab === tab;

			return (
				<FocusRing within offset={-2}>
					<button
						ref={ref}
						type="button"
						role="tab"
						aria-selected={isActive}
						tabIndex={isActive ? 0 : -1}
						className={clsx(
							styles.tabButton,
							{
								[styles.active]: isActive,
							},
							className,
						)}
						onClick={() => onClick(tab)}
						{...props}
					>
						<div className={styles.tabContent}>
							{label}
							{badge !== undefined && badge > 0 && <MentionBadge mentionCount={badge} />}
						</div>
					</button>
				</FocusRing>
			);
		},
	),
);

export const DMFriendsView: React.FC = observer(() => {
	const {t} = useLingui();
	const [activeTab, setActiveTab] = React.useState<FriendsTab>('all');
	const prefersReducedMotion = useReducedMotion();
	const mobileLayout = MobileLayoutStore;
	const relationships = RelationshipStore.getRelationships();
	const pendingCount = relationships.filter((relation) => relation.type === RelationshipTypes.INCOMING_REQUEST).length;
	const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
	const [searchQuery, setSearchQuery] = React.useState('');
	const touchStartRef = React.useRef<{x: number; y: number; ts: number; status: 'pending' | 'locked'} | null>(null);
	const touchCurrentRef = React.useRef<{x: number; y: number} | null>(null);
	const tabs = React.useMemo(
		() => [
			{key: 'all' as const, label: t`All`},
			{key: 'online' as const, label: t`Online`},
			{key: 'pending' as const, label: t`Pending`, badge: pendingCount},
			{key: 'add' as const, label: t`Add Friend`, className: styles.primary},
		],
		[pendingCount, t],
	);

	React.useEffect(() => {
		const pendingTab = FriendsTabStore.consumeTab();
		if (pendingTab) {
			setActiveTab(pendingTab === 'add' ? 'all' : pendingTab);
		}
	}, []);

	const openProfile = React.useCallback((userId: string) => {
		UserProfileActionCreators.openUserProfile(userId);
	}, []);

	useAstralDocumentTitle(t`My Friends`);

	const renderTabContent = () => {
		const relationshipsRecord = relationships.reduce(
			(acc, rel) => {
				acc[rel.id] = rel;
				return acc;
			},
			{} as Record<string, RelationshipRecord>,
		);

		switch (activeTab) {
			case 'add':
				return <AddFriendView />;
			case 'pending':
				return (
					<PendingFriendsView relationships={relationshipsRecord} openProfile={openProfile} searchQuery={searchQuery} />
				);
			case 'online':
				return <FriendsList showOnlineOnly={true} openProfile={openProfile} searchQuery={searchQuery} onAddFriend={() => setActiveTab('add')} />;
			case 'all':
				return <FriendsList showOnlineOnly={false} openProfile={openProfile} searchQuery={searchQuery} onAddFriend={() => setActiveTab('add')} />;
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
		const tabCount = tabs.length;
		if (e.key === 'ArrowRight') {
			e.preventDefault();
			const nextIndex = (index + 1) % tabCount;
			tabRefs.current[nextIndex]?.focus();
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			const prevIndex = (index - 1 + tabCount) % tabCount;
			tabRefs.current[prevIndex]?.focus();
		} else if (e.key === 'Home') {
			e.preventDefault();
			tabRefs.current[0]?.focus();
		} else if (e.key === 'End') {
			e.preventDefault();
			tabRefs.current[tabCount - 1]?.focus();
		}
	};

	const handleTabChange = React.useCallback(
		(tab: FriendsTab) => {
			if (tab === 'add' && mobileLayout.enabled) {
				ModalActionCreators.push(modal(() => <AddFriendModal />));
				return;
			}

			if (tab === activeTab) {
				return;
			}

			setActiveTab(tab);
		},
		[activeTab, mobileLayout.enabled],
	);

	const swipeableTabs = React.useMemo<Array<FriendsTab>>(() => ['all', 'online', 'pending'], []);

	const handleTabsTouchStart = React.useCallback((event: React.TouchEvent<HTMLDivElement>) => {
		const target = event.target as HTMLElement | null;
		if (
			target?.closest(
				'input, textarea, select, a, [role="link"], [contenteditable="true"], [data-friends-swipe-ignore="true"]',
			)
		) {
			touchStartRef.current = null;
			return;
		}

		const touch = event.touches[0];
		if (!touch) return;
		touchStartRef.current = {x: touch.clientX, y: touch.clientY, ts: Date.now(), status: 'pending'};
		touchCurrentRef.current = {x: touch.clientX, y: touch.clientY};
	}, []);

	const handleTabsTouchMove = React.useCallback((event: React.TouchEvent<HTMLDivElement>) => {
		const start = touchStartRef.current;
		if (!start) return;
		const touch = event.touches[0];
		if (!touch) return;
		const dx = touch.clientX - start.x;
		const dy = touch.clientY - start.y;
		const absDx = Math.abs(dx);
		const absDy = Math.abs(dy);
		if (start.status === 'pending') {
			if (absDy >= 18 && absDy >= absDx) {
				touchStartRef.current = null;
				touchCurrentRef.current = null;
				return;
			}
			if (absDx < 12) return;
			if (absDx < absDy * 1.25) {
				touchStartRef.current = null;
				touchCurrentRef.current = null;
				return;
			}
			start.status = 'locked';
		}
		if (absDy > 46 || absDy > absDx * 0.82) {
			touchStartRef.current = null;
			touchCurrentRef.current = null;
			return;
		}
		event.preventDefault();
		touchCurrentRef.current = {x: touch.clientX, y: touch.clientY};
	}, []);

	const handleTabsTouchEnd = React.useCallback(
		(event: React.TouchEvent<HTMLDivElement>) => {
			const start = touchStartRef.current;
			touchStartRef.current = null;
			if (!start) return;

			const touch = event.changedTouches[0];
			const end = touch ? {x: touch.clientX, y: touch.clientY} : touchCurrentRef.current;
			touchCurrentRef.current = null;
			if (!end) return;
			const dx = end.x - start.x;
			const dy = end.y - start.y;
			const absDx = Math.abs(dx);
			const absDy = Math.abs(dy);
			const elapsed = Math.max(Date.now() - start.ts, 1);
			const isDeliberateFlick = absDx >= 42 && absDx / elapsed >= 0.42;
			if (
				start.status !== 'locked' ||
				elapsed > 700 ||
				absDy > 46 ||
				absDx < absDy * 1.25 ||
				(absDx < 58 && !isDeliberateFlick)
			) {
				return;
			}

			const currentIndex = swipeableTabs.indexOf(activeTab);
			if (currentIndex < 0) return;
			const delta = dx < 0 ? 1 : -1;
			const nextIndex = currentIndex + delta;
			if (nextIndex < 0 || nextIndex >= swipeableTabs.length) return;
			hapticSelection();
			setActiveTab(swipeableTabs[nextIndex]);
		},
		[activeTab, swipeableTabs],
	);
	const handleTabsTouchCancel = React.useCallback(() => {
		touchStartRef.current = null;
		touchCurrentRef.current = null;
	}, []);

	const renderTabList = (className: string) => (
		<div className={className} role="tablist">
			{tabs.map((tab, index) => (
				<TabButton
					key={tab.key}
					ref={(el) => {
						tabRefs.current[index] = el;
					}}
					tab={tab.key}
					activeTab={activeTab}
					onClick={handleTabChange}
					label={tab.label}
					badge={tab.badge}
					className={tab.className}
					onKeyDown={(e) => handleKeyDown(e, index)}
				/>
			))}
		</div>
	);

	const FriendsHeaderContent = (
		<div className={styles.headerContent}>
			{!mobileLayout.enabled && (
				<>
					<div className={styles.titleSection}>
						<FriendsIcon className={styles.titleIcon} />
						<span className={styles.titleText}>{t`My Friends`}</span>
					</div>
					<div className={styles.divider} />
				</>
			)}

			{!mobileLayout.enabled && <div className={styles.tabsWrapper}>{renderTabList(styles.tabsInner)}</div>}
		</div>
	);

	const searchPlaceholder = React.useMemo(() => {
		switch (activeTab) {
			case 'online':
				return t`Search online friends`;
			case 'all':
				return t`Search friends`;
			case 'pending':
				return t`Search pending requests`;
			default:
				return t`Search friends`;
		}
	}, [activeTab]);

	const showSearchBar = activeTab !== 'add';
	const isMobile = mobileLayout.enabled;
	const sectionTransition = prefersReducedMotion
		? {duration: 0}
		: isMobile
			? {duration: 0.18, ease: [0.2, 0.8, 0.2, 1] as const}
			: {duration: 0.28, ease: [0.22, 1, 0.36, 1] as const};
	const searchEnterMotion = prefersReducedMotion
		? false
		: isMobile
			? {opacity: 0, y: -6}
			: {opacity: 0, y: -10};
	const searchExitMotion = prefersReducedMotion
		? {opacity: 0}
		: isMobile
			? {opacity: 0, y: -4}
			: {opacity: 0, y: -6};
	const tabEnterMotion = prefersReducedMotion
		? false
		: isMobile
			? {opacity: 0, y: 10}
			: {opacity: 0, y: 16, scale: 0.985};
	const tabAnimateMotion = prefersReducedMotion
		? {opacity: 1}
		: isMobile
			? {opacity: 1, y: 0}
			: {opacity: 1, y: 0, scale: 1};
	const tabExitMotion = prefersReducedMotion
		? {opacity: 0}
		: isMobile
			? {opacity: 0, y: -8}
			: {opacity: 0, y: -10, scale: 0.992};

	return (
		<div className={clsx(styles.container, isMobile && styles.containerMobile)}>
			{!isMobile && <ChannelHeader leftContent={FriendsHeaderContent} showMembersToggle={false} showPins={false} />}
			<div
				className={clsx(styles.content, isMobile && styles.contentMobile)}
				onTouchStart={isMobile ? handleTabsTouchStart : undefined}
				onTouchMove={isMobile ? handleTabsTouchMove : undefined}
				onTouchEnd={isMobile ? handleTabsTouchEnd : undefined}
				onTouchCancel={isMobile ? handleTabsTouchCancel : undefined}
			>
				{isMobile && (
					<div className={styles.mobileTopBar}>
						<MobileNavigationMenuButton className={styles.mobileMenuButton} />
						<h1 className={styles.mobileTopTitle}>
							<FriendsIcon className={styles.mobileTopTitleIcon} />
							<Trans>Friend List</Trans>
						</h1>
					</div>
				)}
				<AnimatePresence initial={false}>
					{showSearchBar && (
						<motion.div
							key="friends-search"
							className={styles.searchWrapper}
							initial={searchEnterMotion}
							animate={prefersReducedMotion ? {opacity: 1} : {opacity: 1, y: 0}}
							exit={searchExitMotion}
							transition={sectionTransition}
						>
							<Input
								value={searchQuery}
								onChange={(event) => setSearchQuery(event.currentTarget.value)}
								placeholder={searchPlaceholder}
								aria-label={searchPlaceholder}
								spellCheck={false}
								autoComplete="off"
								leftIcon={<MagnifyingGlassIcon weight="bold" className={styles.searchIcon} />}
							/>
						</motion.div>
					)}
				</AnimatePresence>
				{isMobile && (
					<div className={styles.mobileTabsStrip}>
						<div className={styles.mobileTabsStripViewport}>{renderTabList(styles.mobileTabsInline)}</div>
					</div>
				)}
				<AnimatePresence mode="wait" initial={false}>
					<motion.div
						key={activeTab}
						className={styles.tabBody}
						initial={tabEnterMotion}
						animate={tabAnimateMotion}
						exit={tabExitMotion}
						transition={sectionTransition}
					>
						{renderTabContent()}
					</motion.div>
				</AnimatePresence>
			</div>
		</div>
	);
});
