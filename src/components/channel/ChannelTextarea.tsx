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

import {PlusCircleIcon} from '@phosphor-icons/react';

import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';

import * as ContextMenuActionCreators from '~/actions/ContextMenuActionCreators';
import * as DraftActionCreators from '~/actions/DraftActionCreators';
import * as MessageActionCreators from '~/actions/MessageActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as PopoutActionCreators from '~/actions/PopoutActionCreators';
import * as ScheduledMessageActionCreators from '~/actions/ScheduledMessageActionCreators';
import * as ToastActionCreators from '~/actions/ToastActionCreators';

import {MAX_MESSAGE_LENGTH_NON_PREMIUM, MessageAttachmentFlags, Permissions} from '~/Constants';

import {TooManyAttachmentsModal} from '~/components/alerts/TooManyAttachmentsModal';
import {Autocomplete} from '~/components/channel/Autocomplete';
import {ChannelAttachmentArea} from '~/components/channel/ChannelAttachmentArea';
import {ChannelStickersArea} from '~/components/channel/ChannelStickersArea';
import {EditBar} from '~/components/channel/EditBar';
import {
	getMentionDescription,
	getMentionTitle,
	MentionEveryonePopout,
} from '~/components/channel/MentionEveryonePopout';
import {MessageCharacterCounter} from '~/components/channel/MessageCharacterCounter';
import {ReplyBar} from '~/components/channel/ReplyBar';
import {ScheduledMessageEditBar} from '~/components/channel/ScheduledMessageEditBar';
import {MessageInputButtonsContextMenu} from '~/components/channel/textarea/MessageInputButtonsContextMenu';
import {TextareaButton} from '~/components/channel/textarea/TextareaButton';
import {TextareaButtons} from '~/components/channel/textarea/TextareaButtons';
import {TextareaInputField} from '~/components/channel/textarea/TextareaInputField';
import {ConfirmModal} from '~/components/modals/ConfirmModal';
import {ExpressionPickerSheet} from '~/components/modals/ExpressionPickerSheet';
import {ScheduleMessageModal} from '~/components/modals/ScheduleMessageModal';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {openPopout} from '~/components/uikit/Popout/Popout';
import {Scroller, type ScrollerHandle} from '~/components/uikit/Scroller';

import {useTextareaAttachments} from '~/hooks/useCloudUpload';
import {doesEventMatchShortcut, MARKDOWN_FORMATTING_SHORTCUTS, useMarkdownKeybinds} from '~/hooks/useMarkdownKeybinds';
import {useMessageSubmission} from '~/hooks/useMessageSubmission';
import {useSlowmode} from '~/hooks/useSlowmode';
import {useTextareaAutocomplete} from '~/hooks/useTextareaAutocomplete';
import {useTextareaDraftAndTyping} from '~/hooks/useTextareaDraftAndTyping';
import {useTextareaEditing} from '~/hooks/useTextareaEditing';
import {useTextareaEmojiPicker} from '~/hooks/useTextareaEmojiPicker';
import {useTextareaExpressionHandlers} from '~/hooks/useTextareaExpressionHandlers';
import {useTextareaExpressionPicker} from '~/hooks/useTextareaExpressionPicker';
import {useTextareaKeyboard} from '~/hooks/useTextareaKeyboard';
import {useTextareaPaste} from '~/hooks/useTextareaPaste';
import {useTextareaSegments} from '~/hooks/useTextareaSegments';
import {type MentionConfirmationInfo, useTextareaSubmit} from '~/hooks/useTextareaSubmit';

import {CloudUpload} from '~/lib/CloudUpload';
import {ComponentDispatch} from '~/lib/ComponentDispatch';
import {safeFocus} from '~/lib/InputFocusManager';

import type {ChannelRecord} from '~/records/ChannelRecord';

import AccessibilityStore from '~/stores/AccessibilityStore';
import ChannelStickerStore from '~/stores/ChannelStickerStore';
import DeveloperOptionsStore from '~/stores/DeveloperOptionsStore';
import DraftStore from '~/stores/DraftStore';
import FeatureFlagStore from '~/stores/FeatureFlagStore';
import KeyboardModeStore from '~/stores/KeyboardModeStore';
import MessageEditMobileStore from '~/stores/MessageEditMobileStore';
import MessageEditStore from '~/stores/MessageEditStore';
import MessageReplyStore from '~/stores/MessageReplyStore';
import MessageStore from '~/stores/MessageStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import PermissionStore from '~/stores/PermissionStore';
import ScheduledMessageEditorStore from '~/stores/ScheduledMessageEditorStore';
import SelectedGuildStore from '~/stores/SelectedGuildStore';
import UserStore from '~/stores/UserStore';

import * as ChannelUtils from '~/utils/ChannelUtils';
import {openFilePicker} from '~/utils/FilePickerUtils';
import * as FileUploadUtils from '~/utils/FileUploadUtils';
import {normalizeMessageContent} from '~/utils/MessageRequestUtils';
import * as MessageSubmitUtils from '~/utils/MessageSubmitUtils';
import * as PlaceholderUtils from '~/utils/PlaceholderUtils';
import {sanitizeTextareaDisplayValue} from '~/utils/TextareaEmojiDisplayUtils';
import {deleteEmojiAtCaret} from '~/utils/TextareaEmojiEditingUtils';

import wrapperStyles from './textarea/InputWrapper.module.css';
import styles from './textarea/TextareaInput.module.css';

function readBorderBoxBlockSize(entry: ResizeObserverEntry): number {
	const bbs: any = (entry as any).borderBoxSize;
	if (Array.isArray(bbs) && bbs[0] && typeof bbs[0].blockSize === 'number') return bbs[0].blockSize;
	if (bbs && typeof bbs.blockSize === 'number') return bbs.blockSize;
	return (entry.target as HTMLElement).getBoundingClientRect().height;
}

