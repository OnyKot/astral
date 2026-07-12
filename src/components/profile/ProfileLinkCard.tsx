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
import {CopyIcon, IdentificationCardIcon, LinkSimpleIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as TextCopyActionCreators from '~/actions/TextCopyActionCreators';
import {ProfileQrModal} from '~/components/modals/ProfileQrModal';
import {Button} from '~/components/uikit/Button/Button';
import {Spinner} from '~/components/uikit/Spinner';
import type {UserRecord} from '~/records/UserRecord';
import {createUserModalLink} from '~/utils/DeepLinkUtils';
import * as RouterUtils from '~/utils/RouterUtils';
import styles from './ProfileLinkCard.module.css';

interface ProfileLinkCardProps {
	user: UserRecord;
	guildId?: string;
	channelId?: string;
	compact?: boolean;
	className?: string;
}

export const ProfileLinkCard: React.FC<ProfileLinkCardProps> = observer(
	({user, guildId, channelId, compact = false, className}) => {
		const {t, i18n} = useLingui();
		const [link, setLink] = React.useState<string | null>(null);
		const [failed, setFailed] = React.useState(false);

		React.useEffect(() => {
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
					console.error('[ProfileLinkCard] Failed to create profile link', error);
					if (!cancelled) {
						setFailed(true);
					}
				});

			return () => {
				cancelled = true;
			};
		}, [channelId, guildId, user.id]);

		const handleOpenProfile = (event: React.MouseEvent<HTMLAnchorElement>) => {
			event.preventDefault();
			if (!link) return;
			try {
				const url = new URL(link, window.location.origin);
				const path = `${url.pathname}${url.search}${url.hash}`;
				RouterUtils.transitionTo(path);
			} catch (error) {
				console.error('[ProfileLinkCard] Failed to navigate to profile link', error);
			}
		};

		const handleCopy = () => {
			if (!link) return;
			TextCopyActionCreators.copy(i18n, link, true);
		};

		const handleShowQr = () => {
			ModalActionCreators.push(
				modal(() => <ProfileQrModal user={user} guildId={guildId} channelId={channelId} initialLink={link} />),
			);
		};

		return (
			<section className={clsx(styles.card, compact && styles.compact, className)}>
				<div className={styles.header}>
					<div className={styles.iconShell}>
						<LinkSimpleIcon size={18} weight="bold" />
					</div>
					<div className={styles.titleWrap}>
						<h3 className={styles.title}>
							<Trans>Profile link</Trans>
						</h3>
						<p className={styles.subtitle}>
							<Trans>Share this link or QR code to open the profile directly.</Trans>
						</p>
					</div>
				</div>

				<div className={styles.linkBox}>
					{link ? (
						<a className={styles.linkText} href={link} onClick={handleOpenProfile}>
							{link}
						</a>
					) : failed ? (
						<span className={styles.errorText}>
							<Trans>Unable to create a profile link right now.</Trans>
						</span>
					) : (
						<span className={styles.loadingText}>
							<Spinner />
							{t`Preparing link...`}
						</span>
					)}
				</div>

				<div className={styles.actions}>
					<Button
						variant="secondary"
						small={true}
						onClick={handleShowQr}
						leftIcon={<IdentificationCardIcon size={16} weight="bold" />}
					>
						<Trans>QR code</Trans>
					</Button>
					<Button variant="secondary" small={true} onClick={handleCopy} disabled={!link} leftIcon={<CopyIcon size={16} />}>
						<Trans>Copy URL</Trans>
					</Button>
				</div>
			</section>
		);
	},
);

ProfileLinkCard.displayName = 'ProfileLinkCard';
