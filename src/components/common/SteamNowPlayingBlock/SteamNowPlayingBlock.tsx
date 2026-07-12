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
import {GameControllerIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import {Endpoints} from '~/Endpoints';
import http from '~/lib/HttpClient';
import AuthenticationStore from '~/stores/AuthenticationStore';
import PresenceStore from '~/stores/PresenceStore';
import SteamIntegrationStore from '~/stores/SteamIntegrationStore';
import styles from './SteamNowPlayingBlock.module.css';

interface SteamNowPlayingBlockProps {
	userId: string;
	className?: string;
	compact?: boolean;
}

interface PublicIntegrationsSteam {
	steam: {
		steamId: string;
		personaName: string;
		profileUrl: string | null;
		currentGameName: string | null;
		presenceVisible?: boolean;
	} | null;
}

const isSteamProvider = (provider: string | null | undefined): boolean => {
	if (!provider) return false;
	return provider.trim().toLowerCase().includes('steam');
};

export const SteamNowPlayingBlock: React.FC<SteamNowPlayingBlockProps> = observer(({userId, className, compact = false}) => {
	const isCurrentUser = userId === AuthenticationStore.currentUserId;
	const [publicSteam, setPublicSteam] = React.useState<PublicIntegrationsSteam['steam']>(null);

	React.useEffect(() => {
		let cancelled = false;

		if (isCurrentUser) {
			void SteamIntegrationStore.ensureBootstrapped();
			setPublicSteam(null);
			return () => {
				cancelled = true;
			};
		}

		void http
			.get<PublicIntegrationsSteam>({
				url: Endpoints.USER_INTEGRATIONS(userId),
				rejectWithError: false,
			})
			.then((response) => {
				if (cancelled) return;
				if (!response.ok) {
					setPublicSteam(null);
					return;
				}
				setPublicSteam(response.body.steam ?? null);
			})
			.catch(() => {
				if (!cancelled) setPublicSteam(null);
			});

		return () => {
			cancelled = true;
		};
	}, [isCurrentUser, userId]);

	const steamConnection = SteamIntegrationStore.connection;
	const presenceActivity = PresenceStore.getMusicActivity(userId);

	let gameName: string | null = null;
	let subtitle: React.ReactNode = null;
	let profileUrl: string | null = null;

	if (isCurrentUser && SteamIntegrationStore.isConnected && steamConnection?.presenceVisible && steamConnection.currentGameName) {
		gameName = steamConnection.currentGameName;
		subtitle = steamConnection.personaName;
		profileUrl = steamConnection.profileUrl ?? `https://steamcommunity.com/profiles/${steamConnection.steamId}`;
	} else if (publicSteam?.currentGameName) {
		gameName = publicSteam.currentGameName;
		subtitle = publicSteam.personaName;
		profileUrl = publicSteam.profileUrl ?? `https://steamcommunity.com/profiles/${publicSteam.steamId}`;
	} else if (isSteamProvider(presenceActivity?.provider)) {
		gameName = presenceActivity?.title?.trim() || null;
		subtitle = <Trans>Playing</Trans>;
		profileUrl = presenceActivity?.trackUrl ?? null;
	}

	if (!gameName) {
		return null;
	}

	const content = (
		<>
			<div className={styles.iconWrap} aria-hidden>
				<GameControllerIcon size={15} weight="fill" />
			</div>
			<div className={styles.labels}>
				<span className={styles.kicker}>
					<Trans>Now playing</Trans>
				</span>
				<span className={styles.gameName} title={gameName}>
					{gameName}
				</span>
				{subtitle && (
					<span className={styles.subtitle} title={typeof subtitle === 'string' ? subtitle : undefined}>
						{subtitle}
					</span>
				)}
			</div>
		</>
	);

	const rootClassName = clsx(styles.root, compact && styles.compact, className);

	if (profileUrl) {
		return (
			<a href={profileUrl} target="_blank" rel="noreferrer noopener" className={rootClassName}>
				{content}
			</a>
		);
	}

	return <div className={rootClassName}>{content}</div>;
});
