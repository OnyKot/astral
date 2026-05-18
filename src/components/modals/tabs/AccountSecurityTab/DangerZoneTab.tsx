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

import {Trans} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import {AccountDeleteModal} from '~/components/modals/AccountDeleteModal';
import {AccountDisableModal} from '~/components/modals/AccountDisableModal';
import {GuildOwnershipWarningModal} from '~/components/modals/GuildOwnershipWarningModal';
import {SettingsTabSection} from '~/components/modals/shared/SettingsTabLayout';
import {Button} from '~/components/uikit/Button/Button';
import type {UserRecord} from '~/records/UserRecord';
import GuildStore from '~/stores/GuildStore';
import styles from './AccountTab.module.css';

interface DangerZoneTabProps {
	user: UserRecord;
	isClaimed: boolean;
}

export const DangerZoneTabContent: React.FC<DangerZoneTabProps> = observer(({user, isClaimed}) => {
	const handleDisableAccount = () => {
		const ownedGuilds = GuildStore.getOwnedGuilds(user.id);
		if (ownedGuilds.length > 0) {
			ModalActionCreators.push(modal(() => <GuildOwnershipWarningModal ownedGuilds={ownedGuilds} action="disable" />));
		} else {
			ModalActionCreators.push(modal(() => <AccountDisableModal />));
		}
	};

	const handleDeleteAccount = () => {
		const ownedGuilds = GuildStore.getOwnedGuilds(user.id);
		if (ownedGuilds.length > 0) {
			ModalActionCreators.push(modal(() => <GuildOwnershipWarningModal ownedGuilds={ownedGuilds} action="delete" />));
		} else {
			ModalActionCreators.push(modal(() => <AccountDeleteModal />));
		}
	};

	const actions = [
		isClaimed
			? {
					id: 'disable',
					label: <Trans>Temporary deactivation</Trans>,
					description: <Trans>Disable your account for now and reactivate it any time by signing in again.</Trans>,
					buttonVariant: 'danger-secondary' as const,
					buttonLabel: <Trans>Disable Account</Trans>,
					onClick: handleDisableAccount,
				}
			: null,
		{
			id: 'delete',
			label: <Trans>Permanent deletion</Trans>,
			description: <Trans>Permanently delete your account and all associated data. This action cannot be undone.</Trans>,
			buttonVariant: 'danger-primary' as const,
			buttonLabel: <Trans>Delete Account</Trans>,
			onClick: handleDeleteAccount,
		},
	]
		.filter((action): action is NonNullable<typeof action> => action !== null)
		.filter((action, index, list) => list.findIndex((item) => item.id === action.id) === index);

	return (
		<SettingsTabSection
			title={<Trans>Account Danger Actions</Trans>}
			description={<Trans>These actions are sensitive and may be hard or impossible to undo.</Trans>}
		>
			{actions.map((action) => (
				<div key={action.id} className={styles.row}>
					<div className={styles.rowContent}>
						<div className={styles.label}>{action.label}</div>
						<div className={styles.description}>{action.description}</div>
					</div>
					<Button variant={action.buttonVariant} small={true} onClick={action.onClick}>
						{action.buttonLabel}
					</Button>
				</div>
			))}
		</SettingsTabSection>
	);
});
