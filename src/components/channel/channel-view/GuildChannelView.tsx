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

import {observer} from 'mobx-react-lite';
import React from 'react';
import {useLingui} from '@lingui/react/macro';
import {WaveformIcon} from '@phosphor-icons/react';
import {motion, useReducedMotion} from 'framer-motion';
import * as MessageActionCreators from '~/actions/MessageActionCreators';
import {ChannelTypes} from '~/Constants';
import {
	AccountTooNewBarrier,
	NoPhoneNumberBarrier,
	NotMemberLongEnoughBarrier,
	SendMessageDisabledBarrier,
	UnclaimedAccountBarrier,
	UnverifiedEmailBarrier,
} from '~/components/channel/barriers/BarrierComponents';
import {ChannelChatLayout} from '~/components/channel/ChannelChatLayout';
import {ChannelHeader} from '~/components/channel/ChannelHeader';
import {ChannelMembers} from '~/components/channel/ChannelMembers';
import {ChannelTextarea} from '~/components/channel/ChannelTextarea';
import {NSFWChannelGate} from '~/components/channel/NSFWChannelGate';
import {VerificationBarrier} from '~/components/channel/VerificationBarrier';
import {Button} from '~/components/uikit/Button/Button';
/*
 * Lazy-load the entire voice call view (~600KB of LiveKit + media
 * machinery) so it only ships when the user actually clicks into a
 * voice channel. Most sessions never touch voice and were paying for
 * the full call client up-front. The chunk lands in the existing
 * `livekit` cacheGroup automatically.
 */
const VoiceCallView = React.lazy(() =>
	import('~/components/voice/VoiceCallView').then((m) => ({default: m.VoiceCallView})),
);
import {useChannelMemberListVisibility} from '~/hooks/useChannelMemberListVisibility';
import {useChannelSearchVisibility} from '~/hooks/useChannelSearchVisibility';
import {useAstralDocumentTitle} from '~/hooks/useAstralDocumentTitle';
import {useMemberListVisible} from '~/hooks/useMemberListVisible';
import {useLocation} from '~/lib/router';
import ChannelStore from '~/stores/ChannelStore';
import DeveloperOptionsStore from '~/stores/DeveloperOptionsStore';
import GuildNSFWAgreeStore, {NSFWGateReason} from '~/stores/GuildNSFWAgreeStore';
import GuildStore from '~/stores/GuildStore';
import GuildVerificationStore from '~/stores/GuildVerificationStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import MediaEngineStore from '~/stores/voice/MediaEngineFacade';
import styles from '../ChannelIndexPage.module.css';
import {ChannelSearchResults} from '../ChannelSearchResults';
import {Messages} from '../Messages';
import {ChannelViewScaffold} from './ChannelViewScaffold';
import {useChannelSearchState} from './useChannelSearchState';

interface GuildChannelViewProps {
	channelId: string;
	guildId?: string | null;
	messageId?: string;
}

const ARC_EASE = [0.22, 1, 0.36, 1] as const;

function getPanelMotion(reducedMotion: boolean) {
	if (reducedMotion) {
		return {};
	}

	return {
		initial: {opacity: 0, y: 14, scale: 0.985},
		animate: {opacity: 1, y: 0, scale: 1},
		transition: {duration: 0.32, ease: ARC_EASE},
	};
}

function getItemMotion(reducedMotion: boolean, delay = 0) {
	if (reducedMotion) {
		return {};
	}

	return {
		initial: {opacity: 0, y: 10},
		animate: {opacity: 1, y: 0},
		transition: {duration: 0.26, ease: ARC_EASE, delay},
	};
}

