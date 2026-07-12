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
import {CopyIcon, LinkSimpleIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import * as TextCopyActionCreators from '~/actions/TextCopyActionCreators';
import * as Modal from '~/components/modals/Modal';
import {Button} from '~/components/uikit/Button/Button';
import {QRCodeCanvas} from '~/components/uikit/QRCodeCanvas';
import {Spinner} from '~/components/uikit/Spinner';
import type {UserRecord} from '~/records/UserRecord';
import {createUserModalLink} from '~/utils/DeepLinkUtils';
import styles from './ProfileQrModal.module.css';

interface ProfileQrModalProps {
	user: UserRecord;
	guildId?: string;
	channelId?: string;
	initialLink?: string | null;
}

export const ProfileQrModal: React.FC<ProfileQrModalProps> = observer(
	({user, guildId, channelId, initialLink = null}) => {
		const {t, i18n} = useLingui();
		const [link, setLink] = React.useState<string | null>(initialLink);
		const [failed, setFailed] = React.useState(false);

		React.useEffect(() => {
			if (initialLink) {
				setLink(initialLink);
				setFailed(false);
				return;
			}

			let cancelled = false;
			setLink(null);
			setFailed(false);

			createUserModalLink(user.id, {guildId, channelId})
				.then((profileLink) => {
					if (!cancelled) {
						setLink(profileLink);
					}
				})
				.catch((error) => {
					console.error('[ProfileQrModal] Failed to create profile link', error);
					if (!cancelled) {
						setFailed(true);
					}
				});

			return () => {
				cancelled = true;
			};
		}, [channelId, guildId, initialLink, user.id]);

		const handleCopy = () => {
			if (!link) return;
			TextCopyActionCreators.copy(i18n, link, true);
		};

		return (
			<Modal.Root size="small" centered onClose={ModalActionCreators.pop} className={styles.modalRoot}>
				<Modal.ScreenReaderLabel text={t`Profile QR code`} />
				<Modal.Header title={t`Profile QR code`} />
				<Modal.Content>
					<div className={styles.content}>
						<div className={styles.identity}>
							<div className={styles.name}>{user.displayName}</div>
							<div className={styles.tag}>{user.tag}</div>
						</div>

						<div className={styles.qrShell}>
							{link ? (
								<QRCodeCanvas data={link} size={196} padding={14} className={styles.qrCanvas} />
							) : failed ? (
								<div className={styles.qrFallback}>
									<LinkSimpleIcon size={32} weight="bold" />
								</div>
							) : (
								<div className={styles.qrFallback}>
									<Spinner />
								</div>
							)}
						</div>

						<p className={styles.description}>
							<Trans>Scan or share this code to open this Astral profile and start a conversation.</Trans>
						</p>

						{link && (
							<button type="button" className={styles.linkText} onClick={handleCopy}>
								{link}
							</button>
						)}
					</div>
				</Modal.Content>
				<Modal.Footer>
					<Button variant="secondary" onClick={ModalActionCreators.pop}>
						<Trans>Close</Trans>
					</Button>
					<Button onClick={handleCopy} disabled={!link} leftIcon={<CopyIcon size={16} />}>
						<Trans>Copy URL</Trans>
					</Button>
				</Modal.Footer>
			</Modal.Root>
		);
	},
);

ProfileQrModal.displayName = 'ProfileQrModal';
