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
import {ArrowClockwiseIcon, ArrowSquareOutIcon, GameControllerIcon, LinkSimpleIcon, WarningCircleIcon, XIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import * as Modal from '~/components/modals/Modal';
import {SettingsSection} from '~/components/modals/shared/SettingsSection';
import {Button} from '~/components/uikit/Button/Button';
import RiotIntegrationStore from '~/stores/RiotIntegrationStore';
import styles from './RiotIntegrationSettingsModal.module.css';

export const RiotIntegrationSettingsModal: React.FC = observer(() => {
	const {t} = useLingui();
	const store = RiotIntegrationStore;
	const conn = store.connection;

	return (
		<Modal.Root size="medium" centered onClose={() => ModalActionCreators.pop()}>
			<Modal.Header title={t`Riot Games Settings`} />
			<Modal.Content padding="default">
				<div className={styles.root}>
					<SettingsSection
						id="riot-account"
						title={t`Connected Account`}
						description={t`Manage your Riot account connection used for profile sync.`}
						defaultExpanded={true}
					>
						{conn ? (
							<div className={styles.connected}>
								<GameControllerIcon size={32} weight="fill" className={styles.icon} />
								<div className={styles.info}>
									<span className={styles.name}>
										{conn.gameName}#{conn.tagLine}
									</span>
									<span className={styles.region}>{conn.region.toUpperCase()}</span>
									{conn.rankSolo && <span className={styles.rank}>{conn.rankSolo}</span>}
									{conn.inGame && (
										<span className={styles.inGame}>
											<Trans>In Game</Trans>
											{conn.currentChampion ? ` · ${conn.currentChampion}` : ''}
										</span>
									)}
								</div>
								<div className={styles.actions}>
									<div className={styles.linkedBadge}>
										<LinkSimpleIcon size={12} weight="bold" />
										<Trans>Linked</Trans>
									</div>
								</div>
							</div>
						) : (
							<p className={styles.hint}>
								<Trans>No Riot account linked yet.</Trans>
							</p>
						)}
					</SettingsSection>

					<SettingsSection
						id="riot-actions"
						title={t`Connection Actions`}
						description={t`Start OAuth linking, refresh synced data, or disconnect your account.`}
						defaultExpanded={true}
					>
						<div className={styles.actionsRow}>
							{conn ? (
								<Button
									small={true}
									variant="danger-secondary"
									onClick={() => void store.disconnect()}
									submitting={store.loading}
								>
									<XIcon size={14} weight="bold" />
									<Trans>Disconnect</Trans>
								</Button>
							) : (
								<Button
									small={true}
									onClick={() => void store.startConnect()}
									submitting={store.loading}
									disabled={!store.configured}
								>
									<ArrowSquareOutIcon size={14} weight="bold" />
									<Trans>Connect Riot</Trans>
								</Button>
							)}

							<Button
								small={true}
								variant="secondary"
								onClick={() => void store.refreshData()}
								disabled={store.loading}
							>
								<ArrowClockwiseIcon size={14} weight="bold" />
								<Trans>Refresh</Trans>
							</Button>
						</div>
					</SettingsSection>

					{store.error && (
						<div className={styles.errorBanner} role="status">
							<WarningCircleIcon size={15} weight="fill" />
							<span>{store.error}</span>
						</div>
					)}
				</div>
			</Modal.Content>
		</Modal.Root>
	);
});
