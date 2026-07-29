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
import * as ChannelPinActionCreators from '~/actions/ChannelPinsActionCreators';
import * as MessageActionCreators from '~/actions/MessageActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as ReactionActionCreators from '~/actions/ReactionActionCreators';
import * as ReadStateActionCreators from '~/actions/ReadStateActionCreators';
import * as SavedMessageActionCreators from '~/actions/SavedMessageActionCreators';
import * as TextCopyActionCreators from '~/actions/TextCopyActionCreators';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import {GuildOperations, isMessageTypeDeletable, MessageFlags, MessageStates, Permissions} from '~/Constants';
import {ConfirmModal} from '~/components/modals/ConfirmModal';
import {ForwardModal} from '~/components/modals/ForwardModal';
import {CloudUpload} from '~/lib/CloudUpload';
import {ComponentDispatch} from '~/lib/ComponentDispatch';
import type {MessageRecord} from '~/records/MessageRecord';
import AuthenticationStore from '~/stores/AuthenticationStore';
import ChannelStore from '~/stores/ChannelStore';
import GuildMemberStore from '~/stores/GuildMemberStore';
import GuildStore from '~/stores/GuildStore';
import GuildVerificationStore from '~/stores/GuildVerificationStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import PermissionStore from '~/stores/PermissionStore';
import RelationshipStore from '~/stores/RelationshipStore';
import {buildMessageJumpLink} from '~/utils/messageLinkUtils';
import {type ReactionEmoji, toReactionEmoji, type UnicodeEmoji} from '~/utils/ReactionUtils';
import * as SnowflakeUtils from '~/utils/SnowflakeUtils';
import {isStoryForwardPayload} from '~/utils/StoryForwardPayload';

export function isEmbedsSuppressed(message: MessageRecord): boolean {
	return (message.flags & MessageFlags.SUPPRESS_EMBEDS) !== 0;
}

export function canDeleteAttachmentUtil(message: MessageRecord | undefined): boolean {
	if (!message?.isCurrentUserAuthor()) return false;
	const channel = ChannelStore.getChannel(message.channelId);
	const guild = channel?.guildId ? GuildStore.getGuild(channel.guildId) : null;
	const sendMessageDisabled = guild ? (guild.disabledOperations & GuildOperations.SEND_MESSAGE) !== 0 : false;
	return !sendMessageDisabled;
}

export function triggerAddReaction(messageId: string): boolean {
	const messageElement = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
	if (messageElement?.dataset.messageSystem === 'true') {
		return false;
	}

	if (messageElement?.dataset.messageReactionTypeLimit === 'true') {
		return false;
	}

	if (!messageElement) {
		ComponentDispatch.dispatch('EMOJI_PICKER_OPEN', {messageId});
		return false;
	}

	const addReactionButton = messageElement.querySelector<HTMLButtonElement>(
		'[data-action="message-add-reaction-button"]',
	);
	if (!addReactionButton) {
		ComponentDispatch.dispatch('EMOJI_PICKER_OPEN', {messageId});
		return false;
	}

	addReactionButton.click();
	return true;
}

export function useMessagePermissions(message: MessageRecord) {
	// IMPORTANT: don't use a `!` non-null assertion here. ChannelStore can
	// legitimately return undefined — the channel might not be loaded yet
	// (e.g. first paint, gateway reconnect), it may have just been deleted,
	// or the user may have been kicked from the guild. When that happens we
	// must NOT crash with "Cannot read properties of undefined (reading
	// 'guildId')" — we just return a locked-down permission set so the
	// message renders as read-only until the channel arrives.
	const channel = ChannelStore.getChannel(message.channelId);
	if (!channel) {
		return {
			channel: null,
			isDM: false,
			canSendMessages: false,
			canAddReactions: false,
			canEditMessage: false,
			canDeleteMessage: false,
			canDeleteAttachment: false,
			canPinMessage: false,
			canSuppressEmbeds: false,
			shouldRenderSuppressEmbeds: false,
		};
	}

	const isDM = !channel.guildId;
	const isAuthorBlocked = RelationshipStore.isBlocked(message.author.id);
	const isSystemMessage = message.isSystemMessage();

	const passesVerification = isDM || GuildVerificationStore.canAccessGuild(channel.guildId || '');

	const guild = channel.guildId ? GuildStore.getGuild(channel.guildId) : null;
	const sendMessageDisabled = guild ? (guild.disabledOperations & GuildOperations.SEND_MESSAGE) !== 0 : false;
	const reactionsDisabled = guild ? (guild.disabledOperations & GuildOperations.REACTIONS) !== 0 : false;
	const messageTypeDeletable = isMessageTypeDeletable(message.type);
	const currentUserId = AuthenticationStore.currentUserId;
	const isCurrentUserTimedOut =
		guild && currentUserId ? GuildMemberStore.isUserTimedOut(guild.id, currentUserId) : false;

	const canSendMessages =
		isDM ||
		(!sendMessageDisabled &&
			PermissionStore.can(Permissions.SEND_MESSAGES, {channelId: message.channelId}) &&
			passesVerification);
	const canAddReactions =
		!isSystemMessage &&
		!isAuthorBlocked &&
		(isDM ||
			(!reactionsDisabled &&
				PermissionStore.can(Permissions.ADD_REACTIONS, {channelId: message.channelId}) &&
				passesVerification &&
				!isCurrentUserTimedOut));

	const canEditMessage = !sendMessageDisabled && message.isCurrentUserAuthor();

	const canDeleteMessage =
		messageTypeDeletable &&
		!sendMessageDisabled &&
		(message.isCurrentUserAuthor() ||
			(isDM ? false : PermissionStore.can(Permissions.MANAGE_MESSAGES, {channelId: message.channelId})));

	const canDeleteAttachment = !sendMessageDisabled && message.isCurrentUserAuthor();

	const canPinMessage =
		!sendMessageDisabled &&
		(isDM ? true : PermissionStore.can(Permissions.PIN_MESSAGES, {channelId: message.channelId}));
	const canSuppressEmbeds =
		!sendMessageDisabled && message.isUserMessage() && (message.isCurrentUserAuthor() || (!isDM && canDeleteMessage));

	const shouldRenderSuppressEmbeds =
		message.isUserMessage() && canSuppressEmbeds && (isEmbedsSuppressed(message) || message.embeds.length > 0);

	return {
		channel,
		isDM,
		canSendMessages,
		canAddReactions,
		canEditMessage,
		canDeleteMessage,
		canDeleteAttachment,
		canPinMessage,
		canSuppressEmbeds,
		shouldRenderSuppressEmbeds,
	};
}

