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
import {SmileyIcon, SparkleIcon, XIcon} from '@phosphor-icons/react';
import clsx from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as UserSettingsActionCreators from '~/actions/UserSettingsActionCreators';
import {MobileEmojiPicker} from '~/components/channel/MobileEmojiPicker';
import {StatusGifEmojiPicker} from '~/components/modals/StatusGifEmojiPicker';
import {BottomSheet} from '~/components/uikit/BottomSheet/BottomSheet';
import {Button} from '~/components/uikit/Button/Button';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {type SegmentedTab, SegmentedTabs} from '~/components/uikit/SegmentedTabs/SegmentedTabs';
import {CUSTOM_STATUS_TEXT_LIMIT, type CustomStatus, normalizeCustomStatus} from '~/lib/customStatus';
import {getStatusGifEmoji, type StatusGifEmoji} from '~/lib/statusGifEmojis';
import type {Emoji} from '~/stores/EmojiStore';
import EmojiStore from '~/stores/EmojiStore';
import PresenceStore from '~/stores/PresenceStore';
import UserStore from '~/stores/UserStore';
import {getEmojiURL, shouldUseNativeEmoji} from '~/utils/EmojiUtils';
import styles from './CustomStatusBottomSheet.module.css';

const CUSTOM_STATUS_COMPACT_SNAP = 0.52;
const CUSTOM_STATUS_EXPANDED_SNAP = 0.74;
type StatusEmojiTab = 'emojis' | 'status-gif-emojis';

const EXPIRY_OPTIONS = [
	{id: 'never', label: <Trans>Don&apos;t clear</Trans>, minutes: null},
	{id: '30m', label: <Trans>30 minutes</Trans>, minutes: 30},
	{id: '1h', label: <Trans>1 hour</Trans>, minutes: 60},
	{id: '4h', label: <Trans>4 hours</Trans>, minutes: 4 * 60},
	{id: '24h', label: <Trans>24 hours</Trans>, minutes: 24 * 60},
];

interface CustomStatusBottomSheetProps {
	isOpen: boolean;
	onClose: () => void;
}

const buildDraftStatus = (params: {
	text: string;
	emojiId: string | null;
	emojiName: string | null;
	emojiAnimated?: boolean | null;
	expiresAt: string | null;
}): CustomStatus | null => {
	return normalizeCustomStatus({
		text: params.text || null,
		emojiId: params.emojiId,
		emojiName: params.emojiName,
		emojiAnimated: params.emojiAnimated ?? null,
		expiresAt: params.expiresAt,
	});
};