export const GuildChannelView = observer(({channelId, guildId, messageId}: GuildChannelViewProps) => {
	const {i18n} = useLingui();
	const location = useLocation();
	const reducedMotion = useReducedMotion() ?? false;
	const isRussian = i18n.locale.toLowerCase().startsWith('ru');
	const channel = ChannelStore.getChannel(channelId);
	const guild = guildId ? GuildStore.getGuild(guildId) : null;
	const isMemberListVisible = useMemberListVisible();
	const {enabled: isMobileLayout} = MobileLayoutStore;
	const room = MediaEngineStore.room;
	const connectedChannelId = MediaEngineStore.channelId;
	const nsfwGateReason = GuildNSFWAgreeStore.getGateReason(channelId);
	const showNSFWGate = nsfwGateReason !== NSFWGateReason.NONE;
	const forceMockNSFWGate = DeveloperOptionsStore.mockNSFWGateReason !== 'none';
	const searchState = useChannelSearchState(channel);
	const {
		isSearchActive,
		handleSearchClose,
		handleSearchSubmit,
		searchRefreshKey,
		activeSearchQuery,
		activeSearchSegments,
	} = searchState;

	useChannelSearchVisibility(channelId, isSearchActive);
	useChannelMemberListVisibility(channelId, isMemberListVisible && !isMobileLayout);

	React.useEffect(() => {
		if (messageId && channelId) {
			MessageActionCreators.jumpToMessage(channelId, messageId, true);
		}
	}, [location.pathname, channelId, messageId]);

	React.useEffect(() => {
		const handleGlobalKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && isSearchActive) {
				searchState.setIsSearchActive(false);
			}
		};

		document.addEventListener('keydown', handleGlobalKeydown, {capture: true});
		return () => {
			document.removeEventListener('keydown', handleGlobalKeydown, {capture: true} as any);
		};
	}, [isSearchActive, searchState]);

	const channelTitlePart = channel
		? `${channel.type === ChannelTypes.GUILD_VOICE ? '' : '#'}${channel.name ?? ''}`
		: null;
	const guildTitlePart = guild ? guild.name : null;
	useAstralDocumentTitle(channel ? [channelTitlePart, guildTitlePart] : undefined);

	if (!(guild && channel)) {
		return null;
	}

	const isVoiceChannel = channel.type === ChannelTypes.GUILD_VOICE;
	const isConnectedToThisChannel = isVoiceChannel && connectedChannelId === channelId && room;
	const voiceEmptyCopy = isRussian
		? {
				eyebrow: '\u0413\u043e\u043b\u043e\u0441\u043e\u0432\u043e\u0435 \u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e',
				description:
					'\u042d\u0442\u043e \u0433\u043e\u043b\u043e\u0441\u043e\u0432\u043e\u0439 \u043a\u0430\u043d\u0430\u043b. \u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u0435\u0441\u044c, \u0447\u0442\u043e\u0431\u044b \u043d\u0430\u0447\u0430\u0442\u044c \u0440\u0430\u0437\u0433\u043e\u0432\u043e\u0440.',
				join: '\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u044c\u0441\u044f \u043a \u043a\u0430\u043d\u0430\u043b\u0443',
			}
		: {
				eyebrow: 'Voice space',
				description: 'This is a voice channel. Connect to start talking!',
				join: 'Join Voice Channel',
			};

	const passesVerification = channel.isPrivate() || GuildVerificationStore.canAccessGuild(channel.guildId || '');

	const renderChatArea = () => {
		if (DeveloperOptionsStore.mockVerificationBarrier !== 'none' && !channel.isPrivate()) {
			switch (DeveloperOptionsStore.mockVerificationBarrier) {
				case 'unclaimed_account':
					return <UnclaimedAccountBarrier />;
				case 'unverified_email':
					return <UnverifiedEmailBarrier />;
				case 'account_too_new':
					return (
						<AccountTooNewBarrier initialTimeRemaining={DeveloperOptionsStore.mockBarrierTimeRemaining || 300000} />
					);
				case 'not_member_long':
					return (
						<NotMemberLongEnoughBarrier
							initialTimeRemaining={DeveloperOptionsStore.mockBarrierTimeRemaining || 600000}
						/>
					);
				case 'no_phone':
					return <NoPhoneNumberBarrier />;
				case 'send_message_disabled':
					return <SendMessageDisabledBarrier />;
				default:
					return passesVerification ? <ChannelTextarea channel={channel} /> : <VerificationBarrier channel={channel} />;
			}
		}

		return passesVerification ? <ChannelTextarea channel={channel} /> : <VerificationBarrier channel={channel} />;
	};

	if (isVoiceChannel) {
		if (isConnectedToThisChannel && room) {
			return (
				<div className={styles.voiceChannelContainer}>
					<React.Suspense fallback={null}>
						<VoiceCallView channel={channel} />
					</React.Suspense>
				</div>
			);
		}

		return (
			<div className={styles.channelGrid}>
				<ChannelHeader channel={channel} showMembersToggle={false} showPins={false} />
				<div className={styles.voiceChannelCanvas}>
					<div className={`${styles.voiceBackdropOrb} ${styles.voiceBackdropOrbPrimary}`} aria-hidden />
					<div className={`${styles.voiceBackdropOrb} ${styles.voiceBackdropOrbSecondary}`} aria-hidden />
					<motion.div className={styles.emptyStateContent} {...getPanelMotion(reducedMotion)}>
						<motion.div className={styles.voiceHero} {...getItemMotion(reducedMotion, 0.04)}>
							<div className={styles.voiceBadge} aria-hidden>
								<WaveformIcon weight="fill" className={styles.voiceBadgeIcon} />
							</div>
							<div className={styles.centeredText}>
								<div className={styles.voiceChannelEyebrow}>{voiceEmptyCopy.eyebrow}</div>
								<h2 className={styles.voiceChannelTitle}>{channel.name}</h2>
								<p className={styles.voiceChannelDescription}>{voiceEmptyCopy.description}</p>
							</div>
						</motion.div>
						<motion.div className={styles.buttonContainer} {...getItemMotion(reducedMotion, 0.1)}>
							<Button
								type="button"
								onClick={() => MediaEngineStore.connectToVoiceChannel(channel.guildId!, channel.id)}
								fitContainer={false}
								fitContent
							>
								{voiceEmptyCopy.join}
							</Button>
						</motion.div>
					</motion.div>
				</div>
			</div>
		);
	}

	if ((channel.isNSFW() && showNSFWGate) || forceMockNSFWGate) {
		return (
			<div className={styles.channelGrid}>
				<ChannelHeader channel={channel} showMembersToggle={false} showPins={false} />
				<NSFWChannelGate channelId={channelId} reason={nsfwGateReason} />
			</div>
		);
	}

	const shouldRenderMemberList = isMemberListVisible && !isMobileLayout && !isSearchActive;

	return (
		<ChannelViewScaffold
			header={
				<ChannelHeader
					channel={channel}
					showMembersToggle={true}
					showPins={true}
					onSearchSubmit={handleSearchSubmit}
					onSearchClose={handleSearchClose}
					isSearchResultsOpen={isSearchActive}
				/>
			}
			chatArea={
				<ChannelChatLayout
					channel={channel}
					messages={<Messages key={channel.id} channel={channel} />}
					textarea={renderChatArea()}
				/>
			}
			sidePanel={
				isSearchActive ? (
					<div className={styles.searchPanel}>
						<ChannelSearchResults
							channel={channel}
							searchQuery={activeSearchQuery}
							searchSegments={activeSearchSegments}
							refreshKey={searchRefreshKey}
							onClose={() => searchState.setIsSearchActive(false)}
						/>
					</div>
				) : shouldRenderMemberList ? (
					<ChannelMembers channel={channel} guild={guild} />
				) : null
			}
			showMemberListDivider={shouldRenderMemberList && !isSearchActive}
		/>
	);
});