/*
 * Renamed from `createMessageActionHandlers` so the `use*` prefix
 * matches the React hooks rule — the body calls `useLingui()`, so it
 * is itself a hook and lint correctly flagged the prior name as a
 * "Hook called inside non-hook" violation. A re-exported alias keeps
 * existing call sites compiling while we migrate them.
 */
export function useMessageActionHandlers(message: MessageRecord, options?: {onClose?: () => void}) {
	const {t, i18n} = useLingui();
	const onClose = options?.onClose;

	const handleEmojiSelect = (emoji: UnicodeEmoji | ReactionEmoji) => {
		ReactionActionCreators.addReaction(i18n, message.channelId, message.id, toReactionEmoji(emoji));
	};

	const handleCopyMessageId = () => {
		TextCopyActionCreators.copy(i18n, message.id);
		onClose?.();
	};

	const handleCopyMessage = () => {
		if (message.content && !isStoryForwardPayload(message.content)) {
			TextCopyActionCreators.copy(i18n, message.content);
			onClose?.();
		}
	};

	const handleCopyMessageAsQuote = () => {
		const channel = ChannelStore.getChannel(message.channelId)!;
		const jumpLink = buildMessageJumpLink({
			guildId: channel.guildId,
			channelId: message.channelId,
			messageId: message.id,
		});
		const messageContent = isStoryForwardPayload(message.content) ? '' : message.content.trim();
		if (messageContent.length === 0) {
			TextCopyActionCreators.copy(i18n, jumpLink);
			onClose?.();
			return;
		}
		const quotedContent = messageContent
			.split('\n')
			.map((line) => `> ${line}`)
			.join('\n');
		TextCopyActionCreators.copy(i18n, `${quotedContent}\n\n${jumpLink}`);
		onClose?.();
	};

	const handleCopyMessageLink = () => {
		const channel = ChannelStore.getChannel(message.channelId)!;
		const jumpLink = buildMessageJumpLink({
			guildId: channel.guildId,
			channelId: message.channelId,
			messageId: message.id,
		});
		TextCopyActionCreators.copy(i18n, jumpLink);
		onClose?.();
	};

	const handleShareMessage = async () => {
		const channel = ChannelStore.getChannel(message.channelId)!;
		const jumpLink = buildMessageJumpLink({
			guildId: channel.guildId,
			channelId: message.channelId,
			messageId: message.id,
		});
		onClose?.();
		if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
			try {
				await navigator.share({
					title: 'Astral message',
					text: message.content && !isStoryForwardPayload(message.content) ? message.content.slice(0, 280) : undefined,
					url: jumpLink,
				});
				return;
			} catch (error) {
				if ((error as {name?: string})?.name === 'AbortError') return;
			}
		}
		TextCopyActionCreators.copy(i18n, jumpLink);
	};

	const handleSaveMessage = (isSaved: boolean) => (event?: React.MouseEvent | React.KeyboardEvent) => {
		if (isSaved) {
			SavedMessageActionCreators.remove(i18n, message.id);
		} else {
			SavedMessageActionCreators.create(i18n, message.channelId, message.id).then(() => {
				if (!event?.shiftKey) {
					ComponentDispatch.dispatch('SAVED_MESSAGES_OPEN');
				}
			});
		}
		onClose?.();
	};

	const handleToggleSuppressEmbeds = () => {
		if (isEmbedsSuppressed(message)) {
			MessageActionCreators.edit(
				message.channelId,
				message.id,
				undefined,
				message.flags & ~MessageFlags.SUPPRESS_EMBEDS,
			).then(() => {
				ToastActionCreators.createToast({
					type: 'success',
					children: t`Embeds unsuppressed`,
				});
			});
		} else {
			MessageActionCreators.edit(
				message.channelId,
				message.id,
				undefined,
				message.flags | MessageFlags.SUPPRESS_EMBEDS,
			).then(() => {
				ToastActionCreators.createToast({
					type: 'success',
					children: t`Embeds suppressed`,
				});
			});
		}
		onClose?.();
	};

	const handleReply = (event?: React.MouseEvent | React.KeyboardEvent) => {
		const channel = ChannelStore.getChannel(message.channelId)!;
		MessageActionCreators.startReply(
			message.channelId,
			message.id,
			!event?.shiftKey && !message.isCurrentUserAuthor() && channel.guildId != null,
		);
		onClose?.();
	};

	const handlePinMessage = (event?: React.MouseEvent | React.KeyboardEvent) => {
		const isPinned = message.pinned;
		onClose?.();

		if (isPinned) {
			if (event?.shiftKey) {
				ChannelPinActionCreators.unpin(message.channelId, message.id);
			} else {
				ModalActionCreators.push(
					modal(() => (
						<ConfirmModal
							title={t`Unpin Message`}
							description={t`Do you want to send this pin back to the future?`}
							message={message}
							primaryText={t`Unpin it`}
							onPrimary={() => ChannelPinActionCreators.unpin(message.channelId, message.id)}
						/>
					)),
				);
			}
		} else if (event?.shiftKey) {
			ChannelPinActionCreators.pin(message.channelId, message.id);
		} else {
			ModalActionCreators.push(
				modal(() => (
					<ConfirmModal
						title={t`Pin it. Pin it good.`}
						description={t`Pin this message to the channel for all to see. Unless ... you're chicken.`}
						message={message}
						primaryText={t`Pin it real good`}
						primaryVariant="primary"
						onPrimary={() => ChannelPinActionCreators.pin(message.channelId, message.id)}
					/>
				)),
			);
		}
	};

	const handleEditMessage = () => {
		if (message.messageSnapshots) {
			return;
		}
		const isMobile = MobileLayoutStore.enabled;
		if (isMobile) {
			MessageActionCreators.startEditMobile(message.channelId, message.id);
		} else {
			MessageActionCreators.startEdit(message.channelId, message.id, message.content);
		}
		onClose?.();
	};

	const handleRetryMessage = () => {
		if (!message.nonce) {
			return;
		}

		const messageUpload = CloudUpload.getMessageUpload(message.nonce);
		const hasAttachments = messageUpload !== null;
		const newNonce = SnowflakeUtils.nextClientNonce();

		if (hasAttachments) {
			CloudUpload.moveMessageUpload(message.nonce, newNonce);
		}

		MessageActionCreators.deleteLocal(message.channelId, message.id);

		const optimistic = {
			...message.toJSON(),
			id: newNonce,
			nonce: newNonce,
			state: MessageStates.SENDING,
		};
		MessageActionCreators.createOptimistic(message.channelId, optimistic);

		MessageActionCreators.send(message.channelId, {
			content: message.content,
			nonce: newNonce,
			hasAttachments,
			allowedMentions: message._allowedMentions,
			messageReference: message.messageReference,
			flags: message.flags,
			favoriteMemeId: message._favoriteMemeId,
			stickers: [...(message.stickers ?? [])],
		});
		onClose?.();
	};

	const handleFailedMessageDelete = () => {
		MessageActionCreators.deleteLocal(message.channelId, message.id);
		onClose?.();
	};

	const handleForward = () => {
		onClose?.();
		ModalActionCreators.push(modal(() => <ForwardModal message={message} />));
	};

	const handleRemoveAllReactions = () => {
		ReactionActionCreators.removeAllReactions(i18n, message.channelId, message.id);
		onClose?.();
	};

	const handleMarkAsUnread = () => {
		ReadStateActionCreators.markAsUnread(message.channelId, message.id);
		onClose?.();
	};

	return {
		handleEmojiSelect,
		handleCopyMessageId,
		handleCopyMessage,
		handleCopyMessageAsQuote,
		handleCopyMessageLink,
		handleShareMessage,
		handleSaveMessage,
		handleToggleSuppressEmbeds,
		handleReply,
		handlePinMessage,
		handleEditMessage,
		handleRetryMessage,
		handleFailedMessageDelete,
		handleForward,
		handleRemoveAllReactions,
		handleMarkAsUnread,
	};
}

/*
 * Backwards-compatible alias for the old non-hook-prefixed name. All
 * call sites already invoke this from inside React components, so the
 * hook rule still holds — only the lint warning was about the name.
 */
export const createMessageActionHandlers = useMessageActionHandlers;