export const CustomStatusBottomSheet = observer(({isOpen, onClose}: CustomStatusBottomSheetProps) => {
	const {t} = useLingui();
	const currentUser = UserStore.getCurrentUser();
	const currentUserId = currentUser?.id ?? null;
	const existingCustomStatus = currentUserId ? PresenceStore.getCustomStatus(currentUserId) : null;
	const normalizedExisting = normalizeCustomStatus(existingCustomStatus);

	const [statusText, setStatusText] = React.useState('');
	const [emojiId, setEmojiId] = React.useState<string | null>(null);
	const [emojiName, setEmojiName] = React.useState<string | null>(null);
	const [emojiAnimated, setEmojiAnimated] = React.useState<boolean | null>(null);
	const [selectedExpiry, setSelectedExpiry] = React.useState<string>('never');
	const [isSaving, setIsSaving] = React.useState(false);
	const [emojiPickerOpen, setEmojiPickerOpen] = React.useState(false);
	const [selectedEmojiTab, setSelectedEmojiTab] = React.useState<StatusEmojiTab>('emojis');

	const mountedAt = React.useMemo(() => new Date(), []);

	React.useEffect(() => {
		if (isOpen) {
			setStatusText(normalizedExisting?.text ?? '');
			setEmojiId(normalizedExisting?.emojiId ?? null);
			setEmojiName(normalizedExisting?.emojiName ?? null);
			setEmojiAnimated(normalizedExisting?.emojiAnimated ?? null);
			setSelectedExpiry('never');
			setEmojiPickerOpen(false);
			setSelectedEmojiTab(getStatusGifEmoji(normalizedExisting?.emojiName) ? 'status-gif-emojis' : 'emojis');
		}
	}, [
		isOpen,
		normalizedExisting?.text,
		normalizedExisting?.emojiId,
		normalizedExisting?.emojiName,
		normalizedExisting?.emojiAnimated,
	]);

	const getExpiresAt = React.useCallback(
		(expiryId: string): string | null => {
			const option = EXPIRY_OPTIONS.find((o) => o.id === expiryId);
			if (!option?.minutes) return null;
			return new Date(mountedAt.getTime() + option.minutes * 60 * 1000).toISOString();
		},
		[mountedAt],
	);

	const draftStatus = React.useMemo(
		() =>
			buildDraftStatus({
				text: statusText.trim(),
				emojiId,
				emojiName,
				emojiAnimated,
				expiresAt: getExpiresAt(selectedExpiry),
			}),
		[statusText, emojiId, emojiName, emojiAnimated, selectedExpiry, getExpiresAt],
	);

	const handleEmojiSelect = React.useCallback((emoji: Emoji) => {
		if (emoji.id) {
			setEmojiId(emoji.id);
			setEmojiName(emoji.name);
			setEmojiAnimated(emoji.animated ?? null);
		} else {
			setEmojiId(null);
			setEmojiName(emoji.surrogates ?? emoji.name);
			setEmojiAnimated(null);
		}
	}, []);

	const handleStatusGifEmojiSelect = React.useCallback((emoji: StatusGifEmoji) => {
		setEmojiId(null);
		setEmojiName(emoji.value);
		setEmojiAnimated(true);
	}, []);

	const handleClearDraft = () => {
		setStatusText('');
		setEmojiId(null);
		setEmojiName(null);
		setEmojiAnimated(null);
	};

	const handleClearStatus = async () => {
		if (isSaving) return;

		setIsSaving(true);
		try {
			await UserSettingsActionCreators.update({customStatus: null});
			onClose();
		} finally {
			setIsSaving(false);
		}
	};

	const handleSave = async () => {
		if (isSaving) return;

		setIsSaving(true);
		try {
			await UserSettingsActionCreators.update({customStatus: draftStatus});
			onClose();
		} finally {
			setIsSaving(false);
		}
	};

	const renderEmojiPreview = (): React.ReactNode => {
		if (!draftStatus) return null;
		if (draftStatus.emojiId) {
			const emoji = EmojiStore.getEmojiById(draftStatus.emojiId);
			if (emoji?.url) {
				return <img src={emoji.url} alt={emoji.name} className={styles.emojiPreviewImage} />;
			}
		}
		if (draftStatus.emojiName) {
			const statusGifEmoji = getStatusGifEmoji(draftStatus.emojiName);
			if (statusGifEmoji) {
				return <img src={statusGifEmoji.url} alt={statusGifEmoji.name} className={styles.emojiPreviewImage} />;
			}

			if (!shouldUseNativeEmoji) {
				const twemojiUrl = getEmojiURL(draftStatus.emojiName);
				if (twemojiUrl) {
					return <img src={twemojiUrl} alt={draftStatus.emojiName} className={styles.emojiPreviewImage} />;
				}
			}
			return <span className={styles.emojiPreviewNative}>{draftStatus.emojiName}</span>;
		}
		return null;
	};

	const emojiPreview = renderEmojiPreview();
	const emojiTabs = React.useMemo<Array<SegmentedTab<StatusEmojiTab>>>(
		() => [
			{
				id: 'emojis',
				label: t`Emoji`,
				ariaLabel: t`Emojis`,
				icon: SmileyIcon,
			},
			{
				id: 'status-gif-emojis',
				label: t`Animated`,
				ariaLabel: t`Animated status emoji`,
				icon: SparkleIcon,
				tone: 'animated',
			},
		],
		[t],
	);

	return (
		<BottomSheet
			isOpen={isOpen}
			onClose={onClose}
			snapPoints={[0, CUSTOM_STATUS_COMPACT_SNAP, CUSTOM_STATUS_EXPANDED_SNAP]}
			initialSnap={emojiPickerOpen ? CUSTOM_STATUS_EXPANDED_SNAP : CUSTOM_STATUS_COMPACT_SNAP}
			title={t`Custom status`}
			surface="primary"
			zIndex={10001}
			containerClassName={styles.statusSheet}
		>
			<div className={styles.content}>
				<p className={styles.description}>
					<Trans>Show a short note next to your profile.</Trans>
				</p>
				<div className={styles.composer} data-sheet-drag-ignore="true">
					<FocusRing offset={-2} enabled={!isSaving}>
						<button
							type="button"
							className={clsx(styles.emojiTriggerButton, emojiPickerOpen && styles.emojiTriggerButtonActive)}
							aria-label={emojiPreview ? t`Change emoji` : t`Choose an emoji`}
							disabled={isSaving}
							onClick={() => {
								setSelectedEmojiTab(getStatusGifEmoji(emojiName) ? 'status-gif-emojis' : 'emojis');
								setEmojiPickerOpen((open) => !open);
							}}
						>
							{emojiPreview ?? <SmileyIcon size={22} weight="fill" aria-hidden="true" />}
						</button>
					</FocusRing>
					<input
						id="custom-status-text"
						className={styles.statusInput}
						value={statusText}
						onChange={(event) => setStatusText(event.target.value.slice(0, CUSTOM_STATUS_TEXT_LIMIT))}
						maxLength={CUSTOM_STATUS_TEXT_LIMIT}
						placeholder={t`What's happening?`}
						disabled={isSaving}
					/>
					{draftStatus && (
						<FocusRing offset={-2} enabled={!isSaving}>
							<button
								type="button"
								className={styles.clearButtonIcon}
								onClick={handleClearDraft}
								disabled={isSaving}
								aria-label={t`Clear custom status`}
							>
								<XIcon size={16} weight="bold" />
							</button>
						</FocusRing>
					)}
				</div>
				<div className={styles.expiryGroup} data-sheet-drag-ignore="true" aria-label={t`Clear after`}>
					{EXPIRY_OPTIONS.map((option) => (
						<button
							key={option.id}
							type="button"
							className={clsx(styles.expiryChip, selectedExpiry === option.id && styles.expiryChipActive)}
							onClick={() => setSelectedExpiry(option.id)}
							disabled={isSaving}
							aria-pressed={selectedExpiry === option.id}
						>
							{option.label}
						</button>
					))}
				</div>
				<div className={styles.footer}>
					<Button
						variant="secondary"
						onClick={handleClearStatus}
						submitting={isSaving}
						disabled={!normalizedExisting}
						className={styles.actionButton}
					>
						<Trans>Clear</Trans>
					</Button>
					<Button variant="primary" onClick={handleSave} submitting={isSaving} className={styles.actionButton}>
						<Trans>Save</Trans>
					</Button>
				</div>
				{emojiPickerOpen && (
					<div className={styles.statusEmojiPanel} data-sheet-drag-ignore="true">
						<SegmentedTabs
							tabs={emojiTabs}
							selectedTab={selectedEmojiTab}
							onTabChange={setSelectedEmojiTab}
							ariaLabel={t`Status emoji categories`}
							className={styles.statusEmojiTabs}
						/>
						<div className={styles.statusEmojiBody}>
							{selectedEmojiTab === 'emojis' ? (
								<MobileEmojiPicker
									channelId={undefined}
									handleSelect={(emoji) => {
										handleEmojiSelect(emoji);
										setEmojiPickerOpen(false);
									}}
									hideSearchBar
								/>
							) : (
								<StatusGifEmojiPicker
									selectedValue={emojiName}
									onSelect={(emoji) => {
										handleStatusGifEmojiSelect(emoji);
										setEmojiPickerOpen(false);
									}}
									compact
									disabled={isSaving}
								/>
							)}
						</div>
					</div>
				)}
			</div>
		</BottomSheet>
	);
});

CustomStatusBottomSheet.displayName = 'CustomStatusBottomSheet';
