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
import {
	GithubLogoIcon,
	LinkSimpleIcon,
	SteamLogoIcon,
	TelegramLogoIcon,
	TiktokLogoIcon,
	TwitchLogoIcon,
	XLogoIcon,
	YoutubeLogoIcon,
} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import React from 'react';
import {SettingsSection} from '~/components/modals/shared/SettingsSection';
import {SettingsTabContainer, SettingsTabContent, SettingsTabHeader} from '~/components/modals/shared/SettingsTabLayout';
import {Button} from '~/components/uikit/Button/Button';
import styles from './AccountIntegrationsTab.module.css';

type IntegrationId =
	| 'twitch'
	| 'youtube'
	| 'x'
	| 'riot'
	| 'steam'
	| 'github'
	| 'tiktok'
	| 'telegram'
	| 'xbox'
	| 'epic_games';

interface IntegrationConfig {
	id: IntegrationId;
	name: string;
	logo: React.ComponentType<{className?: string}>;
	available: boolean;
}

const TWITCH_LINKED_STORAGE_KEY = 'astral:settings:integrations:twitch-linked';

const RiotGamesLogo: React.FC<{className?: string}> = ({className}) => (
	<svg viewBox="0 0 24 24" className={className} aria-hidden={true}>
		<path
			fill="currentColor"
			d="M13.458.86 0 7.093l3.353 12.761 2.552-.313-.701-8.024.838-.373 1.447 8.202 4.361-.535-.775-8.857.83-.37 1.591 9.025 4.412-.542-.849-9.708.84-.374 1.74 9.87L24 17.318V3.5Zm.316 19.356.222 1.256L24 23.14v-4.18l-10.22 1.256Z"
		/>
	</svg>
);

const EpicGamesLogo: React.FC<{className?: string}> = ({className}) => (
	<svg viewBox="0 0 24 24" className={className} aria-hidden={true}>
		<path
			fill="currentColor"
			d="M3.537 0C2.165 0 1.66.506 1.66 1.879V18.44a4.262 4.262 0 00.02.433c.031.3.037.59.316.92.027.033.311.245.311.245.153.075.258.13.43.2l8.335 3.491c.433.199.614.276.928.27h.002c.314.006.495-.071.928-.27l8.335-3.492c.172-.07.277-.124.43-.2 0 0 .284-.211.311-.243.28-.33.285-.621.316-.92a4.261 4.261 0 00.02-.434V1.879c0-1.373-.506-1.88-1.878-1.88zm13.366 3.11h.68c1.138 0 1.688.553 1.688 1.696v1.88h-1.374v-1.8c0-.369-.17-.54-.523-.54h-.235c-.367 0-.537.17-.537.539v5.81c0 .369.17.54.537.54h.262c.353 0 .523-.171.523-.54V8.619h1.373v2.143c0 1.144-.562 1.71-1.7 1.71h-.694c-1.138 0-1.7-.566-1.7-1.71V4.82c0-1.144.562-1.709 1.7-1.709zm-12.186.08h3.114v1.274H6.117v2.603h1.648v1.275H6.117v2.774h1.74v1.275h-3.14zm3.816 0h2.198c1.138 0 1.7.564 1.7 1.708v2.445c0 1.144-.562 1.71-1.7 1.71h-.799v3.338h-1.4zm4.53 0h1.4v9.201h-1.4zm-3.13 1.235v3.392h.575c.354 0 .523-.171.523-.54V4.965c0-.368-.17-.54-.523-.54zm-3.74 10.147a1.708 1.708 0 01.591.108 1.745 1.745 0 01.49.299l-.452.546a1.247 1.247 0 00-.308-.195.91.91 0 00-.363-.068.658.658 0 00-.28.06.703.703 0 00-.224.163.783.783 0 00-.151.243.799.799 0 00-.056.299v.008a.852.852 0 00.056.31.7.7 0 00.157.245.736.736 0 00.238.16.774.774 0 00.303.058.79.79 0 00.445-.116v-.339h-.548v-.565H7.37v1.255a2.019 2.019 0 01-.524.307 1.789 1.789 0 01-.683.123 1.642 1.642 0 01-.602-.107 1.46 1.46 0 01-.478-.3 1.371 1.371 0 01-.318-.455 1.438 1.438 0 01-.115-.58v-.008a1.426 1.426 0 01.113-.57 1.449 1.449 0 01.312-.46 1.418 1.418 0 01.474-.309 1.58 1.58 0 01.598-.111 1.708 1.708 0 01.045 0zm11.963.008a2.006 2.006 0 01.612.094 1.61 1.61 0 01.507.277l-.386.546a1.562 1.562 0 00-.39-.205 1.178 1.178 0 00-.388-.07.347.347 0 00-.208.052.154.154 0 00-.07.127v.008a.158.158 0 00.022.084.198.198 0 00.076.066.831.831 0 00.147.06c.062.02.14.04.236.061a3.389 3.389 0 01.43.122 1.292 1.292 0 01.328.17.678.678 0 01.207.24.739.739 0 01.071.337v.008a.865.865 0 01-.081.382.82.82 0 01-.229.285 1.032 1.032 0 01-.353.18 1.606 1.606 0 01-.46.061 2.16 2.16 0 01-.71-.116 1.718 1.718 0 01-.593-.346l.43-.514c.277.223.578.335.9.335a.457.457 0 00.236-.05.157.157 0 00.082-.142v-.008a.15.15 0 00-.02-.077.204.204 0 00-.073-.066.753.753 0 00-.143-.062 2.45 2.45 0 00-.233-.062 5.036 5.036 0 01-.413-.113 1.26 1.26 0 01-.331-.16.72.72 0 01-.222-.243.73.73 0 01-.082-.36v-.008a.863.863 0 01.074-.359.794.794 0 01.214-.283 1.007 1.007 0 01.34-.185 1.423 1.423 0 01.448-.066 2.006 2.006 0 01.025 0zm-9.358.025h.742l1.183 2.81h-.825l-.203-.499H8.623l-.198.498h-.81zm2.197.02h.814l.663 1.08.663-1.08h.814v2.79h-.766v-1.602l-.711 1.091h-.016l-.707-1.083v1.593h-.754zm3.469 0h2.235v.658h-1.473v.422h1.334v.61h-1.334v.442h1.493v.658h-2.255zm-5.3.897l-.315.793h.624zm-1.145 5.19h8.014l-4.09 1.348z"
		/>
	</svg>
);