const ChannelTextareaContent = observer(
	({
		channel,
		draft,
		disabled,
		canAttachFiles,
		canSendVoiceMessages,
	}: {
		channel: ChannelRecord;
		draft: string | null;
		disabled: boolean;
		canAttachFiles: boolean;
		canSendVoiceMessages: boolean;
	}) => {
		const {t, i18n} = useLingui();
		const [isFocused, setIsFocused] = React.useState(false);
		const [isInputAreaFocused, setIsInputAreaFocused] = React.useState(false);
		const [value, setValue] = React.useState('');
		const [showAllButtons, setShowAllButtons] = React.useState(true);
		const [containerWidth, setContainerWidth] = React.useState(0);
		const [pendingMentionConfirmation, setPendingMentionConfirmation] = React.useState<MentionConfirmationInfo | null>(
			null,
		);
		const mentionPopoutKey = React.useMemo(() => `mention-everyone-${channel.id}`, [channel.id]);
		const mentionModalKey = React.useMemo(() => `mention-everyone-modal-${channel.id}`, [channel.id]);
		const [isScheduleModalOpen, setIsScheduleModalOpen] = React.useState(false);
		const [isVoiceInteractionActive, setIsVoiceInteractionActive] = React.useState(false);
		const [voiceRecordingStartedAt, setVoiceRecordingStartedAt] = React.useState<number | null>(null);
		const [voiceRecordingElapsedMs, setVoiceRecordingElapsedMs] = React.useState(0);

		const textareaRef = React.useRef<HTMLTextAreaElement>(null);
		const expressionPickerTriggerRef = React.useRef<HTMLButtonElement>(null);
		const invisibleExpressionPickerTriggerRef = React.useRef<HTMLDivElement>(null);
		const containerRef = React.useRef<HTMLDivElement>(null);
		const scrollerRef = React.useRef<ScrollerHandle>(null);
		useMarkdownKeybinds(isFocused);

		const textareaHeightRef = React.useRef<number>(0);
		const handleTextareaHeightChange = React.useCallback((height: number) => {
			textareaHeightRef.current = height;
		}, []);

		const inputBoxHeightRef = React.useRef<number | null>(null);
		const pendingLayoutDeltaRef = React.useRef(0);
		const flushScheduledRef = React.useRef(false);

		React.useLayoutEffect(() => {
			const el = containerRef.current;
			if (!el || typeof ResizeObserver === 'undefined') return;

			inputBoxHeightRef.current = null;
			pendingLayoutDeltaRef.current = 0;
			flushScheduledRef.current = false;

			const flush = () => {
				flushScheduledRef.current = false;
				const delta = pendingLayoutDeltaRef.current;
				pendingLayoutDeltaRef.current = 0;
				if (!delta) return;
				if (delta <= 0) return;

				ComponentDispatch.dispatch('LAYOUT_RESIZED', {
					channelId: channel.id,
					heightDelta: delta,
				});
			};

			const ro = new ResizeObserver((entries) => {
				const entry = entries[0];
				if (!entry) return;

				const nextHeight = Math.round(readBorderBoxBlockSize(entry));
				const prevHeight = inputBoxHeightRef.current;

				if (prevHeight == null) {
					inputBoxHeightRef.current = nextHeight;
					return;
				}

				const delta = nextHeight - prevHeight;
				if (!delta) return;

				inputBoxHeightRef.current = nextHeight;
				pendingLayoutDeltaRef.current += delta;

				if (!flushScheduledRef.current) {
					flushScheduledRef.current = true;
					queueMicrotask(flush);
				}
			});

			ro.observe(el);
			return () => ro.disconnect();
		}, [channel.id]);

		const showGiftButton = AccessibilityStore.showGiftButton;
		const showGifButton = AccessibilityStore.showGifButton;
		const showMemesButton = AccessibilityStore.showMemesButton;
		const showStickersButton = AccessibilityStore.showStickersButton;
		const showEmojiButton = AccessibilityStore.showEmojiButton;
		const showUploadButton = AccessibilityStore.showUploadButton;
		const showMessageSendButton = AccessibilityStore.showMessageSendButton;
		const editingMessageId = MessageEditStore.getEditingMessageId(channel.id);
		const editingMobileMessageId = MessageEditMobileStore.getEditingMobileMessageId(channel.id);
		const mobileLayout = MobileLayoutStore;
		const replyingMessage = MessageReplyStore.getReplyingMessage(channel.id);
		const referencedMessage = replyingMessage ? MessageStore.getMessage(channel.id, replyingMessage.messageId) : null;
		const editingMessage = editingMobileMessageId ? MessageStore.getMessage(channel.id, editingMobileMessageId) : null;
		const currentUser = UserStore.getCurrentUser();
		const maxMessageLength = currentUser?.maxMessageLength ?? MAX_MESSAGE_LENGTH_NON_PREMIUM;

		const uploadAttachments = useTextareaAttachments(channel.id);
		const {isSlowmodeActive} = useSlowmode(channel);
		const {
			segmentManagerRef,
			previousValueRef,
			displayToActual,
			insertSegment,
			handleTextChange,
			clearSegments,
		} = useTextareaSegments();
		const {handleEmojiSelect} = useTextareaEmojiPicker({
			setValue,
			textareaRef,
			insertSegment,
			previousValueRef,
			channelId: channel.id,
			allowUnicodeEmojiSelection: true,
		});
		const scheduledMessageEditorState = ScheduledMessageEditorStore.getEditingState();
		const isEditingScheduledMessage = ScheduledMessageEditorStore.isEditingChannel(channel.id);
		const editingScheduledMessage = isEditingScheduledMessage ? scheduledMessageEditorState : null;
		const selectedGuildId = SelectedGuildStore.selectedGuildId;
		const hasMessageSchedulingAccess = FeatureFlagStore.isMessageSchedulingEnabled(selectedGuildId ?? undefined);

		const {sendMessage, sendOptimisticMessage} = useMessageSubmission({
			channel,
			referencedMessage: referencedMessage ?? null,
			replyingMessage,
			clearSegments,
		});

		const handleCancelScheduledEdit = React.useCallback(() => {
			ScheduledMessageEditorStore.stopEditing();
			DraftActionCreators.deleteDraft(channel.id);
			setValue('');
			clearSegments();
		}, [channel.id, clearSegments, setValue]);

		const handleSendMessage = React.useCallback(
			(...args: Parameters<typeof sendMessage>) => {
				setValue('');
				clearSegments();
				sendMessage(...args);
			},
			[sendMessage, clearSegments],
		);

		const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
		const voiceStreamRef = React.useRef<MediaStream | null>(null);
		const voiceChunksRef = React.useRef<Array<BlobPart>>([]);
		const voiceMimeTypeRef = React.useRef('audio/webm');
		const voiceAudioContextRef = React.useRef<AudioContext | null>(null);
		const voiceAnalyserRef = React.useRef<AnalyserNode | null>(null);
		const voiceAnalyserDataRef = React.useRef<Uint8Array | null>(null);
		const voiceAnalyserFrameRef = React.useRef<number | null>(null);
		const [voiceInputLevel, setVoiceInputLevel] = React.useState(0);
		const [voiceInputSpectrum, setVoiceInputSpectrum] = React.useState<Array<number>>(() => Array.from({length: 20}, () => 0));
		const [, setIsVoiceRecordingActive] = React.useState(false);

		React.useEffect(() => {
			if (!isVoiceInteractionActive || !voiceRecordingStartedAt) {
				setVoiceRecordingElapsedMs(0);
				return;
			}

			const interval = window.setInterval(() => {
				setVoiceRecordingElapsedMs(Date.now() - voiceRecordingStartedAt);
			}, 120);

			return () => window.clearInterval(interval);
		}, [isVoiceInteractionActive, voiceRecordingStartedAt]);

		const teardownVoiceStream = React.useCallback(() => {
			if (voiceAnalyserFrameRef.current != null) {
				window.cancelAnimationFrame(voiceAnalyserFrameRef.current);
				voiceAnalyserFrameRef.current = null;
			}
			voiceAnalyserRef.current = null;
			voiceAnalyserDataRef.current = null;
			setVoiceInputLevel(0);
			setVoiceInputSpectrum(Array.from({length: 20}, () => 0));

			const audioContext = voiceAudioContextRef.current;
			voiceAudioContextRef.current = null;
			if (audioContext) {
				void audioContext.close().catch(() => undefined);
			}

			if (voiceStreamRef.current) {
				voiceStreamRef.current.getTracks().forEach((track) => track.stop());
			}
			voiceStreamRef.current = null;
		}, []);

		const handleVoiceRecordStart = React.useCallback(async (): Promise<boolean> => {
			if (disabled || isEditingScheduledMessage) {
				return false;
			}
			if (!canSendVoiceMessages) {
				ToastActionCreators.error(t`You do not have permission to send voice messages in this channel.`);
				return false;
			}

			if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
				ToastActionCreators.error(t`Voice messages are not supported in this browser.`);
				return false;
			}
			if (!navigator.mediaDevices?.getUserMedia) {
				ToastActionCreators.error(t`Microphone access is unavailable in this browser.`);
				return false;
			}

			try {
				const stream = await navigator.mediaDevices.getUserMedia({audio: true});
				const preferredMimeTypes = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/ogg'];
				const supportedMimeType = preferredMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
				const recorder = supportedMimeType ? new MediaRecorder(stream, {mimeType: supportedMimeType}) : new MediaRecorder(stream);
				const audioContext = new AudioContext();
				const analyser = audioContext.createAnalyser();
				analyser.fftSize = 256;
				analyser.smoothingTimeConstant = 0.72;
				const sourceNode = audioContext.createMediaStreamSource(stream);
				sourceNode.connect(analyser);
				const analyserData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));

				voiceStreamRef.current = stream;
				voiceChunksRef.current = [];
				voiceMimeTypeRef.current = recorder.mimeType || supportedMimeType || 'audio/webm';
				voiceAudioContextRef.current = audioContext;
				voiceAnalyserRef.current = analyser;
				voiceAnalyserDataRef.current = analyserData;
				mediaRecorderRef.current = recorder;

				recorder.ondataavailable = (event) => {
					if (event.data.size > 0) {
						voiceChunksRef.current.push(event.data);
					}
				};

				const updateVoiceLevel = () => {
					const activeAnalyser = voiceAnalyserRef.current;
					const activeData = voiceAnalyserDataRef.current;
					if (!activeAnalyser || !activeData) {
						return;
					}

					(activeAnalyser as any).getByteTimeDomainData(activeData);
					let sumSquares = 0;
					for (let index = 0; index < activeData.length; index += 1) {
						const normalized = activeData[index] / 128 - 1;
						sumSquares += normalized * normalized;
					}
					const rms = Math.sqrt(sumSquares / activeData.length);
					const level = Math.min(1, rms * 4.6);
					setVoiceInputLevel((previous) => previous * 0.45 + level * 0.55);

					const frequencyData = new Uint8Array(activeAnalyser.frequencyBinCount);
					activeAnalyser.getByteFrequencyData(frequencyData);
					const bucketCount = 20;
					const usableBins = Math.max(bucketCount, Math.floor(frequencyData.length * 0.74));
					const nextSpectrum = Array.from({length: bucketCount}, (_, bucketIndex) => {
						const start = Math.floor((bucketIndex / bucketCount) * usableBins);
						const end = Math.max(start + 1, Math.floor(((bucketIndex + 1) / bucketCount) * usableBins));
						let sum = 0;
						for (let i = start; i < end; i += 1) {
							sum += frequencyData[i] ?? 0;
						}
						const average = sum / (end - start);
						const normalized = average / 255;
						const gated = Math.max(0, normalized - 0.045);
						return Math.pow(Math.min(1, gated / 0.955), 0.88);
					});
					setVoiceInputSpectrum((previous) =>
						previous.map((value, index) => {
							const incoming = nextSpectrum[index] ?? 0;
							const smoothing = incoming > value ? 0.62 : 0.34;
							return value * (1 - smoothing) + incoming * smoothing;
						}),
					);
					voiceAnalyserFrameRef.current = window.requestAnimationFrame(updateVoiceLevel);
				};

				recorder.start();
				voiceAnalyserFrameRef.current = window.requestAnimationFrame(updateVoiceLevel);
				setIsVoiceRecordingActive(true);
				setVoiceRecordingStartedAt(Date.now());
				setVoiceRecordingElapsedMs(0);
				return true;
			} catch (error) {
				console.error('Failed to start voice recording:', error);
				ToastActionCreators.error(t`Allow microphone access to send voice messages.`);
				teardownVoiceStream();
				mediaRecorderRef.current = null;
				voiceChunksRef.current = [];
				setIsVoiceRecordingActive(false);
				setVoiceRecordingStartedAt(null);
				setVoiceRecordingElapsedMs(0);
				return false;
			}
		}, [canSendVoiceMessages, disabled, isEditingScheduledMessage, t, teardownVoiceStream]);

		const handleVoiceRecordCancel = React.useCallback(() => {
			const recorder = mediaRecorderRef.current;
			if (recorder && recorder.state !== 'inactive') {
				recorder.stop();
			}

			mediaRecorderRef.current = null;
			voiceChunksRef.current = [];
			setIsVoiceRecordingActive(false);
			setVoiceRecordingStartedAt(null);
			setVoiceRecordingElapsedMs(0);
			teardownVoiceStream();
		}, [teardownVoiceStream]);

		const handleVoiceRecordStop = React.useCallback(async () => {
			const recorder = mediaRecorderRef.current;
			if (!recorder || recorder.state === 'inactive') {
				return;
			}

			try {
				const audioBlob = await new Promise<Blob>((resolve, reject) => {
					const handleStop = () => {
						resolve(new Blob(voiceChunksRef.current, {type: voiceMimeTypeRef.current || 'audio/webm'}));
					};
					const handleError = () => {
						reject(new Error('voice_recording_stop_failed'));
					};
					recorder.addEventListener('stop', handleStop, {once: true});
					recorder.addEventListener('error', handleError, {once: true});
					recorder.stop();
				});

				if (audioBlob.size === 0) {
					return;
				}

				const mimeType = voiceMimeTypeRef.current || audioBlob.type || 'audio/webm';
				const extension = mimeType.includes('ogg') ? 'ogg' : 'webm';
				const voiceFile = new File([audioBlob], `voice-message-${Date.now()}.${extension}`, {type: mimeType});

				await CloudUpload.addFiles(channel.id, [voiceFile]);
				const currentAttachments = CloudUpload.getTextareaAttachments(channel.id);
				const latestAttachment = currentAttachments[currentAttachments.length - 1];

				if (latestAttachment) {
					CloudUpload.updateAttachment(channel.id, latestAttachment.id, {
						flags: latestAttachment.flags | MessageAttachmentFlags.IS_VOICE_MESSAGE,
					});
				}

				handleSendMessage('', true, false);
			} catch (error) {
				console.error('Failed to send voice message:', error);
				ToastActionCreators.error(t`Could not send voice message. Please try again.`);
			} finally {
				mediaRecorderRef.current = null;
				voiceChunksRef.current = [];
				setIsVoiceRecordingActive(false);
				setVoiceRecordingStartedAt(null);
				setVoiceRecordingElapsedMs(0);
				teardownVoiceStream();
			}
		}, [channel.id, handleSendMessage, t, teardownVoiceStream]);

		React.useEffect(() => {
			return () => {
				const recorder = mediaRecorderRef.current;
				if (recorder && recorder.state !== 'inactive') {
					recorder.stop();
				}
				mediaRecorderRef.current = null;
				voiceChunksRef.current = [];
				setVoiceRecordingStartedAt(null);
				setVoiceRecordingElapsedMs(0);
				teardownVoiceStream();
			};
		}, [teardownVoiceStream]);

		const handleMentionConfirmationNeeded = React.useCallback((info: MentionConfirmationInfo) => {
			setPendingMentionConfirmation(info);
		}, []);

		const handleMentionConfirm = React.useCallback(() => {
			if (pendingMentionConfirmation) {
				handleSendMessage(pendingMentionConfirmation.content, false, pendingMentionConfirmation.tts);
				setPendingMentionConfirmation(null);
			}
		}, [pendingMentionConfirmation, handleSendMessage]);

		const handleMentionCancel = React.useCallback(() => {
			setPendingMentionConfirmation(null);
			textareaRef.current?.focus();
		}, []);

		React.useEffect(() => {
			if (!pendingMentionConfirmation) {
				PopoutActionCreators.close(mentionPopoutKey);
				ModalActionCreators.popWithKey(mentionModalKey);
				return;
			}

			if (mobileLayout.enabled) {
				const index = pendingMentionConfirmation.mentionType;
				const title = getMentionTitle(index, pendingMentionConfirmation.roleName);
				const description = getMentionDescription(
					index,
					pendingMentionConfirmation.memberCount,
					pendingMentionConfirmation.roleName,
				);

				ModalActionCreators.pushWithKey(
					modal(() => (
						<ConfirmModal
							title={title}
							description={description}
							primaryText={t`Continue`}
							secondaryText={t`Cancel`}
							onPrimary={() => {
								handleMentionConfirm();
							}}
							onSecondary={() => {
								handleMentionCancel();
							}}
						/>
					)),
					mentionModalKey,
				);

				return () => {
					ModalActionCreators.popWithKey(mentionModalKey);
				};
			}

			const containerElement = containerRef.current;
			if (!containerElement) {
				return;
			}

			openPopout(
				containerElement,
				{
					render: ({onClose}) => (
						<MentionEveryonePopout
							mentionType={pendingMentionConfirmation.mentionType}
							memberCount={pendingMentionConfirmation.memberCount}
							roleName={pendingMentionConfirmation.roleName}
							onConfirm={() => {
								handleMentionConfirm();
								onClose();
							}}
							onCancel={() => {
								handleMentionCancel();
								onClose();
							}}
						/>
					),
					position: 'top-start',
					offsetMainAxis: 8,
					shouldAutoUpdate: true,
					returnFocusRef: textareaRef,
					onCloseRequest: () => {
						handleMentionCancel();
						return true;
					},
				},
				mentionPopoutKey,
			);

			return () => {
				PopoutActionCreators.close(mentionPopoutKey);
			};
		}, [
			pendingMentionConfirmation,
			mentionPopoutKey,
			mentionModalKey,
			handleMentionConfirm,
			handleMentionCancel,
			textareaRef,
			mobileLayout.enabled,
		]);

		const {
			autocompleteQuery,
			autocompleteOptions,
			autocompleteType,
			selectedIndex,
			isAutocompleteAttached,
			setSelectedIndex,
			onCursorMove,
			handleSelect,
		} = useTextareaAutocomplete({
			channel,
			value,
			setValue,
			textareaRef,
			segmentManagerRef,
			previousValueRef,
		});

		React.useEffect(() => {
			ComponentDispatch.safeDispatch('TEXTAREA_AUTOCOMPLETE_CHANGED', {
				channelId: channel.id,
				open: isAutocompleteAttached,
			});
		}, [channel.id, isAutocompleteAttached]);

		const trimmedMessageContent = displayToActual(value).trim();
		const hasScheduleContent = trimmedMessageContent.length > 0 || uploadAttachments.length > 0;
		const canScheduleMessage = hasMessageSchedulingAccess && !disabled && hasScheduleContent;

		useTextareaPaste({
			channel,
			textareaRef,
			segmentManagerRef,
			setValue,
			previousValueRef,
		});

		const handleOpenScheduleModal = React.useCallback(() => {
			if (!hasMessageSchedulingAccess) {
				return;
			}
			setIsScheduleModalOpen(true);
		}, [hasMessageSchedulingAccess]);

		const handleScheduleSubmit = React.useCallback(
			async (scheduledLocalAt: string, timezone: string) => {
				const actualContent = displayToActual(value).trim();
				if (!actualContent && uploadAttachments.length === 0) {
					return;
				}

				const normalized = normalizeMessageContent(actualContent, undefined);

				if (editingScheduledMessage) {
					await ScheduledMessageActionCreators.updateScheduledMessage(i18n, {
						channelId: channel.id,
						scheduledMessageId: editingScheduledMessage.scheduledMessageId,
						scheduledLocalAt,
						timezone,
						normalized,
						payload: editingScheduledMessage.payload,
						replyMentioning: replyingMessage?.mentioning,
					});
					ScheduledMessageEditorStore.stopEditing();
				} else {
					await ScheduledMessageActionCreators.scheduleMessage(i18n, {
						channelId: channel.id,
						content: actualContent,
						scheduledLocalAt,
						timezone,
						messageReference: MessageSubmitUtils.prepareMessageReference(channel.id, referencedMessage),
						replyMentioning: replyingMessage?.mentioning,
						favoriteMemeId: undefined,
						stickers: undefined,
						tts: false,
						hasAttachments: uploadAttachments.length > 0,
					});
				}

				setValue('');
				clearSegments();
				setIsScheduleModalOpen(false);
			},
			[
				channel.id,
				clearSegments,
				displayToActual,
				editingScheduledMessage,
				referencedMessage,
				replyingMessage?.mentioning,
				setIsScheduleModalOpen,
				setValue,
				uploadAttachments.length,
				value,
			],
		);

		const handleFileButtonClick = async () => {
			const files = await openFilePicker({multiple: true});
			const result = await FileUploadUtils.handleFileUpload(channel.id, files, uploadAttachments.length);

			if (!result.success && result.error === 'too_many_attachments') {
				ModalActionCreators.push(modal(() => <TooManyAttachmentsModal />));
			}
		};

		useTextareaExpressionHandlers({
			setValue,
			textareaRef,
			insertSegment,
			previousValueRef,
			sendOptimisticMessage,
		});

		const {expressionPickerOpen, setExpressionPickerOpen, handleExpressionPickerTabToggle, selectedTab} =
			useTextareaExpressionPicker({
				channelId: channel.id,
				onEmojiSelect: handleEmojiSelect,
				expressionPickerTriggerRef,
				invisibleExpressionPickerTriggerRef,
				textareaRef,
			});
		const shouldRestoreFocusAfterPickerCloseRef = React.useRef(false);
		const shouldPlaceCursorAtEndAfterPickerCloseRef = React.useRef(false);

		const requestTypingFocusAfterPickerClose = React.useCallback(() => {
			shouldRestoreFocusAfterPickerCloseRef.current = true;
			shouldPlaceCursorAtEndAfterPickerCloseRef.current = true;
		}, []);

		const closeExpressionPickerForTyping = React.useCallback(() => {
			if (!mobileLayout.enabled || !expressionPickerOpen) {
				return false;
			}

			requestTypingFocusAfterPickerClose();
			setExpressionPickerOpen(false);
			return true;
		}, [expressionPickerOpen, mobileLayout.enabled, requestTypingFocusAfterPickerClose, setExpressionPickerOpen]);

		React.useEffect(() => {
			if (!mobileLayout.enabled || expressionPickerOpen || !shouldRestoreFocusAfterPickerCloseRef.current) {
				return;
			}

			shouldRestoreFocusAfterPickerCloseRef.current = false;
			const shouldPlaceCursorAtEnd = shouldPlaceCursorAtEndAfterPickerCloseRef.current;
			shouldPlaceCursorAtEndAfterPickerCloseRef.current = false;

			let caretTimeoutId: number | null = null;

			const frameId = window.requestAnimationFrame(() => {
				const textarea = textareaRef.current;
				if (!textarea) {
					return;
				}

				safeFocus(textarea, true);
				if (!shouldPlaceCursorAtEnd) {
					return;
				}

				const placeCursorAtEnd = () => {
					const node = textareaRef.current;
					if (!node) {
						return;
					}

					const endPosition = node.value.length;
					node.setSelectionRange(endPosition, endPosition);
				};

				placeCursorAtEnd();
				caretTimeoutId = window.setTimeout(placeCursorAtEnd, 0);
			});

			return () => {
				window.cancelAnimationFrame(frameId);
				if (caretTimeoutId !== null) {
					window.clearTimeout(caretTimeoutId);
				}
			};
		}, [expressionPickerOpen, mobileLayout.enabled, textareaRef]);

		const handleExpressionPickerSheetClose = React.useCallback(() => {
			if (mobileLayout.enabled) {
				requestTypingFocusAfterPickerClose();
			}
			setExpressionPickerOpen(false);
		}, [mobileLayout.enabled, requestTypingFocusAfterPickerClose, setExpressionPickerOpen]);

		useTextareaEditing({
			channelId: channel.id,
			editingMessageId: editingMessageId ?? null,
			editingMessage: editingMessage ?? null,
			isMobileEditMode: mobileLayout.enabled,
			replyingMessage,
			value,
			setValue,
			textareaRef,
			previousValueRef,
		});

		const hasPendingSticker = ChannelStickerStore.getPendingSticker(channel.id) !== null;
		const hasAttachments = uploadAttachments.length > 0;
		const showAttachments = hasAttachments;
		const showStickers = hasPendingSticker;
		const isComposing = !!value.trim() || hasAttachments || hasPendingSticker;
		const isOverCharacterLimit = value.length > maxMessageLength;
		const shouldShowMobileGiftButton = mobileLayout.enabled && showGiftButton && containerWidth > 540;

		const {onSubmit} = useTextareaSubmit({
			channelId: channel.id,
			guildId: channel.guildId ?? null,
			editingMessage: editingMessage ?? null,
			isMobileEditMode: mobileLayout.enabled,
			uploadAttachmentsLength: uploadAttachments.length,
			hasPendingSticker,
			value,
			setValue,
			displayToActual,
			clearSegments,
			isSlowmodeActive,
			handleSendMessage,
			onMentionConfirmationNeeded: handleMentionConfirmationNeeded,
			i18n: i18n,
		});

		const handleEscapeKey = React.useCallback(
			(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
				if (event.key !== 'Escape') return;

				if (hasAttachments || hasPendingSticker || replyingMessage) {
					event.preventDefault();

					if (hasAttachments) {
						CloudUpload.clearTextarea(channel.id);
					}

					if (hasPendingSticker) {
						ChannelStickerStore.removePendingSticker(channel.id);
					}

					if (replyingMessage) {
						MessageActionCreators.stopReply(channel.id);
					}

					return;
				}

				if (isInputAreaFocused && KeyboardModeStore.keyboardModeEnabled) {
					event.preventDefault();
					KeyboardModeStore.exitKeyboardMode();
					return;
				}

				if (AccessibilityStore.escapeExitsKeyboardMode) {
					KeyboardModeStore.exitKeyboardMode();
				}
			},
			[
				channel.id,
				hasAttachments,
				hasPendingSticker,
				replyingMessage,
				isInputAreaFocused,
				KeyboardModeStore.keyboardModeEnabled,
				AccessibilityStore.escapeExitsKeyboardMode,
			],
		);

		const handleFormattingShortcut = React.useCallback(
			(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
				for (const {combo: shortcutCombo, wrapper} of MARKDOWN_FORMATTING_SHORTCUTS) {
					if (!doesEventMatchShortcut(event, shortcutCombo)) {
						continue;
					}

					const textarea = textareaRef.current;
					if (!textarea) {
						return;
					}

					const selectionStart = textarea.selectionStart ?? 0;
					const selectionEnd = textarea.selectionEnd ?? 0;
					if (selectionStart === selectionEnd) {
						return;
					}

					const selectedText = value.slice(selectionStart, selectionEnd);
					const wrapperLength = wrapper.length;
					const alreadyWrappedInside =
						selectedText.length >= wrapperLength * 2 &&
						selectedText.startsWith(wrapper) &&
						selectedText.endsWith(wrapper);
					const hasPrefixWrapper =
						wrapperLength > 0 &&
						selectionStart >= wrapperLength &&
						value.slice(selectionStart - wrapperLength, selectionStart) === wrapper;
					const hasSuffixWrapper =
						wrapperLength > 0 &&
						selectionEnd + wrapperLength <= value.length &&
						value.slice(selectionEnd, selectionEnd + wrapperLength) === wrapper;

					let newValue: string;
					let newSelectionStart: number;
					let newSelectionEnd: number;

					if (alreadyWrappedInside) {
						const unwrappedText = selectedText.slice(wrapperLength, selectedText.length - wrapperLength);
						newValue = value.slice(0, selectionStart) + unwrappedText + value.slice(selectionEnd);
						newSelectionStart = selectionStart;
						newSelectionEnd = selectionStart + unwrappedText.length;
					} else if (hasPrefixWrapper && hasSuffixWrapper) {
						newValue =
							value.slice(0, selectionStart - wrapperLength) + selectedText + value.slice(selectionEnd + wrapperLength);
						newSelectionStart = selectionStart - wrapperLength;
						newSelectionEnd = selectionEnd - wrapperLength;
					} else {
						const wrappedText = `${wrapper}${selectedText}${wrapper}`;
						newValue = value.slice(0, selectionStart) + wrappedText + value.slice(selectionEnd);
						newSelectionStart = selectionStart + wrapperLength;
						newSelectionEnd = selectionEnd + wrapperLength;
					}

					handleTextChange(newValue, previousValueRef.current);
					setValue(newValue);

					const updateSelection = () => {
						textarea.setSelectionRange(newSelectionStart, newSelectionEnd);
					};

					window.requestAnimationFrame(updateSelection);

					event.preventDefault();
					event.stopPropagation();
					return;
				}
			},
			[handleTextChange, previousValueRef, setValue, textareaRef, value],
		);

		const handleTextareaKeyDown = React.useCallback(
			(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
				if (event.key === 'Backspace' || event.key === 'Delete') {
					const textarea = textareaRef.current;
					if (textarea) {
						const selectionStart = textarea.selectionStart ?? 0;
						const selectionEnd = textarea.selectionEnd ?? selectionStart;
						const deletionResult = deleteEmojiAtCaret(
							value,
							selectionStart,
							selectionEnd,
							event.key,
							segmentManagerRef.current,
						);

						if (deletionResult) {
							event.preventDefault();
							event.stopPropagation();
							setValue(deletionResult.value);
							previousValueRef.current = deletionResult.value;

							window.requestAnimationFrame(() => {
								const node = textareaRef.current;
								if (!node) {
									return;
								}

								node.setSelectionRange(deletionResult.cursorPosition, deletionResult.cursorPosition);
							});
							return;
						}
					}
				}

				handleFormattingShortcut(event);
				handleEscapeKey(event);
			},
			[handleEscapeKey, handleFormattingShortcut, previousValueRef, segmentManagerRef, setValue, textareaRef, value],
		);

		const handleSubmit = React.useCallback(() => {
			if (isOverCharacterLimit || isEditingScheduledMessage) {
				return;
			}
			onSubmit();
		}, [isOverCharacterLimit, onSubmit, isEditingScheduledMessage]);

		useTextareaDraftAndTyping({
			channelId: channel.id,
			value,
			setValue,
			draft,
			previousValueRef,
			isAutocompleteAttached,
			enabled: !disabled,
		});

		const {handleArrowUp} = useTextareaKeyboard({
			channelId: channel.id,
			isFocused,
			textareaRef,
			value,
			setValue,
			handleTextChange,
			previousValueRef,
			clearSegments,
			replyingMessage,
			editingMessage: editingMessage || null,
			getLastEditableMessage: () => MessageStore.getLastEditableMessage(channel.id) || null,
			enabled: !disabled,
		});

		const placeholderText = disabled
			? t`You do not have permission to send messages in this channel.`
			: channel.guildId != null
				? PlaceholderUtils.getChannelPlaceholder(channel.name || t`channel`, t`Message #`, Number.MAX_SAFE_INTEGER)
				: PlaceholderUtils.getDMPlaceholder(
						ChannelUtils.getDMDisplayName(channel),
						channel.isDM() ? t`Message @` : t`Message `,
						Number.MAX_SAFE_INTEGER,
					);

		const handleTextareaCopy = React.useCallback(
			(event: React.ClipboardEvent<HTMLTextAreaElement>) => {
				const textareaNode = textareaRef.current;
				if (!textareaNode) {
					return;
				}

				const start = textareaNode.selectionStart ?? 0;
				const end = textareaNode.selectionEnd ?? 0;
				if (start === end) {
					return;
				}

				const displaySelection = value.slice(start, end);
				const emojiSegments = segmentManagerRef.current
					.getSegments()
					.filter((segment) => segment.type === 'emoji' && segment.start >= start && segment.end <= end)
					.sort((a, b) => b.start - a.start);
				if (emojiSegments.length === 0) {
					return;
				}

				let actualSelection = displaySelection;
				for (const segment of emojiSegments) {
					const relativeStart = segment.start - start;
					const relativeEnd = segment.end - start;
					actualSelection =
						actualSelection.slice(0, relativeStart) + segment.actualText + actualSelection.slice(relativeEnd);
				}

				if (displaySelection === actualSelection) {
					return;
				}

				event.preventDefault();
				event.clipboardData.setData('text/plain', actualSelection);
			},
			[segmentManagerRef, value],
		);

		React.useEffect(() => {
			const unsubscribe = ComponentDispatch.subscribe('FOCUS_TEXTAREA', (payload?: unknown) => {
				const {channelId, enterKeyboardMode} = (payload ?? {}) as {channelId?: string; enterKeyboardMode?: boolean};
				if (channelId && channelId !== channel.id) return;
				if (disabled) return;
				const textarea = textareaRef.current;
				if (textarea) {
					if (enterKeyboardMode) {
						KeyboardModeStore.enterKeyboardMode(true);
					} else {
						KeyboardModeStore.exitKeyboardMode();
					}
					safeFocus(textarea, true);
				}
			});
			return unsubscribe;
		}, [channel.id]);

		React.useEffect(() => {
			if (!canAttachFiles) return;
			const unsubscribe = ComponentDispatch.subscribe('TEXTAREA_UPLOAD_FILE', (payload?: unknown) => {
				const {channelId} = (payload ?? {}) as {channelId?: string};
				if (channelId && channelId !== channel.id) return;
				handleFileButtonClick();
			});
			return unsubscribe;
		}, [channel.id, canAttachFiles]);

		React.useLayoutEffect(() => {
			if (!containerRef.current) return;

			let lastWidth = -1;

			const checkButtonVisibility = () => {
				if (!containerRef.current) return;
				const containerWidthLocal = containerRef.current.offsetWidth;

				if (containerWidthLocal === lastWidth) return;
				lastWidth = containerWidthLocal;

				const shouldShowAll = containerWidthLocal > 500;
				setShowAllButtons(shouldShowAll);
				setContainerWidth(containerWidthLocal);
			};

			const resizeObserver = new ResizeObserver(checkButtonVisibility);
			resizeObserver.observe(containerRef.current);
			checkButtonVisibility();

			return () => {
				resizeObserver.disconnect();
			};
		}, [mobileLayout.enabled]);

		const handleCancelEdit = React.useCallback(() => {
			setValue('');
			clearSegments();
		}, [clearSegments]);

		const handleMessageInputButtonContextMenu = React.useCallback(
			(event: React.MouseEvent) => {
				event.preventDefault();
				event.stopPropagation();

				ContextMenuActionCreators.openFromEvent(event, () => (
					<MessageInputButtonsContextMenu canSchedule={canScheduleMessage} onSchedule={handleOpenScheduleModal} />
				));
			},
			[canScheduleMessage, handleOpenScheduleModal],
		);

		const hasStackedSections = Boolean(
			referencedMessage ||
				(editingMessage && mobileLayout.enabled) ||
				uploadAttachments.length > 0 ||
				hasPendingSticker,
		);

		const topBarContent =
			editingMessage && mobileLayout.enabled ? (
				<EditBar channel={channel} onCancel={handleCancelEdit} />
			) : (
				referencedMessage && (
					<ReplyBar
						replyingMessageObject={referencedMessage}
						shouldReplyMention={replyingMessage?.mentioning ?? false}
						setShouldReplyMention={(mentioning) => MessageActionCreators.setReplyMentioning(channel.id, mentioning)}
						channel={channel}
					/>
				)
			);

		const renderSection = (content: React.ReactNode) => <div className={wrapperStyles.stackSection}>{content}</div>;

		return (
			<>
				{topBarContent && renderSection(<div className={wrapperStyles.topBarContainer}>{topBarContent}</div>)}

				{hasMessageSchedulingAccess &&
					editingScheduledMessage &&
					renderSection(
						<ScheduledMessageEditBar
							scheduledLocalAt={editingScheduledMessage.scheduledLocalAt}
							timezone={editingScheduledMessage.timezone}
							onCancel={handleCancelScheduledEdit}
						/>,
					)}

				<FocusRing
					focusTarget={textareaRef}
					ringTarget={containerRef}
					offset={0}
					enabled={!disabled && AccessibilityStore.showTextareaFocusRing}
					ringClassName={styles.textareaFocusRing}
				>
					<div
						ref={containerRef}
						className={clsx(
							wrapperStyles.box,
							isVoiceInteractionActive && wrapperStyles.boxVoiceOverlayVisible,
							wrapperStyles.wrapperSides,
							styles.textareaOuter,
							hasStackedSections ? wrapperStyles.roundedBottom : wrapperStyles.roundedAll,
							wrapperStyles.bottomSpacing,
							disabled && wrapperStyles.disabled,
						)}
						style={{minHeight: 'var(--textarea-min-height, var(--input-container-min-height))'}}
					>
						{showAttachments && renderSection(<ChannelAttachmentArea channelId={channel.id} />)}
						{showStickers &&
							renderSection(<ChannelStickersArea channelId={channel.id} hasAttachments={hasAttachments} />)}

						{renderSection(
							<div className={clsx(styles.mainWrapperDense, disabled && wrapperStyles.disabled)}>
								{!disabled && showUploadButton && canAttachFiles && !isVoiceInteractionActive && (
									<div className={clsx(styles.uploadButtonColumn, styles.sideButtonPadding)}>
										<TextareaButton
											icon={PlusCircleIcon}
											label={t`Upload file`}
											onClick={handleFileButtonClick}
											onContextMenu={handleMessageInputButtonContextMenu}
											keybindAction="upload_file"
										/>
									</div>
								)}

								<div className={styles.contentAreaDense}>
									<Scroller ref={scrollerRef} fade={true} className={styles.scroller} key="channel-textarea-scroller">
										<div style={{display: 'flex', flexDirection: 'column'}}>
											<TextareaInputField
												channelId={channel.id}
												disabled={disabled}
												isMobile={mobileLayout.enabled}
												value={value}
												placeholder={placeholderText}
												textareaRef={textareaRef}
												isFocused={isFocused}
												isAutocompleteAttached={isAutocompleteAttached}
												autocompleteOptions={autocompleteOptions}
												selectedIndex={selectedIndex}
												segments={segmentManagerRef.current.getSegments()}
												onFocus={() => {
													setIsFocused(true);
													setIsInputAreaFocused(true);
													closeExpressionPickerForTyping();
												}}
												onPointerDown={() => {
													closeExpressionPickerForTyping();
												}}
												onBlur={() => {
													setIsFocused(false);
													setIsInputAreaFocused(false);
												}}
												onChange={(newValue) => {
													const cursorPosition = textareaRef.current?.selectionStart ?? newValue.length;
													handleTextChange(newValue, previousValueRef.current);
													const sanitizedResult = sanitizeTextareaDisplayValue(
														newValue,
														cursorPosition,
														segmentManagerRef.current,
													);
													setValue(sanitizedResult.value);
													previousValueRef.current = sanitizedResult.value;

													if (sanitizedResult.changed) {
														window.requestAnimationFrame(() => {
															const node = textareaRef.current;
															if (!node) {
																return;
															}

															node.setSelectionRange(sanitizedResult.cursorPosition, sanitizedResult.cursorPosition);
														});
													}
												}}
												onHeightChange={handleTextareaHeightChange}
												onCursorMove={onCursorMove}
												onArrowUp={handleArrowUp}
												onEnter={handleSubmit}
												onAutocompleteSelect={handleSelect}
												setSelectedIndex={setSelectedIndex}
												onKeyDown={handleTextareaKeyDown}
												onCopy={handleTextareaCopy}
												voiceInteractionActive={isVoiceInteractionActive}
												voiceInputLevel={voiceInputLevel}
												voiceSpectrum={voiceInputSpectrum}
												voiceElapsedMs={voiceRecordingElapsedMs}
											/>
										</div>
									</Scroller>
								</div>

								<TextareaButtons
									disabled={disabled}
									showAllButtons={showAllButtons}
									showUploadButton={showUploadButton}
									showGiftButton={showGiftButton}
									showGifButton={showGifButton}
									showMemesButton={showMemesButton}
									showStickersButton={showStickersButton}
									showEmojiButton={showEmojiButton}
									showMessageSendButton={showMessageSendButton}
									showVoiceMessageButton={canSendVoiceMessages}
									expressionPickerOpen={expressionPickerOpen}
									selectedTab={selectedTab}
									isMobile={mobileLayout.enabled}
									shouldShowMobileGiftButton={shouldShowMobileGiftButton}
									isComposing={isComposing}
									isSlowmodeActive={isSlowmodeActive}
									isOverLimit={isOverCharacterLimit}
									hasContent={!!value.trim()}
									hasAttachments={uploadAttachments.length > 0}
									expressionPickerTriggerRef={expressionPickerTriggerRef}
									invisibleExpressionPickerTriggerRef={invisibleExpressionPickerTriggerRef}
									onExpressionPickerToggle={handleExpressionPickerTabToggle}
									onSubmit={handleSubmit}
									disableSendButton={isEditingScheduledMessage}
									onVoiceRecordStart={handleVoiceRecordStart}
									onVoiceRecordStop={handleVoiceRecordStop}
									onVoiceRecordCancel={handleVoiceRecordCancel}
									voiceInputLevel={voiceInputLevel}
									onVoiceInteractionChange={setIsVoiceInteractionActive}
									onContextMenu={handleMessageInputButtonContextMenu}
								/>
								{isScheduleModalOpen && hasMessageSchedulingAccess && (
									<ScheduleMessageModal
										onClose={() => setIsScheduleModalOpen(false)}
										onSubmit={handleScheduleSubmit}
										initialScheduledLocalAt={editingScheduledMessage?.scheduledLocalAt}
										initialTimezone={editingScheduledMessage?.timezone}
										title={isEditingScheduledMessage ? t`Reschedule Message` : undefined}
										submitLabel={isEditingScheduledMessage ? t`Update` : undefined}
										helpText={
											isEditingScheduledMessage
												? t`This will modify the existing scheduled message rather than sending immediately.`
												: undefined
										}
									/>
								)}
							</div>,
						)}

						<MessageCharacterCounter
							currentLength={value.length}
							maxLength={maxMessageLength}
							isPremium={currentUser?.isPremium() ?? false}
						/>

						{isAutocompleteAttached && containerRef.current && (
							<Autocomplete
								type={autocompleteType}
								onSelect={handleSelect}
								selectedIndex={selectedIndex}
								options={autocompleteOptions}
								setSelectedIndex={setSelectedIndex}
								referenceElement={containerRef.current}
								query={autocompleteQuery}
								attached={true}
							/>
						)}
					</div>
				</FocusRing>

				{mobileLayout.enabled && (
					<ExpressionPickerSheet
						isOpen={expressionPickerOpen}
						onClose={handleExpressionPickerSheetClose}
						channelId={channel.id}
						onEmojiSelect={handleEmojiSelect}
						closeOnEmojiSelect={false}
						initialSnap={1 / 2}
						snapPoints={[0, 1 / 2, 1]}
					/>
				)}
			</>
		);
	},
);

