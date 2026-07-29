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
import {ArrowClockwiseIcon, ArrowLeftIcon, BellSlashIcon, type IconWeight, SignOutIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {AnimatePresence, motion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as NagbarActionCreators from '~/actions/NagbarActionCreators';
import * as UnsavedChangesActionCreators from '~/actions/UnsavedChangesActionCreators';
import {LongPressable} from '~/components/LongPressable';
import {ConfirmModal} from '~/components/modals/ConfirmModal';
import {ClientInfo} from '~/components/modals/components/ClientInfo';
import {LogoutModal} from '~/components/modals/components/LogoutModal';
import styles from '~/components/modals/components/MobileSettingsView.module.css';
import type {MobileNavigationState} from '~/components/modals/hooks/useMobileNavigation';
import {useSettingsContentKey} from '~/components/modals/hooks/useSettingsContentKey';
import {
	MobileSettingsDangerItem,
	MobileHeader as SharedMobileHeader,
} from '~/components/modals/shared/MobileSettingsComponents';
import userSettingsStyles from '~/components/modals/UserSettingsModal.module.css';
import {getSettingsTabComponent} from '~/components/modals/utils/desktopSettingsTabs';
import {
	getCategoryLabel,
	type SettingsTab,
	type UserSettingsTabType,
} from '~/components/modals/utils/settingsConstants';
import {filterSettingsTabsForDeveloperMode} from '~/components/modals/utils/settingsTabFilters';
import {getPageContentVariants, getPageHeaderVariants, getPageTransition} from '~/utils/motion/MotionPresets';
import {Button} from '~/components/uikit/Button/Button';
import {MentionBadgeAnimated} from '~/components/uikit/MentionBadge';
import {Scroller, type ScrollerHandle} from '~/components/uikit/Scroller';
import {Spinner} from '~/components/uikit/Spinner';
import {usePressable} from '~/hooks/usePressable';
import {usePushSubscriptions} from '~/hooks/usePushSubscriptions';
import {activateLatestServiceWorker} from '~/lib/versioning';
import * as PushSubscriptionService from '~/services/push/PushSubscriptionService';
import AccessibilityStore from '~/stores/AccessibilityStore';
import DeveloperModeStore from '~/stores/DeveloperModeStore';
import UnsavedChangesStore from '~/stores/UnsavedChangesStore';
import UserStore from '~/stores/UserStore';
import {isNativeAndroidApp} from '~/utils/AndroidAppInfo';
import {isPwaOnMobileOrTablet} from '~/utils/PwaUtils';

interface MobileSettingsViewProps {
	groupedSettingsTabs: Record<string, Array<SettingsTab>>;
	currentTab: SettingsTab | undefined;
	mobileNav: MobileNavigationState;
	onBack: () => void;
	onTabSelect: (tab: string, title: string) => void;
	initialGuildId?: string;
	initialSubtab?: string;
}

const MobileHeaderWithBanner = observer(
	({
		title,
		onBack,
		showBackButton = true,
		showUnsavedBanner = false,
		flashBanner = false,
		tabData = {},
	}: {
		title: string;
		onBack?: () => void;
		showBackButton?: boolean;
		showUnsavedBanner?: boolean;
		flashBanner?: boolean;
		tabData?: any;
	}) => {
		const {t} = useLingui();
		const prefersReducedMotion = AccessibilityStore.useReducedMotion;

		return (
			<div
				className={`safe-area-top ${styles.header}`}
				style={{
					transitionDuration: prefersReducedMotion ? '0ms' : '200ms',
					backgroundColor: showUnsavedBanner
						? flashBanner
							? 'var(--status-danger)'
							: 'var(--background-primary)'
						: 'var(--background-primary)',
				}}
			>
				<AnimatePresence mode="wait">
					{showUnsavedBanner ? (
						<motion.div
							key="banner"
							initial={prefersReducedMotion ? {opacity: 1} : {opacity: 0}}
							animate={{opacity: 1}}
							exit={prefersReducedMotion ? {opacity: 1} : {opacity: 0}}
							transition={prefersReducedMotion ? {duration: 0} : {duration: 0.14, ease: 'easeOut'}}
							className={styles.headerContent}
						>
							<div className={styles.bannerTextContainer}>
								<div
									className={`${styles.bannerText} ${flashBanner ? styles.bannerTextWhite : styles.bannerTextPrimary}`}
								>
									<Trans>Careful! You have unsaved changes.</Trans>
								</div>
							</div>
							<div className={styles.bannerActions}>
								<Button variant="secondary" small={true} onClick={tabData.onReset}>
									<Trans>Reset</Trans>
								</Button>
								<Button small={true} onClick={tabData.onSave} submitting={tabData.isSubmitting}>
									<Trans>Save</Trans>
								</Button>
							</div>
						</motion.div>
					) : (
						<motion.div
							key="title"
							initial={prefersReducedMotion ? {opacity: 1} : {opacity: 0}}
							animate={{opacity: 1}}
							exit={prefersReducedMotion ? {opacity: 1} : {opacity: 0}}
							transition={prefersReducedMotion ? {duration: 0} : {duration: 0.14, ease: 'easeOut'}}
							className={styles.headerContentRelative}
						>
							{showBackButton && onBack && (
								<button type="button" onClick={onBack} className={styles.backButton} aria-label={t`Go back`}>
									<ArrowLeftIcon className={styles.icon5} />
								</button>
							)}
							<h1 className={styles.headerTitle}>{title}</h1>
							<div className={styles.headerSpacer} />
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		);
	},
);

interface PressableSettingsItemProps {
	tab: SettingsTab;
	onSelect: () => void;
	badge?: React.ReactNode;
}

const PressableSettingsItem: React.FC<PressableSettingsItemProps> = observer(({tab, onSelect, badge}) => {
	const {isPressed, pressableProps} = usePressable();
	const IconComponent = tab.icon;

	return (
		<LongPressable
			className={clsx(styles.settingsItem, isPressed && styles.settingsItemPressed)}
			role="button"
			tabIndex={0}
			onClick={onSelect}
			{...pressableProps}
		>
			<IconComponent className={styles.settingsItemIcon} weight={tab.iconWeight ?? 'fill'} />
			<div className={styles.settingsItemContent}>
				<div className={styles.settingsItemLabelContainer}>
					<span className={styles.settingsItemLabel}>{tab.label}</span>
					{badge}
				</div>
			</div>
			<ArrowLeftIcon className={styles.settingsItemArrow} />
		</LongPressable>
	);
});

interface MobileSettingsActionItemProps {
	icon: React.ComponentType<{className?: string; weight?: IconWeight}>;
	label: React.ReactNode;
	onClick: () => void;
	isLoading?: boolean;
	iconWeight?: IconWeight;
	showArrow?: boolean;
}

const MobileSettingsActionItem: React.FC<MobileSettingsActionItemProps> = observer(
	({icon: IconComponent, label, onClick, isLoading = false, iconWeight, showArrow = true}) => {
		const {isPressed, pressableProps} = usePressable();

		return (
			<LongPressable
				className={clsx(styles.settingsItem, isPressed && styles.settingsItemPressed)}
				role="button"
				tabIndex={0}
				onClick={onClick}
				{...pressableProps}
			>
				<IconComponent className={styles.settingsItemIcon} weight={iconWeight ?? 'regular'} />
				<div className={styles.settingsItemContent}>
					<div className={styles.settingsItemLabelContainer}>
						<span className={styles.settingsItemLabel}>{label}</span>
						{isLoading && <Spinner size="small" className={styles.settingsItemSpinner} />}
					</div>
				</div>
				{showArrow && <ArrowLeftIcon className={styles.settingsItemArrow} />}
			</LongPressable>
		);
	},
);

const ServiceWorkerUpdateButton = observer(() => {
	const {t} = useLingui();
	const [isUpdating, setIsUpdating] = React.useState(false);

	const handleUpdateServiceWorker = async () => {
		if (isUpdating) return;
		setIsUpdating(true);
		try {
			await activateLatestServiceWorker();
			window.location.reload();
		} catch (error) {
			console.error('Failed to update service worker:', error);
		} finally {
			setIsUpdating(false);
		}
	};

	return (
		<MobileSettingsActionItem
			icon={ArrowClockwiseIcon}
			iconWeight="bold"
			label={t`Update service worker`}
			onClick={handleUpdateServiceWorker}
			isLoading={isUpdating}
			showArrow={false}
		/>
	);
});

const MOBILE_HIDDEN_TAB_TYPES = new Set<UserSettingsTabType>(['keybinds', 'music_connections']);
const MOBILE_CATEGORY_ORDER: Array<SettingsTab['category']> = ['app_settings', 'user_settings', 'developer', 'staff_only'];
const mobileSettingsScrollPositions = new Map<string, number>();

interface MobileQuickAccessCardProps {
	tab: SettingsTab;
	summary: React.ReactNode;
	onSelect: () => void;
}

const MobileQuickAccessCard: React.FC<MobileQuickAccessCardProps> = observer(({tab, summary, onSelect}) => {
	const {isPressed, pressableProps} = usePressable();
	const IconComponent = tab.icon;

	return (
		<LongPressable
			className={clsx(styles.quickAccessCard, isPressed && styles.quickAccessCardPressed)}
			role="button"
			tabIndex={0}
			onClick={onSelect}
			{...pressableProps}
		>
			<div className={styles.quickAccessIconWrap}>
				<IconComponent className={styles.quickAccessIcon} weight={tab.iconWeight ?? 'fill'} />
			</div>
			<div className={styles.quickAccessLabel}>{tab.label}</div>
			<div className={styles.quickAccessSummary}>{summary}</div>
		</LongPressable>
	);
});

const MobileSettingsList = observer(
	({
		groupedTabs,
		onTabSelect,
	}: {
		groupedTabs: Record<string, Array<SettingsTab>>;
		onTabSelect: (tab: string, title: string) => void;
	}) => {
		const {t} = useLingui();
		const scrollerRef = React.useRef<ScrollerHandle | null>(null);
		const currentUser = UserStore.currentUser;
		const isDeveloper = DeveloperModeStore.isDeveloper;
		const nativeAndroid = isNativeAndroidApp();

		const filteredTabs = React.useMemo(
			() => filterSettingsTabsForDeveloperMode(groupedTabs, isDeveloper),
			[groupedTabs, isDeveloper],
		);

		const mobileVisibleTabs = React.useMemo(() => {
			const visibleTabs: Record<string, Array<SettingsTab>> = {};
			Object.entries(filteredTabs).forEach(([category, tabs]) => {
				const filteredCategoryTabs = tabs.filter((tab) => !MOBILE_HIDDEN_TAB_TYPES.has(tab.type));
				if (filteredCategoryTabs.length > 0) {
					visibleTabs[category] = filteredCategoryTabs;
				}
			});
			return visibleTabs;
		}, [filteredTabs]);

		const quickAccessTabs = React.useMemo(() => {
			const tabMap = new Map<string, SettingsTab>();
			Object.values(mobileVisibleTabs).forEach((tabs) => {
				tabs.forEach((tab) => tabMap.set(tab.type, tab));
			});

			const preferredOrder: Array<UserSettingsTabType> = nativeAndroid
				? ['voice_video', 'account_integrations', 'appearance', 'notifications', 'plutonium', 'chat_settings', 'advanced']
				: ['voice_video', 'account_integrations', 'appearance', 'plutonium', 'notifications', 'advanced', 'account_security'];

			return preferredOrder
				.map((type) => tabMap.get(type))
				.filter((tab): tab is SettingsTab => Boolean(tab))
				.slice(0, 4);
		}, [mobileVisibleTabs, nativeAndroid]);
		const quickAccessTabTypes = React.useMemo(
			() => new Set(quickAccessTabs.map((tab) => tab.type)),
			[quickAccessTabs],
		);

		const getQuickAccessSummary = React.useCallback(
			(type: UserSettingsTabType) => {
				switch (type) {
					case 'voice_video':
						return nativeAndroid
							? t`Microphone, camera, devices and voice behavior for Android calls.`
							: t`Microphone, camera, devices and voice behavior.`;
					case 'notifications':
						return nativeAndroid
							? t`Alerts, call shade controls, vibration and Android notification routing.`
							: t`Alerts, sounds, push timing and notification behavior.`;
					case 'appearance':
						return t`Theme, interface density, motion and the overall Astral look.`;
					case 'plutonium':
						return t`Manage your subscription`;
					case 'chat_settings':
						return t`Messages, media viewer, input and chat interaction behavior.`;
					case 'account_integrations':
						return t`Connect external accounts like Twitch and manage upcoming integrations.`;
					case 'account_security':
						return nativeAndroid
							? t`Login methods, biometrics, sessions and security tools for this phone.`
							: t`Login methods, sessions, privacy and account protection.`;
					case 'advanced':
						return nativeAndroid
							? t`Storage usage, cache cleanup and advanced app maintenance on Android.`
							: t`Storage usage, cache cleanup and advanced app maintenance.`;
					case 'language':
						return t`Language, time formatting and regional behavior.`;
					default:
						return t`Open this section.`;
				}
			},
			[nativeAndroid, t],
		);

		const handleLogout = React.useCallback(() => {
			ModalActionCreators.push(modal(() => <LogoutModal />));
		}, []);

		const isPwaMobile = isPwaOnMobileOrTablet();
		const {subscriptions, refresh: refreshPushSubscriptions} = usePushSubscriptions(isPwaMobile);
		const showForgetPushAction = isPwaMobile && subscriptions.length > 0;

		const handleForgetPushSubscriptions = React.useCallback(() => {
			ModalActionCreators.push(
				modal(() => (
					<ConfirmModal
						title={t`Forget push subscriptions?`}
						description={
							<p>
								<Trans>Clearing subscriptions ensures the gateway stops sending messages to this installation.</Trans>
							</p>
						}
						primaryText={t`Forget`}
						primaryVariant="primary"
						secondaryText={t`Cancel`}
						onPrimary={async () => {
							await PushSubscriptionService.unregisterAllPushSubscriptions();
							await refreshPushSubscriptions();
							NagbarActionCreators.dismissNagbar('desktopNotificationDismissed');
						}}
						onSecondary={() => {
							ModalActionCreators.pop();
						}}
					/>
				)),
			);
		}, [refreshPushSubscriptions, t]);

		const debugActions = React.useMemo(() => {
			if (!isDeveloper) {
				return [];
			}

			const actions: Array<{key: string; element: React.ReactElement}> = [
				{key: 'update', element: <ServiceWorkerUpdateButton key="service-worker" />},
			];
			if (showForgetPushAction) {
				actions.push({
					key: 'forget',
					element: (
						<MobileSettingsActionItem
							icon={BellSlashIcon}
							iconWeight="fill"
							label={t`Forget Push Subscriptions`}
							onClick={handleForgetPushSubscriptions}
							showArrow={false}
						/>
					),
				});
			}
			return actions;
		}, [handleForgetPushSubscriptions, isDeveloper, showForgetPushAction, t]);
		const lastDebugActionIndex = debugActions.length - 1;

		const categories = React.useMemo(() => {
			const orderedCategories: Array<[string, Array<SettingsTab>]> = [];
			const seen = new Set<string>();

			for (const category of MOBILE_CATEGORY_ORDER) {
				const tabs = mobileVisibleTabs[category]?.filter((tab) => !quickAccessTabTypes.has(tab.type)) ?? [];
				if (tabs.length > 0) {
					orderedCategories.push([category, tabs]);
					seen.add(category);
				}
			}

			Object.entries(mobileVisibleTabs).forEach(([category, tabs]) => {
				if (seen.has(category)) return;
				const filteredTabs = tabs.filter((tab) => !quickAccessTabTypes.has(tab.type));
				if (filteredTabs.length > 0) {
					orderedCategories.push([category, filteredTabs]);
				}
			});

			return orderedCategories;
		}, [mobileVisibleTabs, quickAccessTabTypes]);
		const lastCategoryIndex = categories.length - 1;

		React.useLayoutEffect(() => {
			const savedPosition = mobileSettingsScrollPositions.get('root') ?? 0;
			const frame = window.requestAnimationFrame(() => {
				scrollerRef.current?.scrollTo({to: savedPosition, animate: false});
			});
			return () => window.cancelAnimationFrame(frame);
		}, []);

		return (
			<Scroller
				ref={scrollerRef}
				className={styles.scrollerContainer}
				key="mobile-settings-list-scroller"
				onScroll={(event) => mobileSettingsScrollPositions.set('root', event.currentTarget.scrollTop)}
			>
				{quickAccessTabs.length > 0 && (
					<div className={styles.quickAccessSection}>
						<div className={styles.quickAccessHero}>
							<div className={styles.quickAccessEyebrow}>
								{nativeAndroid ? t`Android-first settings` : t`Settings overview`}
							</div>
							<div className={styles.quickAccessTitle}>
								{nativeAndroid ? t`Faster access to calls, alerts and app control` : t`Jump into the sections you use most`}
							</div>
							<div className={styles.quickAccessDescription}>
								{nativeAndroid
									? t`The most important Android sections sit up front now, so you can reach calls, permissions, notifications and storage tools without digging through one long screen.`
									: t`Use the quick cards first, then scroll the full list below for everything else.`}
							</div>
						</div>
						<div className={styles.quickAccessGrid}>
							{quickAccessTabs.map((tab) => (
								<MobileQuickAccessCard
									key={tab.type}
									tab={tab}
									summary={getQuickAccessSummary(tab.type)}
									onSelect={() => onTabSelect(tab.type, tab.label)}
								/>
							))}
						</div>
					</div>
				)}
				{categories.map(([category, tabs], categoryIndex) => (
					<div key={category} className={styles.categorySection}>
						<h2 className={styles.categoryTitle}>{getCategoryLabel(category as SettingsTab['category'])}</h2>
						<div className={styles.categoryList}>
							{tabs.map((tab, index) => {
								const isLastTab = index === tabs.length - 1;
								const isLastCategory = categoryIndex === lastCategoryIndex;
								const badge =
									tab.type === 'gift_inventory' && currentUser?.hasUnreadGiftInventory ? (
										<MentionBadgeAnimated mentionCount={currentUser.unreadGiftInventoryCount ?? 1} />
									) : tab.type === 'appearance' ? (
										<span className={styles.newBadge}>
											<Trans>New</Trans>
										</span>
									) : undefined;
								return (
									<div key={tab.type}>
										<PressableSettingsItem tab={tab} onSelect={() => onTabSelect(tab.type, tab.label)} badge={badge} />
										{(!isLastTab || isLastCategory) && <div className={styles.divider} />}
									</div>
								);
							})}
							{categoryIndex === lastCategoryIndex && (
								<MobileSettingsDangerItem icon={SignOutIcon} label={t`Log Out`} onClick={handleLogout} />
							)}
						</div>
					</div>
				))}
				{categories.length === 0 && (
					<div className={styles.categorySection}>
						<div className={styles.categoryList}>
							<MobileSettingsDangerItem icon={SignOutIcon} label={t`Log Out`} onClick={handleLogout} />
						</div>
					</div>
				)}
				{debugActions.length > 0 && (
					<div className={styles.categorySection}>
						<h2 className={styles.categoryTitle}>{t`Debug`}</h2>
						<div className={styles.categoryList}>
							{debugActions.map((action, index) => (
								<div key={action.key}>
									{action.element}
									{index !== lastDebugActionIndex && <div className={styles.divider} />}
								</div>
							))}
						</div>
					</div>
				)}
				<div className={styles.clientInfoContainer}>
					<ClientInfo />
				</div>
			</Scroller>
		);
	},
);

const EDGE_SWIPE_ZONE_PX = 36;
const EDGE_SWIPE_ACTIVATION_PX = 18;
const EDGE_SWIPE_TRIGGER_PX = 92;
const EDGE_SWIPE_MAX_PX = 180;
const EDGE_SWIPE_MAX_VERTICAL_DRIFT_PX = 42;
const SWIPE_IGNORE_SELECTOR =
	'a, button, input, textarea, select, label, summary, video, audio, canvas, [draggable="true"], [role="button"], [role="switch"], [role="slider"], [role="textbox"], [contenteditable="true"], [data-settings-swipe-ignore="true"], [data-swipe-ignore="true"]';

interface MobileContentWithScrollSpyProps {
	scrollKey: string;
	initialGuildId?: string;
	initialSubtab?: string;
	currentTabComponent: React.ComponentType<any> | null;
	hasBottomActions?: boolean;
}

const MobileContentWithScrollSpy: React.FC<MobileContentWithScrollSpyProps> = observer(
	({scrollKey, initialGuildId, initialSubtab, currentTabComponent, hasBottomActions = false}) => {
		const scrollerRef = React.useRef<ScrollerHandle | null>(null);

		React.useLayoutEffect(() => {
			const savedPosition = mobileSettingsScrollPositions.get(scrollKey) ?? 0;
			const frame = window.requestAnimationFrame(() => {
				scrollerRef.current?.scrollTo({to: savedPosition, animate: false});
			});
			return () => window.cancelAnimationFrame(frame);
		}, [scrollKey]);

		return (
			<Scroller
				ref={scrollerRef}
				className={styles.scrollerFlex}
				key={scrollKey}
				data-settings-scroll-container
				onScroll={(event) => mobileSettingsScrollPositions.set(scrollKey, event.currentTarget.scrollTop)}
			>
				<div className={clsx(styles.contentContainer, hasBottomActions && styles.contentContainerWithBottomActions)}>
					{currentTabComponent &&
						React.createElement(currentTabComponent, {
							...(initialGuildId ? {initialGuildId} : {}),
							...(initialSubtab ? {initialSubtab} : {}),
						} as any)}
				</div>
			</Scroller>
		);
	},
);

export const MobileSettingsView: React.FC<MobileSettingsViewProps> = observer(
	({groupedSettingsTabs, currentTab, mobileNav, onBack, onTabSelect, initialGuildId, initialSubtab}) => {
		const {t} = useLingui();
		const unsavedChangesStore = UnsavedChangesStore;
		const prefersReducedMotion = AccessibilityStore.useReducedMotion;
		const [flashBanner, setFlashBanner] = React.useState(false);
		const [lastFlashTrigger, setLastFlashTrigger] = React.useState(0);
		const [swipeBackOffset, setSwipeBackOffset] = React.useState(0);
		const flashTimeoutRef = React.useRef<number | null>(null);
		const swipeGestureRef = React.useRef<{
			startX: number;
			startY: number;
			currentX: number;
			currentY: number;
			startTs: number;
			status: 'pending' | 'locked' | 'cancelled';
		} | null>(null);

		const currentTabId = mobileNav.currentView?.tab || '';
		const showUnsavedBanner = unsavedChangesStore.unsavedChanges[currentTabId] || false;
		const flashTrigger = unsavedChangesStore.flashTriggers[currentTabId] || 0;
		const tabData = unsavedChangesStore.tabData[currentTabId] || {};
		const {contentKey} = useSettingsContentKey();
		const scrollKey = React.useMemo(() => {
			if (!currentTabId) {
				return 'user-settings-mobile-root';
			}

			const subtabKey = contentKey ?? initialSubtab ?? 'root';
			return `user-settings-${currentTabId}-${subtabKey}`;
		}, [contentKey, currentTabId, initialSubtab]);

		React.useEffect(() => {
			if (flashTrigger > lastFlashTrigger) {
				setFlashBanner(true);
				setLastFlashTrigger(flashTrigger);

				if (flashTimeoutRef.current != null) {
					window.clearTimeout(flashTimeoutRef.current);
				}

				flashTimeoutRef.current = window.setTimeout(() => {
					setFlashBanner(false);
					flashTimeoutRef.current = null;
				}, 300);
			}
		}, [flashTrigger, lastFlashTrigger]);

		React.useEffect(
			() => () => {
				if (flashTimeoutRef.current != null) {
					window.clearTimeout(flashTimeoutRef.current);
				}
			},
			[],
		);

		const checkUnsavedChanges = React.useCallback((tabId?: string): boolean => {
			const checkTabId = tabId || mobileNav.currentView?.tab;
			if (!checkTabId) return false;
			if (unsavedChangesStore.unsavedChanges[checkTabId]) {
				UnsavedChangesActionCreators.triggerFlashEffect(checkTabId);
				return true;
			}
			return false;
		}, [mobileNav.currentView?.tab, unsavedChangesStore]);

		const handleBack = React.useCallback(() => {
			if (checkUnsavedChanges()) return;
			onBack();
		}, [checkUnsavedChanges, onBack]);

		React.useEffect(() => {
			if (mobileNav.isRootView) {
				return;
			}

			const handleNativeBack = (event: Event) => {
				event.preventDefault();
				event.stopPropagation();
				(event as Event & {stopImmediatePropagation?: () => void}).stopImmediatePropagation?.();
				handleBack();
			};

			window.addEventListener('astral:native-back', handleNativeBack, true);
			return () => {
				window.removeEventListener('astral:native-back', handleNativeBack, true);
			};
		}, [handleBack, mobileNav.isRootView]);

		const handleTabSelect = React.useCallback((tab: string, title: string) => {
			if (checkUnsavedChanges()) return;
			onTabSelect(tab, title);
		}, [checkUnsavedChanges, onTabSelect]);

		const resetSwipeBackGesture = React.useCallback(() => {
			swipeGestureRef.current = null;
			setSwipeBackOffset(0);
		}, []);

		const handleContentTouchStart = React.useCallback((event: React.TouchEvent<HTMLDivElement>) => {
			if (mobileNav.isRootView || event.touches.length !== 1) {
				swipeGestureRef.current = null;
				return;
			}

			const target = event.target;
			if (target instanceof Element && target.closest(SWIPE_IGNORE_SELECTOR)) {
				swipeGestureRef.current = null;
				return;
			}

			const touch = event.touches[0];
			const bounds = event.currentTarget.getBoundingClientRect();
			if (touch.clientX - bounds.left > EDGE_SWIPE_ZONE_PX) {
				swipeGestureRef.current = null;
				return;
			}

			swipeGestureRef.current = {
				startX: touch.clientX,
				startY: touch.clientY,
				currentX: touch.clientX,
				currentY: touch.clientY,
				startTs: Date.now(),
				status: 'pending',
			};
		}, [mobileNav.isRootView]);

		const handleContentTouchMove = React.useCallback((event: React.TouchEvent<HTMLDivElement>) => {
			const gesture = swipeGestureRef.current;
			if (!gesture || event.touches.length !== 1) return;

			const touch = event.touches[0];
			const deltaX = touch.clientX - gesture.startX;
			const deltaY = touch.clientY - gesture.startY;
			const absDeltaX = Math.abs(deltaX);
			const absDeltaY = Math.abs(deltaY);
			gesture.currentX = touch.clientX;
			gesture.currentY = touch.clientY;

			if (gesture.status === 'cancelled' || deltaX < 0) {
				gesture.status = 'cancelled';
				setSwipeBackOffset(0);
				return;
			}

			if (gesture.status === 'pending') {
				if (absDeltaY >= EDGE_SWIPE_ACTIVATION_PX && absDeltaY >= absDeltaX) {
					gesture.status = 'cancelled';
					setSwipeBackOffset(0);
					return;
				}

				if (deltaX < EDGE_SWIPE_ACTIVATION_PX) {
					return;
				}

				if (absDeltaX < absDeltaY * 1.6) {
					gesture.status = 'cancelled';
					setSwipeBackOffset(0);
					return;
				}

				gesture.status = 'locked';
			}

			if (absDeltaY > EDGE_SWIPE_MAX_VERTICAL_DRIFT_PX || absDeltaY > absDeltaX * 0.7) {
				gesture.status = 'cancelled';
				setSwipeBackOffset(0);
				return;
			}

			const nextOffset = Math.min(Math.max(deltaX, 0), EDGE_SWIPE_MAX_PX);
			setSwipeBackOffset(nextOffset);

			if (deltaX > 0) {
				event.preventDefault();
			}
		}, []);

		const handleContentTouchEnd = React.useCallback(() => {
			const gesture = swipeGestureRef.current;
			if (!gesture || gesture.status !== 'locked') {
				resetSwipeBackGesture();
				return;
			}

			const deltaX = gesture.currentX - gesture.startX;
			const deltaY = Math.abs(gesture.currentY - gesture.startY);
			const elapsed = Math.max(Date.now() - gesture.startTs, 1);
			const shouldNavigateBack =
				deltaY <= EDGE_SWIPE_MAX_VERTICAL_DRIFT_PX &&
				deltaX >= deltaY * 1.6 &&
				(deltaX >= EDGE_SWIPE_TRIGGER_PX || (deltaX >= 58 && deltaX / elapsed >= 0.48));
			resetSwipeBackGesture();

			if (shouldNavigateBack) {
				handleBack();
			}
		}, [handleBack, resetSwipeBackGesture]);

		const showMobileList = mobileNav.isRootView;
		const showMobileContent = !mobileNav.isRootView;
		const currentTabComponent = currentTab ? getSettingsTabComponent(currentTab.type) : null;
		const swipeBackProgress = Math.min(swipeBackOffset / EDGE_SWIPE_TRIGGER_PX, 1);
		const gestureStageStyle: React.CSSProperties = {
			display: 'flex',
			flexDirection: 'column',
			width: '100%',
			height: '100%',
			minHeight: 0,
			...(swipeBackOffset > 0
				? {
						transform: `translate3d(${swipeBackOffset}px, 0, 0)`,
						opacity: 1 - swipeBackProgress * 0.04,
						boxShadow: `0 22px 48px rgb(0 0 0 / ${0.08 + swipeBackProgress * 0.18})`,
						transition: 'none',
					}
				: {}),
		};
		const motionTransition = getPageTransition(prefersReducedMotion);
		const headerVariants = React.useMemo(
			() => getPageHeaderVariants(prefersReducedMotion),
			[prefersReducedMotion],
		);
		const contentVariants = React.useMemo(
			() => getPageContentVariants(prefersReducedMotion),
			[prefersReducedMotion],
		);

		return (
			<div className={userSettingsStyles.mobileWrapper}>
				<div className={userSettingsStyles.mobileHeaderContainer}>
					<AnimatePresence mode="wait" initial={false} custom={mobileNav.direction}>
						{showMobileList && (
							<motion.div
								key="mobile-list-header"
								custom={mobileNav.direction}
								variants={headerVariants}
								initial={mobileNav.direction === 'backward' ? 'enter' : 'center'}
								animate="center"
								exit="exit"
								transition={motionTransition}
								className={userSettingsStyles.mobileHeaderContent}
							>
								<SharedMobileHeader title={t`Settings`} onBack={() => ModalActionCreators.pop()} />
							</motion.div>
						)}
						{showMobileContent && currentTab && (
							<motion.div
								key={`mobile-content-header-${mobileNav.currentView?.tab}`}
								custom={mobileNav.direction}
								variants={headerVariants}
								initial={mobileNav.direction === 'forward' ? 'enter' : 'center'}
								animate="center"
								exit="exit"
								transition={motionTransition}
								className={userSettingsStyles.mobileHeaderContent}
							>
								<div style={gestureStageStyle}>
									<MobileHeaderWithBanner
										title={mobileNav.currentView?.title || currentTab.label}
										onBack={handleBack}
										showUnsavedBanner={showUnsavedBanner}
										flashBanner={flashBanner}
										tabData={tabData}
									/>
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
				<div className={userSettingsStyles.mobileContentContainer}>
					<AnimatePresence mode="sync" initial={false} custom={mobileNav.direction}>
						{showMobileList && (
							<motion.div
								key="mobile-list-content"
								custom={mobileNav.direction}
								variants={contentVariants}
								initial={mobileNav.direction === 'backward' ? 'enter' : 'center'}
								animate="center"
								exit="exit"
								transition={motionTransition}
								className={userSettingsStyles.mobileContentPane}
								style={{willChange: 'transform, opacity'}}
							>
								<MobileSettingsList groupedTabs={groupedSettingsTabs} onTabSelect={handleTabSelect} />
							</motion.div>
						)}
						{showMobileContent && currentTab && (
							<motion.div
								key={`mobile-content-${mobileNav.currentView?.tab}`}
								custom={mobileNav.direction}
								variants={contentVariants}
								initial={mobileNav.direction === 'forward' ? 'enter' : 'center'}
								animate="center"
								exit="exit"
								transition={motionTransition}
								className={userSettingsStyles.mobileContentPane}
								style={{willChange: 'transform, opacity'}}
							>
								<div
									style={gestureStageStyle}
									onTouchStart={handleContentTouchStart}
									onTouchMove={handleContentTouchMove}
									onTouchEnd={handleContentTouchEnd}
									onTouchCancel={resetSwipeBackGesture}
								>
									<MobileContentWithScrollSpy
										scrollKey={scrollKey}
										initialGuildId={initialGuildId}
										initialSubtab={initialSubtab}
										currentTabComponent={currentTabComponent}
										hasBottomActions={showUnsavedBanner}
									/>
								</div>
							</motion.div>
						)}
					</AnimatePresence>
					{showMobileContent && showUnsavedBanner && (
						<div className={styles.bottomActionBar}>
							<div className={styles.bottomActionBarInner}>
								<Button type="button" variant="secondary" fitContainer onClick={tabData.onReset}>
									<Trans>Reset</Trans>
								</Button>
								<Button type="button" fitContainer onClick={tabData.onSave} submitting={tabData.isSubmitting}>
									<Trans>Save</Trans>
								</Button>
							</div>
						</div>
					)}
				</div>
			</div>
		);
	},
);