const XboxLogo: React.FC<{className?: string}> = ({className}) => (
	<svg viewBox="0 0 512 512" className={className} aria-hidden={true}>
		<path
			fill="currentColor"
			d="M369.9 318.2c44.3 54.3 64.7 98.8 54.4 118.7-7.9 15.1-56.7 44.6-92.6 55.9-29.6 9.3-68.4 13.3-100.4 10.2-38.2-3.7-76.9-17.4-110.1-39C93.3 445.8 87 438.3 87 423.4c0-29.9 32.9-82.3 89.2-142.1 32-33.9 76.5-73.7 81.4-72.6 9.4 2.1 84.3 75.1 112.3 109.5zM188.6 143.8c-29.7-26.9-58.1-53.9-86.4-63.4-15.2-5.1-16.3-4.8-28.7 8.1-29.2 30.4-53.5 79.7-60.3 122.4-5.4 34.2-6.1 43.8-4.2 60.5 5.6 50.5 17.3 85.4 40.5 120.9 9.5 14.6 12.1 17.3 9.3 9.9-4.2-11-.3-37.5 9.5-64 14.3-39 53.9-112.9 120.3-194.4zm311.6 63.5C483.3 127.3 432.7 77 425.6 77c-7.3 0-24.2 6.5-36 13.9-23.3 14.5-41 31.4-64.3 52.8C367.7 197 427.5 283.1 448.2 346c6.8 20.7 9.7 41.1 7.4 52.3-1.7 8.5-1.7 8.5 1.4 4.6 6.1-7.7 19.9-31.3 25.4-43.5 7.4-16.2 15-40.2 18.6-58.7 4.3-22.5 3.9-70.8-.8-93.4zM141.3 43C189 40.5 251 77.5 255.6 78.4c.7.1 10.4-4.2 21.6-9.7 63.9-31.1 94-25.8 107.4-25.2-63.9-39.3-152.7-50-233.9-11.7-23.4 11.1-24 11.9-9.4 11.2z"
		/>
	</svg>
);

