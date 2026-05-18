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
import {MagnifyingGlassIcon, UserPlusIcon, UsersThreeIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as UserProfileActionCreators from '~/actions/UserProfileActionCreators';
import {RelationshipTypes} from '~/Constants';
import {ChannelHeader} from '~/components/channel/ChannelHeader';
import {AddFriendView} from '~/components/channel/dm/AddFriendView';
import {FriendsList} from '~/components/channel/friends/views/FriendsList';
import {PendingFriendsView} from '~/components/channel/friends/views/PendingFriendsView';
import {Input} from '~/components/form/Input';
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
	primary?: boolean;
}

const TabButton = observer(
	React.forwardRef<HTMLButtonElement, TabButtonProps>(
		({tab, activeTab, onClick, label, badge, primary, ...props}, ref) => {
			const isActive = activeTab === tab;

			return (
				<FocusRing within offset={-2}>
					<button
						ref={ref}
						type="button"
						role="tab"
						aria-selected={isActive}
						tabIndex={isActive || (primary && activeTab === tab) ? 0 : -1}
						className={clsx(styles.tabButton, {
							[styles.active]: isActive,
							[styles.primary]: primary,
						})}
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
	const [activeTab, setActiveTab] = React.useState<FriendsTab>('online');
	const prefersReducedMotion = useReducedMotion();
	const mobileLayout = MobileLayoutStore;
	const relationships = RelationshipStore.getRelationships();
	const pendingCount = relationships.filter((relation) => relation.type === RelationshipTypes.INCOMING_REQUEST).length;
	const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
	const [searchQuery, setSearchQuery] = React.useState('');
	const touchStartRef = React.useRef<{x: number; y: number} | null>(null);
	const tabs = React.useMemo(
		() => [
			{key: 'online' as const, label: t`Online`},
			{key: 'all' as const, label: t`All`},
			{key: 'pending' as const, label: t`Pending`, badge: pendingCount},
			{key: 'add' as const, label: t`Add Friend`, primary: true},
		],
		[pendingCount, t],
	);

	React.useEffect(() => {
		const pendingTab = FriendsTabStore.consumeTab();
		if (pendingTab) {
			setActiveTab(pendingTab);
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
			if (tab === activeTab) {
				return;
			}

			setActiveTab(tab);
		},
		[activeTab],
	);

	const swipeableTabs = React.useMemo<Array<FriendsTab>>(() => ['online', 'all', 'pending', 'add'], []);

	const handleTabsTouchStart = React.useCallback((event: React.TouchEvent<HTMLDivElement>) => {
		const target = event.target as HTMLElement | null;
		if (
			target?.closest(
				'input, textarea, select, button, a, [role="button"], [role="link"], [contenteditable="true"], [data-friends-swipe-ignore="true"]',
			)
		) {
			touchStartRef.current = null;
			return;
		}

		const touch = event.touches[0];
		if (!touch) return;
		touchStartRef.current = {x: touch.clientX, y: touch.clientY};
	}, []);

	const handleTabsTouchEnd = React.useCallback(
		(event: React.TouchEvent<HTMLDivElement>) => {
			const start = touchStartRef.current;
			touchStartRef.current = null;
			if (!start) return;

			const touch = event.changedTouches[0];
			if (!touch) return;
			const dx = touch.clientX - start.x;
			const dy = touch.clientY - start.y;
			const absDx = Math.abs(dx);
			if (absDx < 42 || absDx < Math.abs(dy) * 1.2) {
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
					primary={tab.primary}
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
						<UsersThreeIcon weight="fill" className={styles.titleIcon} />
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
				onTouchEnd={isMobile ? handleTabsTouchEnd : undefined}
				onTouchCancel={isMobile ? handleTabsTouchCancel : undefined}
			>
				{isMobile && (
					<div className={styles.mobileTopBar}>
						<h1 className={styles.mobileTopTitle}>
							<Trans>Friend List</Trans>
						</h1>
						<button type="button" className={styles.mobileAddButton} onClick={() => setActiveTab('add')}>
							<UserPlusIcon weight="fill" className={styles.mobileTopIcon} />
							<span>
								<Trans>Add Friend</Trans>
							</span>
							{pendingCount > 0 && <MentionBadge mentionCount={pendingCount} />}
						</button>
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
			{isMobile && (
				<div className={styles.mobileTabsDock}>
					<div className={styles.mobileTabsWrap}>{renderTabList(styles.mobileTabsCapsule)}</div>
				</div>
			)}
		</div>
	);
});
