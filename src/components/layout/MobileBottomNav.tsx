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
import {ChatCircleDotsIcon, GearIcon, UserCircleIcon, UsersThreeIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import {UserSettingsModal} from '~/components/modals/UserSettingsModal';
import {useKeyboardOpen} from '~/hooks/useKeyboardOpen';
import {useLocation} from '~/lib/router';
import {Routes} from '~/Routes';
import ModalStore from '~/stores/ModalStore';
import MobileBottomNavStore from '~/stores/MobileBottomNavStore';
import * as RouterUtils from '~/utils/RouterUtils';
import styles from './MobileBottomNav.module.css';

const MOBILE_FRIENDS_PATH = Routes.dmChannel('@friends');

export const MobileBottomNav = observer(() => {
	const {t} = useLingui();
	const location = useLocation();
	const keyboardOpen = useKeyboardOpen();
	const isSettingsOpen = ModalStore.hasModalOfType(UserSettingsModal);
	const selectedTab = MobileBottomNavStore.selectedTab;

	React.useEffect(() => {
		if (!isSettingsOpen && selectedTab === 'settings') {
			MobileBottomNavStore.setSelectedTab(null);
		}

		if (location.pathname !== Routes.ME && selectedTab === 'chats') {
			MobileBottomNavStore.setSelectedTab(null);
		}
	}, [isSettingsOpen, location.pathname, selectedTab]);

	const activeTab = React.useMemo(() => {
		if (isSettingsOpen) return 'settings';
		if (location.pathname === Routes.YOU) return 'profile';
		if (location.pathname === MOBILE_FRIENDS_PATH) return 'friends';
		if (location.pathname === Routes.ME && selectedTab === 'chats') {
			return 'chats';
		}
		return null;
	}, [isSettingsOpen, location.pathname, selectedTab]);

	const handleNavigation = (tab: 'profile' | 'friends' | 'chats', path: string) => {
		MobileBottomNavStore.setSelectedTab(tab);
		if (isSettingsOpen) {
			ModalActionCreators.pop();
		}
		RouterUtils.transitionTo(path);
	};

	const handleSettingsOpen = () => {
		MobileBottomNavStore.setSelectedTab('settings');
		if (isSettingsOpen) {
			return;
		}
		ModalActionCreators.push(modal(() => <UserSettingsModal />));
	};

	return (
		<div
			className={clsx(styles.container, keyboardOpen && styles.containerKeyboardOpen)}
			aria-hidden={keyboardOpen}
		>
			<button
				type="button"
				onClick={() => handleNavigation('profile', Routes.YOU)}
				aria-label={t`Profile`}
				title={t`Profile`}
				className={clsx(styles.navButton, activeTab === 'profile' ? styles.navButtonActive : styles.navButtonInactive)}
			>
				<UserCircleIcon weight="fill" className={styles.icon} />
			</button>

			<button
				type="button"
				onClick={() => handleNavigation('friends', MOBILE_FRIENDS_PATH)}
				aria-label={t`Friends`}
				title={t`Friends`}
				className={clsx(styles.navButton, activeTab === 'friends' ? styles.navButtonActive : styles.navButtonInactive)}
			>
				<UsersThreeIcon weight="fill" className={styles.icon} />
			</button>

			<button
				type="button"
				onClick={() => handleNavigation('chats', Routes.ME)}
				aria-label={t`Chats`}
				title={t`Chats`}
				className={clsx(styles.navButton, activeTab === 'chats' ? styles.navButtonActive : styles.navButtonInactive)}
			>
				<ChatCircleDotsIcon weight="fill" className={styles.icon} />
			</button>

			<button
				type="button"
				onClick={handleSettingsOpen}
				aria-label={t`Settings`}
				title={t`Settings`}
				className={clsx(styles.navButton, activeTab === 'settings' ? styles.navButtonActive : styles.navButtonInactive)}
			>
				<GearIcon weight="fill" className={styles.icon} />
			</button>
		</div>
	);
});
