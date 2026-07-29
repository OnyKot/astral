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

import {useLingui} from '@lingui/react/macro';
import {PushPinSimpleIcon, WaveformIcon, XIcon} from '@phosphor-icons/react';
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import {type CSSProperties, type MouseEvent, useCallback, useEffect, useMemo} from 'react';
import * as ChannelPinsActionCreators from '~/actions/ChannelPinsActionCreators';
import {isVoiceLikeAttachment} from '~/components/channel/messageAttachmentUtils';
import type {ChannelRecord} from '~/records/ChannelRecord';
import type {MessageRecord} from '~/records/MessageRecord';
import ChannelPinsStore from '~/stores/ChannelPinsStore';
import VoiceMessagePlaybackStore from '~/stores/VoiceMessagePlaybackStore';
import {goToMessage} from '~/utils/MessageNavigator';
import * as NicknameUtils from '~/utils/NicknameUtils';
import {formatTime} from '../media-player/utils/formatTime';
import styles from './ChatTopBanners.module.css';

interface ChatTopBannersProps {
	channel: ChannelRecord;
}

const PANEL_EASE = [0.22, 1, 0.36, 1] as const;

function getMessageSummary(message: MessageRecord, voiceLabel: string, messageLabel: string): string {
	const content = message.content.trim().replace(/\s+/g, ' ');
	if (content) {
		return content;
	}

	if (message.attachments.some(isVoiceLikeAttachment)) {
		return voiceLabel;
	}

	return messageLabel;
}

export const ChatTopBanners = observer(({channel}: ChatTopBannersProps) => {
	const {t} = useLingui();
	const reducedMotion = useReducedMotion() ?? false;
	const pins = ChannelPinsStore.getPins(channel.id);
	const latestPin = ChannelPinsStore.getLatestPin(channel.id);
	const pinsFetched = ChannelPinsStore.isFetched(channel.id);
	const pinsLoading = ChannelPinsStore.getIsLoading(channel.id);
	const storePinTimestamp = ChannelPinsStore.getLastPinTimestamp(channel.id);
	const channelPinTimestamp = channel.lastPinTimestamp?.getTime() ?? 0;
	const hasPinSignal = Boolean(channelPinTimestamp || storePinTimestamp || pins.length > 0);
	const activeVoice =
		VoiceMessagePlaybackStore.active?.channelId === channel.id ? VoiceMessagePlaybackStore.active : null;

	useEffect(() => {
		if (!hasPinSignal || pinsFetched || pinsLoading) {
			return;
		}

		void ChannelPinsActionCreators.fetch(channel.id);
	}, [channel.id, hasPinSignal, pinsFetched, pinsLoading]);

	const pinnedSummary = useMemo(
		() => (latestPin ? getMessageSummary(latestPin.message, t`Voice Message Player`, t`Message`) : ''),
		[latestPin, t],
	);
	const pinnedAuthorName = useMemo(
		() =>
			latestPin
				? NicknameUtils.getNickname(latestPin.message.author, channel.guildId, latestPin.message.channelId)
				: '',
		[channel.guildId, latestPin],
	);
	const pinnedMessageId = latestPin?.message.id;
	const handlePinnedClick = useCallback(() => {
		if (pinnedMessageId) {
			goToMessage(channel.id, pinnedMessageId, {offset: 96});
		}
	}, [channel.id, pinnedMessageId]);

	const handleVoiceClick = useCallback(() => {
		if (activeVoice) {
			goToMessage(activeVoice.channelId, activeVoice.messageId, {offset: 96});
		}
	}, [activeVoice]);
	const handleStopVoice = useCallback((event: MouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
		event.stopPropagation();
		VoiceMessagePlaybackStore.stopActivePlayback();
	}, []);

	const voiceProgress = activeVoice?.duration
		? Math.max(0, Math.min(100, (activeVoice.currentTime / activeVoice.duration) * 100))
		: 0;
	const voiceTimeLabel = activeVoice
		? activeVoice.duration > 0
			? `${formatTime(activeVoice.currentTime)} / ${formatTime(activeVoice.duration)}`
			: formatTime(activeVoice.currentTime)
		: '';

	const hasVisibleBanner = Boolean(latestPin || activeVoice);
	const panelMotion = reducedMotion
		? {}
		: {
				initial: {height: 0, opacity: 0, y: -10},
				animate: {height: 'auto', opacity: 1, y: 0},
				exit: {height: 0, opacity: 0, y: -8},
				transition: {duration: 0.22, ease: PANEL_EASE},
			};
	const itemMotion = reducedMotion
		? {}
		: {
				initial: {opacity: 0, y: -8},
				animate: {opacity: 1, y: 0},
				exit: {opacity: 0, y: -6},
				transition: {duration: 0.18, ease: PANEL_EASE},
			};

	return (
		<AnimatePresence initial={false}>
			{hasVisibleBanner && (
				<motion.div className={styles.topBanners} {...panelMotion}>
					<AnimatePresence initial={false}>
						{latestPin && (
							<motion.button
								key={`pin-${latestPin.message.id}`}
								type="button"
								className={`${styles.banner} ${styles.bannerButton}`}
								onClick={handlePinnedClick}
								aria-label={t`Pinned Messages`}
								{...itemMotion}
							>
								<span className={styles.iconShell} aria-hidden="true">
									<PushPinSimpleIcon weight="fill" className={styles.icon} />
								</span>
								<span className={styles.textColumn}>
									<span className={styles.title}>{t`Pinned Messages`}</span>
									<span className={styles.summary}>
										{pinnedAuthorName && <span className={styles.authorName}>{pinnedAuthorName}</span>}
										<span className={styles.previewText}>{pinnedSummary}</span>
									</span>
								</span>
							</motion.button>
						)}
						{activeVoice && (
							<motion.div
								key={`voice-${activeVoice.key}`}
								className={styles.banner}
								style={{'--voice-playback-progress': `${voiceProgress}%`} as CSSProperties}
								{...itemMotion}
							>
								<button
									type="button"
									className={styles.bannerMain}
									onClick={handleVoiceClick}
									aria-label={t`Voice Message Player`}
								>
									<span className={styles.voiceIconShell} aria-hidden="true">
										<WaveformIcon weight="fill" className={styles.icon} />
									</span>
									<span className={styles.textColumn}>
										<span className={styles.title}>{t`Voice Message Player`}</span>
										<span className={styles.summary}>
											{activeVoice.authorName && (
												<span className={styles.authorName}>{activeVoice.authorName}</span>
											)}
											<span className={styles.previewText}>{voiceTimeLabel}</span>
										</span>
									</span>
								</button>
								<button type="button" className={styles.closeButton} onClick={handleStopVoice} aria-label={t`Close`}>
									<XIcon weight="bold" className={styles.closeIcon} />
								</button>
								<span className={styles.voiceProgress} aria-hidden="true" />
							</motion.div>
						)}
					</AnimatePresence>
				</motion.div>
			)}
		</AnimatePresence>
	);
});