export const ChannelTextarea = observer(({channel}: {channel: ChannelRecord}) => {
	const draft = DraftStore.getDraft(channel.id);
	const forceNoSendMessages = DeveloperOptionsStore.forceNoSendMessages;
	const forceNoAttachFiles = DeveloperOptionsStore.forceNoAttachFiles;

	const disabled = channel.isPrivate()
		? forceNoSendMessages
		: forceNoSendMessages || !PermissionStore.can(Permissions.SEND_MESSAGES, channel);
	const canAttachFiles = channel.isPrivate()
		? !forceNoAttachFiles
		: !forceNoAttachFiles && PermissionStore.can(Permissions.ATTACH_FILES, channel);
	const canSendVoiceMessages = channel.isPrivate()
		? !forceNoAttachFiles
		: !forceNoAttachFiles &&
			PermissionStore.can(Permissions.SEND_MESSAGES, channel) &&
			PermissionStore.can(Permissions.ATTACH_FILES, channel) &&
			PermissionStore.can(Permissions.SEND_VOICE_MESSAGES, channel);

	return (
		<ChannelTextareaContent
			key={channel.id}
			channel={channel}
			disabled={disabled}
			canAttachFiles={canAttachFiles}
			canSendVoiceMessages={canSendVoiceMessages}
			draft={draft}
		/>
	);
});