const INTEGRATIONS: Array<IntegrationConfig> = [
	{id: 'twitch', name: 'Twitch', logo: TwitchLogoIcon, available: true},
	{id: 'youtube', name: 'YouTube', logo: YoutubeLogoIcon, available: false},
	{id: 'x', name: 'X', logo: XLogoIcon, available: false},
	{id: 'riot', name: 'Riot', logo: RiotGamesLogo, available: false},
	{id: 'steam', name: 'Steam', logo: SteamLogoIcon, available: false},
	{id: 'github', name: 'GitHub', logo: GithubLogoIcon, available: false},
	{id: 'tiktok', name: 'TikTok', logo: TiktokLogoIcon, available: false},
	{id: 'telegram', name: 'Telegram', logo: TelegramLogoIcon, available: false},
	{id: 'xbox', name: 'Xbox', logo: XboxLogo, available: false},
	{id: 'epic_games', name: 'Epic Games', logo: EpicGamesLogo, available: false},
];

const AccountIntegrationsTab: React.FC = observer(() => {
	const {t} = useLingui();
	const [isTwitchLinked, setIsTwitchLinked] = React.useState(false);

	React.useEffect(() => {
		try {
			setIsTwitchLinked(window.localStorage.getItem(TWITCH_LINKED_STORAGE_KEY) === '1');
		} catch {
			setIsTwitchLinked(false);
		}
	}, []);

	const setTwitchLinked = React.useCallback((nextValue: boolean) => {
		setIsTwitchLinked(nextValue);
		try {
			window.localStorage.setItem(TWITCH_LINKED_STORAGE_KEY, nextValue ? '1' : '0');
		} catch {
			// Local storage can be blocked in privacy modes, so we keep the state in memory.
		}
	}, []);

	return (
		<SettingsTabContainer>
			<SettingsTabHeader
				title={t`Account Linking`}
				description={t`Connect external services to your Astral profile. Twitch is available in beta, more integrations are on the way.`}
			/>

			<SettingsTabContent>
				<SettingsSection
					id="integrations"
					title={t`Integrations`}
					description={t`Link accounts to prepare profile verification and richer activity cards.`}
				>
					<div className={styles.integrationGrid}>
						{INTEGRATIONS.map((integration) => {
							const isAvailable = integration.available;
							const isLinked = integration.id === 'twitch' && isTwitchLinked;
							const LogoComponent = integration.logo;

							return (
								<div
									key={integration.id}
									className={isAvailable ? styles.integrationCard : `${styles.integrationCard} ${styles.integrationCardMuted}`}
								>
									<div className={styles.cardHeader}>
										<div className={styles.integrationIdentity}>
											<div className={styles.integrationMark}>
												<LogoComponent className={styles.integrationLogo} />
											</div>
											<div className={styles.integrationText}>
												<div className={styles.integrationName}>{integration.name}</div>
												<div className={styles.integrationDescription}>
													{isAvailable ? (
														<Trans>Ready to connect in beta.</Trans>
													) : (
														<Trans>This integration is planned and will arrive soon.</Trans>
													)}
												</div>
											</div>
										</div>
										<div className={isAvailable ? styles.statusAvailable : styles.statusSoon}>
											{isAvailable ? t`Beta` : t`Soon`}
										</div>
									</div>

									<div className={styles.cardFooter}>
										{integration.id === 'twitch' ? (
											<Button
												small={true}
												variant={isLinked ? 'secondary' : 'primary'}
												onClick={() => setTwitchLinked(!isLinked)}
											>
												{isLinked ? t`Disconnect` : t`Connect`}
											</Button>
										) : (
											<Button small={true} variant="secondary" disabled={true}>
												<Trans>Coming soon</Trans>
											</Button>
										)}
										{isLinked && (
											<div className={styles.connectedState}>
												<LinkSimpleIcon size={14} weight="bold" />
												<Trans>Linked</Trans>
											</div>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</SettingsSection>
			</SettingsTabContent>
		</SettingsTabContainer>
	);
});

export default AccountIntegrationsTab;
