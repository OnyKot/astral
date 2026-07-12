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
import {ArrowClockwiseIcon, ArrowSquareOutIcon, EyeIcon, EyeSlashIcon, GameControllerIcon, XIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import * as Modal from '~/components/modals/Modal';
import {SettingsSection} from '~/components/modals/shared/SettingsSection';
import {Button} from '~/components/uikit/Button/Button';
import SteamIntegrationStore from '~/stores/SteamIntegrationStore';

export const SteamIntegrationSettingsModal: React.FC = observer(() => {
	const {t} = useLingui();
	const conn = SteamIntegrationStore.connection;
	const loading = SteamIntegrationStore.status === 'loading';

	return (
		<Modal.Root size="medium" centered onClose={() => ModalActionCreators.pop()}>
			<Modal.Header title={t`Steam Settings`} />
			<Modal.Content padding="default">
				{conn ? (
					<>
						<SettingsSection
							id="steam-account"
							title={t`Connected Account`}
							description={t`Public profile information fetched from Steam.`}
							defaultExpanded={true}
						>
							<div style={{display: 'grid', gap: '8px', fontSize: '14px', color: 'var(--text-normal)'}}>
								<div>
									<strong>{conn.personaName}</strong>
									{conn.realName && <span style={{color: 'var(--text-muted)'}}> ({conn.realName})</span>}
								</div>
								<div style={{color: 'var(--text-muted)', fontSize: '13px'}}>
									{t`Steam ID`}: {conn.steamId}
								</div>
								{conn.profileUrl && (
									<a
										href={conn.profileUrl}
										target="_blank"
										rel="noreferrer noopener"
										style={{color: 'var(--text-link)', fontSize: '13px', textDecoration: 'none'}}
									>
										<ArrowSquareOutIcon size={12} weight="bold" /> <Trans>Open Steam profile</Trans>
									</a>
								)}
							</div>
						</SettingsSection>

						<SettingsSection
							id="steam-presence"
							title={t`Game presence`}
							description={t`Show what game you're currently playing on your Astral profile.`}
							defaultExpanded={true}
						>
							<div style={{display: 'grid', gap: '12px'}}>
								<div style={{fontSize: '13px', color: 'var(--text-muted)'}}>
									{conn.currentGameName ? (
										<span>
											<GameControllerIcon size={14} weight="fill" style={{verticalAlign: 'text-bottom', marginRight: '4px'}} />
											<Trans>Now playing</Trans>: <strong>{conn.currentGameName}</strong>
										</span>
									) : (
										<Trans>Not playing right now.</Trans>
									)}
								</div>
								<div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
									<Button
										small={true}
										variant={conn.presenceVisible ? 'danger-secondary' : 'primary'}
										onClick={() => void SteamIntegrationStore.setPresenceVisible(!conn.presenceVisible)}
										submitting={loading}
									>
										{conn.presenceVisible ? (
											<>
												<EyeSlashIcon size={14} weight="bold" />
												<Trans>Hide my game</Trans>
											</>
										) : (
											<>
												<EyeIcon size={14} weight="bold" />
												<Trans>Show my game</Trans>
											</>
										)}
									</Button>
									<Button
										small={true}
										variant="secondary"
										onClick={() => void SteamIntegrationStore.refresh()}
										disabled={loading}
									>
										<ArrowClockwiseIcon size={14} weight="bold" />
										<Trans>Refresh now</Trans>
									</Button>
								</div>
								<div style={{fontSize: '12px', color: 'var(--text-muted)'}}>
									{conn.presenceVisible ? (
										<Trans>Your current game is visible on your Astral profile.</Trans>
									) : (
										<Trans>Your current game is hidden from other Astral users.</Trans>
									)}
								</div>
							</div>
						</SettingsSection>

						<SettingsSection
							id="steam-disconnect"
							title={t`Disconnect`}
							description={t`Removes the link between Astral and Steam. Can be re-linked at any time.`}
							defaultExpanded={true}
						>
							<Button
								small={true}
								variant="danger-secondary"
								onClick={() => {
									void SteamIntegrationStore.disconnect();
									ModalActionCreators.pop();
								}}
							>
								<XIcon size={14} weight="bold" />
								<Trans>Disconnect Steam</Trans>
							</Button>
						</SettingsSection>
					</>
				) : (
					<div style={{padding: '32px', textAlign: 'center', color: 'var(--text-muted)'}}>
						<Trans>Steam is not connected.</Trans>
					</div>
				)}
			</Modal.Content>
		</Modal.Root>
	);
});
