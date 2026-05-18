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
import {TrashIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {AnimatePresence, motion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as UnsavedChangesActionCreators from '~/actions/UnsavedChangesActionCreators';
import {GuildDeleteModal} from '~/components/modals/GuildDeleteModal';
import {Button} from '~/components/uikit/Button/Button';
import {Scroller} from '~/components/uikit/Scroller';
import type {GuildRecord} from '~/records/GuildRecord';
import UnsavedChangesStore from '~/stores/UnsavedChangesStore';
import type {MobileNavigationState} from '../hooks/useMobileNavigation';
import {MobileHeader, MobileSettingsDangerItem, MobileSettingsList} from '../shared/MobileSettingsComponents';
import mobileSettingsStyles from './MobileSettingsView.module.css';
import userSettingsStyles from '../UserSettingsModal.module.css';
import type {GuildSettingsTab, GuildSettingsTabType} from '../utils/guildSettingsConstants';
import styles from './MobileGuildSettingsView.module.css';

interface MobileGuildSettingsViewProps {
	guild: GuildRecord;
	groupedSettingsTabs: Record<string, Array<GuildSettingsTab>>;
	currentTab?: GuildSettingsTab;
	mobileNav: MobileNavigationState<GuildSettingsTabType>;
	onBack: () => void;
	onTabSelect: (tabType: string, title: string) => void;
}

const contentFadeVariants = {
	enter: {
		opacity: 0,
	},
	center: {
		opacity: 1,
	},
	exit: {
		opacity: 0,
	},
};

const headerFadeVariants = {
	enter: {
		opacity: 0,
	},
	center: {
		opacity: 1,
	},
	exit: {
		opacity: 0,
	},
};

export const MobileGuildSettingsView: React.FC<MobileGuildSettingsViewProps> = observer(
	({guild, groupedSettingsTabs, currentTab, mobileNav, onBack, onTabSelect}) => {
		const {t} = useLingui();
		const unsavedChangesStore = UnsavedChangesStore;

		const currentTabId = mobileNav.currentView?.tab || '';
		const showUnsavedBanner = unsavedChangesStore.unsavedChanges[currentTabId] || false;
		const tabData = unsavedChangesStore.tabData[currentTabId] || {};

		const checkUnsavedChanges = React.useCallback(
			(tabId?: string): boolean => {
				const checkTabId = tabId || mobileNav.currentView?.tab;
				if (!checkTabId) return false;
				if (unsavedChangesStore.unsavedChanges[checkTabId]) {
					UnsavedChangesActionCreators.triggerFlashEffect(checkTabId);
					return true;
				}
				return false;
			},
			[mobileNav.currentView?.tab, unsavedChangesStore],
		);

		const handleBack = React.useCallback(() => {
			if (checkUnsavedChanges()) return;
			onBack();
		}, [checkUnsavedChanges, onBack]);

		const handleTabSelect = React.useCallback(
			(tabType: string, title: string) => {
				if (checkUnsavedChanges()) return;
				onTabSelect(tabType, title);
			},
			[checkUnsavedChanges, onTabSelect],
		);

		const CATEGORY_LABELS = {
			user_management: t`User Management`,
		};

		const handleDeleteGuild = React.useCallback(() => {
			ModalActionCreators.push(modal(() => <GuildDeleteModal guildId={guild.id} />));
		}, [guild.id]);

		const showMobileList = mobileNav.isRootView;
		const showMobileContent = !mobileNav.isRootView;

		const dangerAction = (
			<MobileSettingsDangerItem icon={TrashIcon} label={t`Delete Community`} onClick={handleDeleteGuild} />
		);

		return (
			<div className={userSettingsStyles.mobileWrapper}>
				<div className={userSettingsStyles.mobileHeaderContainer}>
					<AnimatePresence mode="wait" custom={mobileNav.direction}>
						{showMobileList && (
							<motion.div
								key="mobile-list-header"
								variants={headerFadeVariants}
								initial="center"
								animate="center"
								exit="exit"
								transition={{
									duration: 0.08,
									ease: 'easeInOut',
								}}
								className={userSettingsStyles.mobileHeaderContent}
							>
								<MobileHeader title={guild.name} onBack={handleBack} />
							</motion.div>
						)}

						{showMobileContent && currentTab && (
							<motion.div
								key={`mobile-content-header-${mobileNav.currentView?.tab}`}
								variants={headerFadeVariants}
								initial="enter"
								animate="center"
								exit="exit"
								transition={{
									duration: 0.08,
									ease: 'easeInOut',
								}}
								className={userSettingsStyles.mobileHeaderContent}
							>
								<MobileHeader title={mobileNav.currentView?.title || currentTab.label} onBack={handleBack} />
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				<div className={userSettingsStyles.mobileContentContainer}>
					<AnimatePresence mode="wait" custom={mobileNav.direction}>
						{showMobileList && (
							<motion.div
								key="mobile-list-content"
								custom={mobileNav.direction}
								variants={contentFadeVariants}
								initial="center"
								animate="center"
								exit="exit"
								transition={{
									duration: 0.15,
									ease: 'easeInOut',
								}}
								className={userSettingsStyles.mobileContentPane}
								style={{willChange: 'transform'}}
							>
								<MobileSettingsList
									groupedTabs={groupedSettingsTabs}
									onTabSelect={handleTabSelect}
									categoryLabels={CATEGORY_LABELS}
									hiddenCategories={['guild_settings']}
									dangerContent={dangerAction}
								/>
							</motion.div>
						)}

						{showMobileContent && currentTab && (
							<motion.div
								key={`mobile-content-${mobileNav.currentView?.tab}`}
								custom={mobileNav.direction}
								variants={contentFadeVariants}
								initial="enter"
								animate="center"
								exit="exit"
								transition={{
									duration: 0.15,
									ease: 'easeInOut',
								}}
								className={userSettingsStyles.mobileContentPane}
								style={{willChange: 'transform'}}
							>
								<Scroller className={styles.scrollerFlex} key="mobile-guild-settings-content-scroller">
									<div
										className={clsx(
											styles.contentContainer,
											showUnsavedBanner && mobileSettingsStyles.contentContainerWithBottomActions,
										)}
									>
										<currentTab.component guildId={guild.id} />
									</div>
								</Scroller>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
				{showMobileContent && showUnsavedBanner && (
					<div className={mobileSettingsStyles.bottomActionBar}>
						<div className={mobileSettingsStyles.bottomActionBarInner}>
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
		);
	},
);
