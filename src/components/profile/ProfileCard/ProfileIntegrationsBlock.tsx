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
import {CheckCircleIcon, LinkSimpleIcon, SteamLogoIcon, TelegramLogoIcon, TwitchLogoIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import {Endpoints} from '~/Endpoints';
import http from '~/lib/HttpClient';
import AuthenticationStore from '~/stores/AuthenticationStore';
import SteamIntegrationStore from '~/stores/SteamIntegrationStore';
import TelegramIntegrationStore from '~/stores/TelegramIntegrationStore';
import TwitchIntegrationStore from '~/stores/TwitchIntegrationStore';
import styles from './ProfileIntegrationsBlock.module.css';

interface PublicIntegrations {
	steam: {steamId: string; personaName: string; profileUrl: string | null; currentGameName: string | null} | null;
	twitch: {login: string; displayName: string; profileImageUrl: string | null; liveState: {isLive: boolean} | null} | null;
	telegram: {username: string | null; firstName: string} | null;
}

interface ProfileIntegrationsBlockProps {
	userId: string;
	compact?: boolean;
	displayMode?: 'cards' | 'icon-row';
	hideTitle?: boolean;
	transparent?: boolean;
	className?: string;
}

export const ProfileIntegrationsBlock: React.FC<ProfileIntegrationsBlockProps> = observer(
	({userId, compact = false, displayMode = 'cards', hideTitle = false, transparent = false, className}) => {
		const isCurrentUser = userId === AuthenticationStore.currentUserId;
		const [publicData, setPublicData] = React.useState<PublicIntegrations | null>(null);

		React.useEffect(() => {
			if (isCurrentUser) {
				void TwitchIntegrationStore.ensureBootstrapped();
				void SteamIntegrationStore.ensureBootstrapped();
				void TelegramIntegrationStore.ensureBootstrapped();
			} else {
				http.get<PublicIntegrations>({url: Endpoints.USER_INTEGRATIONS(userId)})
					.then((r) => setPublicData(r.body))
					.catch(() => {});
			}
		}, [isCurrentUser, userId]);

		const twitch = isCurrentUser ? TwitchIntegrationStore.connection : publicData?.twitch ?? null;
		const steam = isCurrentUser ? SteamIntegrationStore.connection : publicData?.steam ?? null;
		const telegram = isCurrentUser ? TelegramIntegrationStore.connection : publicData?.telegram ?? null;

		const twitchLinked = Boolean(twitch);
		const steamLinked = Boolean(steam);
		const telegramLinked = Boolean(telegram);
		const anyLinked = twitchLinked || steamLinked || telegramLinked;

		const rootClassName = clsx(
			styles.root,
			compact && styles.rootCompact,
			transparent && styles.rootTransparent,
			displayMode === 'icon-row' && styles.rootIconRow,
			className,
		);

		if (!anyLinked) {
			return null;
		}

		if (displayMode === 'icon-row') {
			return (
				<div className={rootClassName}>
					{!hideTitle && (
						<div className={styles.titleRow}>
							<span className={styles.title}>
								<Trans>Integrations</Trans>
							</span>
							{anyLinked && (
								<span className={styles.linkedPill}>
									<LinkSimpleIcon size={12} weight="bold" />
									<Trans>Linked</Trans>
								</span>
							)}
						</div>
					)}

					<div className={styles.integrationIconRow}>
						{twitchLinked && twitch && (
							<Tooltip position="top" text={`Twitch - @${twitch.login}`}>
								<span className={styles.integrationIconPill}>
									<TwitchLogoIcon size={15} weight="fill" />
								</span>
							</Tooltip>
						)}
						{steamLinked && steam && (
							<Tooltip position="top" text={`Steam - ${steam.personaName}`}>
								<span className={styles.integrationIconPill}>
									<SteamLogoIcon size={15} weight="fill" />
								</span>
							</Tooltip>
						)}
						{telegramLinked && telegram && (
							<Tooltip
								position="top"
								text={`Telegram - ${telegram.username ? `@${telegram.username}` : telegram.firstName ?? ''}`}
							>
								<span className={styles.integrationIconPill}>
									<TelegramLogoIcon size={15} weight="fill" />
								</span>
							</Tooltip>
						)}
					</div>
				</div>
			);
		}

		return (
			<div className={rootClassName}>
				{!hideTitle && (
					<div className={styles.titleRow}>
						<span className={styles.title}>
							<Trans>Integrations</Trans>
						</span>
						{anyLinked && (
							<span className={styles.linkedPill}>
								<LinkSimpleIcon size={12} weight="bold" />
								<Trans>Linked</Trans>
							</span>
						)}
					</div>
				)}

				<div className={styles.integrationStack}>
					{twitchLinked && twitch && (
						<div className={styles.integrationCard}>
							<div className={styles.integrationHead}>
								<div className={styles.integrationIdentity}>
									<TwitchLogoIcon size={16} weight="fill" />
									<span className={styles.integrationName}>
										<Trans>Twitch</Trans>
									</span>
								</div>
							</div>
							<div className={styles.integrationDetails}>
								<span className={styles.integrationLogin}>@{twitch.login}</span>
								<div className={styles.verifiedRow}>
									<CheckCircleIcon size={14} weight="fill" />
									<span>
										<Trans>Verified account</Trans>
									</span>
								</div>
							</div>
						</div>
					)}

					{steamLinked && steam ? (
						<a
							href={steam.profileUrl ?? `https://steamcommunity.com/profiles/${steam.steamId}`}
							target="_blank"
							rel="noreferrer noopener"
							className={styles.integrationCard}
							style={{textDecoration: 'none', color: 'inherit'}}
						>
							<div className={styles.integrationHead}>
								<div className={styles.integrationIdentity}>
									<SteamLogoIcon size={16} weight="fill" />
									<span className={styles.integrationName}>
										<Trans>Steam</Trans>
									</span>
								</div>
							</div>
							<div className={styles.integrationDetails}>
								<span className={styles.integrationLogin}>{steam.personaName}</span>
								{(!isCurrentUser || ('presenceVisible' in steam && steam.presenceVisible)) && steam.currentGameName ? (
									<div className={styles.verifiedRow} style={{color: '#7ed957'}}>
										<span>
											<Trans>Playing</Trans> <strong>{steam.currentGameName}</strong>
										</span>
									</div>
								) : (
									<div className={styles.verifiedRow}>
										<CheckCircleIcon size={14} weight="fill" />
										<span>
											<Trans>Verified account</Trans>
										</span>
									</div>
								)}
							</div>
						</a>
					) : null}

					{telegramLinked && telegram ? (
						<a
							href={telegram.username ? `https://t.me/${telegram.username}` : '#'}
							target={telegram.username ? '_blank' : undefined}
							rel="noreferrer noopener"
							className={styles.integrationCard}
							style={{textDecoration: 'none', color: 'inherit', cursor: telegram.username ? 'pointer' : 'default'}}
						>
							<div className={styles.integrationHead}>
								<div className={styles.integrationIdentity}>
									<TelegramLogoIcon size={16} weight="fill" />
									<span className={styles.integrationName}>
										<Trans>Telegram</Trans>
									</span>
								</div>
							</div>
							<div className={styles.integrationDetails}>
								<span className={styles.integrationLogin}>
									{telegram.username ? `@${telegram.username}` : telegram.firstName ?? ''}
								</span>
								<div className={styles.verifiedRow}>
									<CheckCircleIcon size={14} weight="fill" />
									<span>
										<Trans>Verified account</Trans>
									</span>
								</div>
							</div>
						</a>
					) : null}
				</div>
			</div>
		);
	},
);
