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

import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as AuthenticationActionCreators from '~/actions/AuthenticationActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import {GatewayConnectionBanner} from '~/components/app/GatewayConnectionBanner';
import {NewDesktopDesignNotice} from '~/components/app/NewDesktopDesignNotice';
import {OnboardingChecklist} from '~/components/app/OnboardingChecklist';
import {TelegramWebViewWarning} from '~/components/app/TelegramWebViewWarning';
import {UpdateBanner} from '~/components/app/UpdateBanner';
import {SplashScreen} from '~/components/layout/SplashScreen';
import RequiredActionModal from '~/components/modals/RequiredActionModal';
import {NewDeviceMonitoringManager} from '~/components/voice/NewDeviceMonitoringManager';
import {VoiceReconnectionManager} from '~/components/voice/VoiceReconnectionManager';
import AccountManager from '~/stores/AccountManager';
import AuthenticationStore from '~/stores/AuthenticationStore';
import ConnectionStore from '~/stores/ConnectionStore';
import InitializationStore from '~/stores/InitializationStore';
import ModalStore from '~/stores/ModalStore';
import UserStore from '~/stores/UserStore';
import styles from './AppLayout.module.css';
import {useAppLayoutState} from './app-layout/hooks';

export const AppLayout = observer(({children}: {children: React.ReactNode}) => {
	const isAuthenticated = AuthenticationStore.isAuthenticated;
	const socket = ConnectionStore.socket;
	const user = UserStore.currentUser;

	const appState = useAppLayoutState();

	React.useEffect(() => {
		if (InitializationStore.isLoading) {
			return;
		}
		void AuthenticationActionCreators.ensureSessionStarted();
	}, [
		isAuthenticated,
		socket,
		ConnectionStore.isConnected,
		ConnectionStore.isConnecting,
		InitializationStore.isLoading,
		AccountManager.isSwitching,
	]);

	React.useEffect(() => {
		const requiredActions = user?.requiredActions ?? [];
		const blockingRequiredActions = requiredActions.filter(
			(action) => action !== 'REQUIRE_VERIFIED_PHONE' && action !== 'REQUIRE_REVERIFIED_PHONE',
		);
		const hasRequired = blockingRequiredActions.length > 0;
		const isOpen = ModalStore.getModal()?.key === 'required-actions';
		if (hasRequired && !isOpen) {
			ModalActionCreators.pushWithKey(
				modal(() => <RequiredActionModal mock={false} />),
				'required-actions',
			);
		}
		if (!hasRequired && isOpen) {
			ModalActionCreators.pop();
		}
	}, [user?.requiredActions?.join('|')]);

	return (
		<>
			<TelegramWebViewWarning />
			{isAuthenticated && <SplashScreen />}

			{isAuthenticated && socket && <VoiceReconnectionManager />}
			{isAuthenticated && <NewDeviceMonitoringManager />}
			<div className={clsx(styles.appLayout, appState.isStandalone && styles.appLayoutStandalone)}>
				{isAuthenticated && <UpdateBanner />}
				{isAuthenticated && <NewDesktopDesignNotice />}
				{isAuthenticated && <GatewayConnectionBanner />}
				{isAuthenticated && <OnboardingChecklist />}
				{children}
			</div>
		</>
	);
});
