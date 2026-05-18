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

import {Plural, Trans, useLingui} from '@lingui/react/macro';
import {ArrowsLeftRightIcon, DevicesIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import * as Modal from '~/components/modals/Modal';
import {Button} from '~/components/uikit/Button/Button';
import {
	useVoiceConnectionConfirmModalLogic,
	type VoiceConnectionConfirmModalProps,
} from '~/utils/alerts/VoiceConnectionConfirmModalUtils';
import styles from './VoiceConnectionConfirmModal.module.css';

export const VoiceConnectionConfirmModal: React.FC<VoiceConnectionConfirmModalProps> = observer(
	({guildId: _guildId, channelId: _channelId, onSwitchDevice, onJustJoin, onCancel}) => {
		const {t} = useLingui();
		const {existingConnectionsCount, handleSwitchDevice, handleJustJoin, handleCancel} =
			useVoiceConnectionConfirmModalLogic({
				onSwitchDevice,
				onJustJoin,
				onCancel,
			});

		return (
			<Modal.Root size="small" centered>
				<Modal.Header title={t`Already connected`} />
				<Modal.Content>
					<p className={styles.description}>
						<Trans>
							You're in this voice channel from{' '}
							<Plural
								value={existingConnectionsCount}
								one="# other device"
								other="# other devices"
							/>
							.
						</Trans>
					</p>

					<button type="button" className={styles.option} onClick={handleSwitchDevice}>
						<span className={styles.optionIcon}>
							<ArrowsLeftRightIcon weight="bold" />
						</span>
						<span className={styles.optionBody}>
							<span className={styles.optionTitle}>
								<Trans>Move here</Trans>
							</span>
							<span className={styles.optionHint}>
								<Trans>Disconnect other devices and use this one.</Trans>
							</span>
						</span>
					</button>

					<button type="button" className={styles.option} onClick={handleJustJoin}>
						<span className={styles.optionIcon}>
							<DevicesIcon weight="bold" />
						</span>
						<span className={styles.optionBody}>
							<span className={styles.optionTitle}>
								<Trans>Add this device</Trans>
							</span>
							<span className={styles.optionHint}>
								<Trans>Stay connected on every device.</Trans>
							</span>
						</span>
					</button>
				</Modal.Content>
				<Modal.Footer>
					<div className={styles.footer}>
						<Button variant="secondary" onClick={handleCancel} className={styles.fullWidth}>
							<Trans>Cancel</Trans>
						</Button>
					</div>
				</Modal.Footer>
			</Modal.Root>
		);
	},
);
