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
import {
	GifIcon,
	GiftIcon,
	ImageSquareIcon,
	LockSimpleIcon,
	MicrophoneIcon,
	PaperPlaneRightIcon,
	SmileyIcon,
	StickerIcon,
	TrashIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import React from 'react';
import * as PremiumModalActionCreators from '~/actions/PremiumModalActionCreators';
import type {ExpressionPickerTabType} from '~/components/popouts/ExpressionPickerPopout';
import {hapticTap} from '~/utils/haptics';
import {TextareaButton} from './TextareaButton';
import styles from './TextareaInput.module.css';

interface TextareaButtonsProps {
	disabled: boolean;
	showAllButtons: boolean;
	showUploadButton?: boolean;
	showGiftButton: boolean;
	showGifButton: boolean;
	showMemesButton: boolean;
	showStickersButton: boolean;
	showEmojiButton: boolean;
	showMessageSendButton: boolean;
	showVoiceMessageButton: boolean;
	expressionPickerOpen: boolean;
	selectedTab: ExpressionPickerTabType;
	isMobile: boolean;
	shouldShowMobileGiftButton: boolean;
	isComposing: boolean;
	isSlowmodeActive: boolean;
	isOverLimit: boolean;
	hasContent: boolean;
	hasAttachments: boolean;
	isMessageSending?: boolean;
	expressionPickerTriggerRef: React.RefObject<HTMLButtonElement | null>;
	invisibleExpressionPickerTriggerRef: React.RefObject<HTMLDivElement | null>;
	onExpressionPickerToggle: (tab: ExpressionPickerTabType) => void;
	onSubmit: () => void;
	onContextMenu: (event: React.MouseEvent) => void;
	disableSendButton?: boolean;
	onVoiceRecordStart?: () => Promise<boolean> | boolean;
	onVoiceRecordStop?: () => void;
	onVoiceRecordCancel?: () => void;
	voiceDisabled?: boolean;
	onVoiceInteractionChange?: (active: boolean) => void;
}

export const TextareaButtons = React.forwardRef<HTMLDivElement, TextareaButtonsProps>(
	(
		{
			disabled,
			showAllButtons,
			showGiftButton,
			showGifButton,
			showMemesButton,
			showStickersButton,
			showEmojiButton,
			showMessageSendButton,
			showVoiceMessageButton,
			expressionPickerOpen,
			selectedTab,
			isMobile,
			shouldShowMobileGiftButton,
			isComposing,
			isSlowmodeActive,
			isOverLimit,
			hasContent,
			hasAttachments,
			isMessageSending = false,
			expressionPickerTriggerRef,
			invisibleExpressionPickerTriggerRef,
			onExpressionPickerToggle,
			onSubmit,
			onContextMenu,
			disableSendButton,
			onVoiceRecordStart,
			onVoiceRecordStop,
			onVoiceRecordCancel,
			voiceDisabled,
			onVoiceInteractionChange,
		},
		ref,
	) => {
		const {t} = useLingui();
		const [isVoiceRecording, setIsVoiceRecording] = React.useState(false);
		const [isVoiceLocked, setIsVoiceLocked] = React.useState(false);
		const [mobileSendCooldownActive, setMobileSendCooldownActive] = React.useState(false);
		const [voiceCancelProgress, setVoiceCancelProgress] = React.useState(0);
		const [voiceLockProgress, setVoiceLockProgress] = React.useState(0);
		const [voiceLockedCancelProgress, setVoiceLockedCancelProgress] = React.useState(0);
		const voiceStartXRef = React.useRef<number | null>(null);
		const voiceStartYRef = React.useRef<number | null>(null);
		const voicePointerIdRef = React.useRef<number | null>(null);
		const shouldCancelOnReleaseRef = React.useRef(false);
		const shouldLockOnReleaseRef = React.useRef(false);
		const gestureModeRef = React.useRef<'undecided' | 'lock' | 'cancel'>('undecided');
		const isVoiceRecordingRef = React.useRef(false);
		const isVoiceLockedRef = React.useRef(false);
		const mobileSendCooldownTimerRef = React.useRef<number | null>(null);
		const suppressLostPointerCaptureRef = React.useRef(false);

		if (disabled) {
			return null;
		}

		const shouldShowDesktopSendButton = showMessageSendButton;
		const shouldShowVoiceButton =
			showVoiceMessageButton &&
			!isComposing &&
			!hasAttachments &&
			!(isMobile && (mobileSendCooldownActive || isMessageSending));
		const isVoiceButtonDisabled = Boolean(voiceDisabled || disableSendButton || isSlowmodeActive || isOverLimit);
		const shouldShowMobileSendButton = isMobile && !shouldShowVoiceButton;
		const shouldShowDesktopSend = !isMobile && shouldShowDesktopSendButton && !shouldShowVoiceButton;
		const isVoiceInteractionActive = isVoiceRecording || isVoiceLocked;

		const resetVoiceState = React.useCallback(() => {
			isVoiceRecordingRef.current = false;
			isVoiceLockedRef.current = false;
			setIsVoiceRecording(false);
			setIsVoiceLocked(false);
			setVoiceCancelProgress(0);
			setVoiceLockProgress(0);
			setVoiceLockedCancelProgress(0);
			shouldCancelOnReleaseRef.current = false;
			shouldLockOnReleaseRef.current = false;
			gestureModeRef.current = 'undecided';
			voiceStartXRef.current = null;
			voiceStartYRef.current = null;
			voicePointerIdRef.current = null;
		}, []);

		React.useEffect(() => {
			onVoiceInteractionChange?.(isVoiceInteractionActive);
		}, [isVoiceInteractionActive, onVoiceInteractionChange]);

		React.useEffect(() => {
			return () => onVoiceInteractionChange?.(false);
		}, [onVoiceInteractionChange]);

		React.useEffect(() => {
			return () => {
				if (mobileSendCooldownTimerRef.current != null) {
					window.clearTimeout(mobileSendCooldownTimerRef.current);
					mobileSendCooldownTimerRef.current = null;
				}
			};
		}, []);

		const startMobileSendCooldown = React.useCallback(() => {
			if (!isMobile) {
				return;
			}

			setMobileSendCooldownActive(true);
			if (mobileSendCooldownTimerRef.current != null) {
				window.clearTimeout(mobileSendCooldownTimerRef.current);
			}
			mobileSendCooldownTimerRef.current = window.setTimeout(() => {
				setMobileSendCooldownActive(false);
				mobileSendCooldownTimerRef.current = null;
			}, 420);
		}, [isMobile]);

		const handleVoicePointerDown = React.useCallback(
			async (event: React.PointerEvent<HTMLButtonElement>) => {
				const pointerTarget = event.currentTarget;

				if (event.pointerType === 'mouse' && event.button !== 0) {
					return;
				}

				if (isVoiceButtonDisabled) {
					return;
				}

				if (isVoiceLocked && isVoiceRecording) {
					voiceStartYRef.current = event.clientY;
					voicePointerIdRef.current = event.pointerId;
					setVoiceLockedCancelProgress(0);
					shouldCancelOnReleaseRef.current = false;
					shouldLockOnReleaseRef.current = false;
					gestureModeRef.current = 'undecided';
					pointerTarget.setPointerCapture(event.pointerId);
					return;
				}

				voiceStartXRef.current = event.clientX;
				voiceStartYRef.current = event.clientY;
				voicePointerIdRef.current = event.pointerId;
				setVoiceCancelProgress(0);
				setVoiceLockProgress(0);
				setVoiceLockedCancelProgress(0);
				shouldCancelOnReleaseRef.current = false;
				shouldLockOnReleaseRef.current = false;
				gestureModeRef.current = 'undecided';
				pointerTarget.setPointerCapture(event.pointerId);
				if (event.pointerType !== 'mouse') {
					event.preventDefault();
				}

				let canStart = true;
				if (onVoiceRecordStart) {
					try {
						canStart = await Promise.resolve(onVoiceRecordStart());
					} catch {
						canStart = false;
					}
				}

				if (!canStart) {
					if (pointerTarget.isConnected && pointerTarget.hasPointerCapture(event.pointerId)) {
						pointerTarget.releasePointerCapture(event.pointerId);
					}
					resetVoiceState();
					return;
				}

				setIsVoiceRecording(true);
				isVoiceRecordingRef.current = true;
				setIsVoiceLocked(false);
				isVoiceLockedRef.current = false;
			},
			[isVoiceButtonDisabled, isVoiceLocked, isVoiceRecording, onVoiceRecordStart, resetVoiceState],
		);

		const handleVoicePointerMove = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
			if (
				!isVoiceRecording ||
				voicePointerIdRef.current !== event.pointerId ||
				voiceStartYRef.current == null
			) {
				return;
			}

			if (isVoiceLocked) {
				if (event.pointerType !== 'mouse') {
					event.preventDefault();
				}
				const deltaY = Math.max(0, event.clientY - voiceStartYRef.current);
				const cancelProgress = Math.min(1, deltaY / 76);
				setVoiceLockedCancelProgress(cancelProgress);
				shouldCancelOnReleaseRef.current = cancelProgress >= 0.65;
				return;
			}

			if (voiceStartXRef.current == null) {
				return;
			}

			const deltaX = Math.max(0, voiceStartXRef.current - event.clientX);
			const deltaY = Math.max(0, voiceStartYRef.current - event.clientY);
			if (event.pointerType !== 'mouse') {
				event.preventDefault();
			}

			if (gestureModeRef.current === 'undecided') {
				if (deltaY >= 12 && deltaY >= deltaX * 0.8) {
					gestureModeRef.current = 'lock';
				} else if (deltaX >= 12 && deltaX > deltaY * 1.15) {
					gestureModeRef.current = 'cancel';
				}
			}

			const canCancelBySwipe = gestureModeRef.current === 'cancel' || (deltaX >= 24 && deltaY < 18);
			const cancelProgress = canCancelBySwipe ? Math.min(1, deltaX / 84) : 0;
			const lockProgress = Math.min(1, deltaY / 76);
			setVoiceCancelProgress(cancelProgress);
			setVoiceLockProgress(lockProgress);
			shouldCancelOnReleaseRef.current = cancelProgress >= 0.5;
			shouldLockOnReleaseRef.current = lockProgress >= 1 && cancelProgress < 0.5;
		}, [isVoiceLocked, isVoiceRecording]);

		const handleVoiceLostPointerCapture = React.useCallback(() => {
			if (suppressLostPointerCaptureRef.current) {
				return;
			}
			// When recording is locked, losing pointer capture is expected after swipe-up lock.
			// Keep recording state until user taps again to send.
			if (isVoiceRecordingRef.current && isVoiceLockedRef.current) {
				return;
			}
			if (isVoiceRecordingRef.current) {
				onVoiceRecordCancel?.();
			}
			resetVoiceState();
		}, [onVoiceRecordCancel, resetVoiceState]);

		const handleVoicePointerUp = React.useCallback(
			(event: React.PointerEvent<HTMLButtonElement>) => {
				if (voicePointerIdRef.current !== event.pointerId) {
					return;
				}
				if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
					return;
				}
				if (!isVoiceRecording) {
					suppressLostPointerCaptureRef.current = true;
					event.currentTarget.releasePointerCapture(event.pointerId);
					queueMicrotask(() => {
						suppressLostPointerCaptureRef.current = false;
					});
					resetVoiceState();
					return;
				}
				if (shouldCancelOnReleaseRef.current) {
					suppressLostPointerCaptureRef.current = true;
					event.currentTarget.releasePointerCapture(event.pointerId);
					queueMicrotask(() => {
						suppressLostPointerCaptureRef.current = false;
					});
					onVoiceRecordCancel?.();
					resetVoiceState();
					return;
				}
				if (shouldLockOnReleaseRef.current) {
					isVoiceLockedRef.current = true;
					setIsVoiceLocked(true);
					setVoiceCancelProgress(0);
					setVoiceLockProgress(1);
					setVoiceLockedCancelProgress(0);
					shouldCancelOnReleaseRef.current = false;
					shouldLockOnReleaseRef.current = false;
					voicePointerIdRef.current = null;
					voiceStartXRef.current = null;
					voiceStartYRef.current = null;
					suppressLostPointerCaptureRef.current = true;
					event.currentTarget.releasePointerCapture(event.pointerId);
					queueMicrotask(() => {
						suppressLostPointerCaptureRef.current = false;
					});
					return;
				}
				if (isVoiceLocked) {
					suppressLostPointerCaptureRef.current = true;
					event.currentTarget.releasePointerCapture(event.pointerId);
					queueMicrotask(() => {
						suppressLostPointerCaptureRef.current = false;
					});
					onVoiceRecordStop?.();
					resetVoiceState();
					return;
				}
				if (isVoiceRecording) {
					suppressLostPointerCaptureRef.current = true;
					event.currentTarget.releasePointerCapture(event.pointerId);
					queueMicrotask(() => {
						suppressLostPointerCaptureRef.current = false;
					});
					onVoiceRecordStop?.();
				}
				resetVoiceState();
			},
			[isVoiceLocked, isVoiceRecording, onVoiceRecordCancel, onVoiceRecordStop, resetVoiceState],
		);

		return (
			<div className={clsx(styles.buttonContainerDense, styles.sideButtonPadding)} ref={ref}>
				{!isMobile && showAllButtons && !isVoiceInteractionActive && (
					<>
						{showGiftButton && (
							<TextareaButton
								icon={GiftIcon}
								label={t`Gift Plutonium`}
								onClick={() => PremiumModalActionCreators.open(true)}
								onContextMenu={onContextMenu}
								className={styles.utilityActionButton}
							/>
						)}

						{showGifButton && (
							<TextareaButton
								icon={GifIcon}
								label={t`GIFs`}
								isSelected={expressionPickerOpen && selectedTab === 'gifs'}
								onClick={() => onExpressionPickerToggle('gifs')}
								onContextMenu={onContextMenu}
								data-expression-picker-tab="gifs"
								keybindAction="toggle_gif_picker"
								className={styles.utilityActionButton}
							/>
						)}

						{showMemesButton && (
							<TextareaButton
								icon={ImageSquareIcon}
								label={t`Media`}
								isSelected={expressionPickerOpen && selectedTab === 'memes'}
								onClick={() => onExpressionPickerToggle('memes')}
								onContextMenu={onContextMenu}
								data-expression-picker-tab="memes"
								keybindAction="toggle_memes_picker"
								className={styles.utilityActionButton}
							/>
						)}

						{showStickersButton && (
							<TextareaButton
								icon={StickerIcon}
								label={t`Stickers`}
								isSelected={expressionPickerOpen && selectedTab === 'stickers'}
								onClick={() => onExpressionPickerToggle('stickers')}
								onContextMenu={onContextMenu}
								data-expression-picker-tab="stickers"
								keybindAction="toggle_sticker_picker"
								className={styles.utilityActionButton}
							/>
						)}
					</>
				)}

				{showEmojiButton && !isVoiceInteractionActive && (
					<TextareaButton
						ref={isMobile ? undefined : expressionPickerTriggerRef}
						icon={SmileyIcon}
						iconProps={{weight: 'fill'}}
						label={t`Emojis`}
						isSelected={expressionPickerOpen && selectedTab === 'emojis'}
						onClick={() => onExpressionPickerToggle('emojis')}
						onContextMenu={onContextMenu}
						data-expression-picker-tab="emojis"
						keybindAction="toggle_emoji_picker"
						className={styles.utilityActionButton}
					/>
				)}

				<div
					ref={invisibleExpressionPickerTriggerRef}
					className={styles.expressionPickerAnchor}
				/>

				{isMobile && !isVoiceInteractionActive && (
					<>
						{shouldShowMobileGiftButton && (
							<TextareaButton
								icon={GiftIcon}
								label={t`Gift Plutonium`}
								onClick={() => PremiumModalActionCreators.open(true)}
								onContextMenu={onContextMenu}
								className={styles.utilityActionButton}
							/>
						)}
					</>
				)}

				{shouldShowMobileSendButton && !isVoiceInteractionActive && (
					<TextareaButton
						disabled={isSlowmodeActive || isOverLimit || (!hasContent && !hasAttachments) || disableSendButton}
						icon={PaperPlaneRightIcon}
						label={t`Send Message · Right-click to schedule`}
						onPointerDown={(event) => {
							event.preventDefault();
						}}
						onClick={() => {
							hapticTap();
							startMobileSendCooldown();
							onSubmit();
						}}
						onContextMenu={onContextMenu}
						keybindCombo={{key: 'Enter'}}
					/>
				)}

				{shouldShowVoiceButton && (
					<div className={styles.voiceRecorderRoot}>
						<div
							className={clsx(
								styles.voiceLockDock,
								isVoiceRecording && styles.voiceLockDockVisible,
								isVoiceLocked && styles.voiceLockDockLocked,
							)}
							aria-hidden={!isVoiceRecording}
						>
							<div className={styles.voiceLockDockGlyph}>
								<LockSimpleIcon weight="fill" className={styles.voiceLockDockIcon} />
							</div>
						</div>

						<div
							className={clsx(
								styles.voiceTrashHint,
								isVoiceRecording && styles.voiceTrashHintVisible,
								(voiceCancelProgress >= 0.5 || voiceLockedCancelProgress >= 0.65) && styles.voiceTrashHintDanger,
							)}
							style={{'--voice-cancel-progress': `${Math.max(voiceCancelProgress, voiceLockedCancelProgress)}`} as React.CSSProperties}
							aria-hidden={!isVoiceRecording}
						>
							<TrashIcon className={styles.voiceTrashHintIcon} weight="fill" />
							<span>{isVoiceLocked ? t`Swipe down to cancel` : t`Swipe left to delete`}</span>
						</div>

						<button
							type="button"
							className={clsx(
								styles.voiceRecorderButton,
								isVoiceRecording && styles.voiceRecorderButtonActive,
								(voiceCancelProgress >= 0.5 || voiceLockedCancelProgress >= 0.65) && styles.voiceRecorderButtonDanger,
							)}
							aria-label={isVoiceLocked ? t`Send voice message` : isVoiceRecording ? t`Release to send voice message` : t`Hold to record voice message`}
							disabled={isVoiceButtonDisabled}
							style={
								{
									'--voice-cancel-progress': `${Math.max(voiceCancelProgress, voiceLockedCancelProgress)}`,
									'--voice-lock-progress': `${voiceLockProgress}`,
									'--voice-locked-cancel-progress': `${voiceLockedCancelProgress}`,
								} as React.CSSProperties
							}
							onPointerDown={handleVoicePointerDown}
							onPointerMove={handleVoicePointerMove}
							onPointerUp={handleVoicePointerUp}
							onPointerCancel={() => {
								onVoiceRecordCancel?.();
								resetVoiceState();
							}}
							onLostPointerCapture={handleVoiceLostPointerCapture}
						>
							{isVoiceLocked ? (
								<PaperPlaneRightIcon weight="fill" className={clsx(styles.voiceRecorderIcon, styles.voiceRecorderIconSend)} />
							) : (
								<MicrophoneIcon weight="fill" className={styles.voiceRecorderIcon} />
							)}
						</button>
					</div>
				)}

				{shouldShowDesktopSend && !isVoiceInteractionActive && (
					<>
						<div className={styles.divider} />
						<TextareaButton
							disabled={isSlowmodeActive || isOverLimit || (!hasContent && !hasAttachments) || disableSendButton}
							icon={PaperPlaneRightIcon}
							label={t`Send Message · Right-click to schedule`}
							onClick={onSubmit}
							onContextMenu={onContextMenu}
							keybindCombo={{key: 'Enter'}}
						/>
					</>
				)}
			</div>
		);
	},
);

TextareaButtons.displayName = 'TextareaButtons';
