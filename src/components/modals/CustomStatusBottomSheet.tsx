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
import {SmileyIcon, XIcon} from '@phosphor-icons/react';
import clsx from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as UserSettingsActionCreators from '~/actions/UserSettingsActionCreators';
import {ExpressionPickerSheet} from '~/components/modals/ExpressionPickerSheet';
import {BottomSheet} from '~/components/uikit/BottomSheet/BottomSheet';
import {Button} from '~/components/uikit/Button/Button';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {CUSTOM_STATUS_TEXT_LIMIT, type CustomStatus, normalizeCustomStatus} from '~/lib/customStatus';
import type {Emoji} from '~/stores/EmojiStore';
import EmojiStore from '~/stores/EmojiStore';
import PresenceStore from '~/stores/PresenceStore';
import UserStore from '~/stores/UserStore';
import {getEmojiURL, shouldUseNativeEmoji} from '~/utils/EmojiUtils';
import styles from './CustomStatusBottomSheet.module.css';

const CUSTOM_STATUS_SNAP_POINTS: Array<number> = [0, 0.52];

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
	expiresAt: string | null;
}): CustomStatus | null => {
	return normalizeCustomStatus({
		text: params.text || null,
		emojiId: params.emojiId,
		emojiName: params.emojiName,
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
	const [selectedExpiry, setSelectedExpiry] = React.useState<string>('never');
	const [isSaving, setIsSaving] = React.useState(false);
	const [emojiPickerOpen, setEmojiPickerOpen] = React.useState(false);

	const mountedAt = React.useMemo(() => new Date(), []);

	React.useEffect(() => {
		if (isOpen) {
			setStatusText(normalizedExisting?.text ?? '');
			setEmojiId(normalizedExisting?.emojiId ?? null);
			setEmojiName(normalizedExisting?.emojiName ?? null);
			setSelectedExpiry('never');
		}
	}, [isOpen, normalizedExisting?.text, normalizedExisting?.emojiId, normalizedExisting?.emojiName]);

	const getExpiresAt = React.useCallback(
		(expiryId: string): string | null => {
			const option = EXPIRY_OPTIONS.find((o) => o.id === expiryId);
			if (!option?.minutes) return null;
			return new Date(mountedAt.getTime() + option.minutes * 60 * 1000).toISOString();
		},
		[mountedAt],
	);

	const draftStatus = React.useMemo(
		() => buildDraftStatus({text: statusText.trim(), emojiId, emojiName, expiresAt: getExpiresAt(selectedExpiry)}),
		[statusText, emojiId, emojiName, selectedExpiry, getExpiresAt],
	);

	const handleEmojiSelect = React.useCallback((emoji: Emoji) => {
		if (emoji.id) {
			setEmojiId(emoji.id);
			setEmojiName(emoji.name);
		} else {
			setEmojiId(null);
			setEmojiName(emoji.surrogates ?? emoji.name);
		}
	}, []);

	const handleClearDraft = () => {
		setStatusText('');
		setEmojiId(null);
		setEmojiName(null);
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

	return (
		<BottomSheet
			isOpen={isOpen}
			onClose={onClose}
			snapPoints={CUSTOM_STATUS_SNAP_POINTS}
			initialSnap={CUSTOM_STATUS_SNAP_POINTS[1]}
			title={t`Custom status`}
			surface="primary"
			zIndex={10001}
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
							onClick={() => setEmojiPickerOpen(true)}
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
				<ExpressionPickerSheet
					isOpen={emojiPickerOpen}
					onClose={() => setEmojiPickerOpen(false)}
					onEmojiSelect={(emoji) => {
						handleEmojiSelect(emoji);
						setEmojiPickerOpen(false);
					}}
					visibleTabs={['emojis']}
					zIndex={10002}
				/>
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
			</div>
		</BottomSheet>
	);
});

CustomStatusBottomSheet.displayName = 'CustomStatusBottomSheet';
