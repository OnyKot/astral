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
import {HashIcon, MagnifyingGlassIcon, NotePencilIcon, SmileyIcon, SpeakerHighIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as MessageActionCreators from '~/actions/MessageActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import {ChannelTypes, isGuildRtcChannelType} from '~/Constants';
import {MessageForwardFailedModal} from '~/components/alerts/MessageForwardFailedModal';
import {Autocomplete} from '~/components/channel/Autocomplete';
import {MessageCharacterCounter} from '~/components/channel/MessageCharacterCounter';
import {GroupDMAvatar} from '~/components/common/GroupDMAvatar';
import {Input} from '~/components/form/Input';
import {ExpressionPickerSheet} from '~/components/modals/ExpressionPickerSheet';
import * as Modal from '~/components/modals/Modal';
import {
	getForwardChannelCategoryName,
	getForwardChannelDisplayName,
	getForwardChannelGuildName,
	useForwardChannelSelection,
} from '~/components/modals/shared/forwardChannelSelection';
import selectorStyles from '~/components/modals/shared/SelectorModalStyles.module.css';
import {ExpressionPickerPopout} from '~/components/popouts/ExpressionPickerPopout';
import {Button} from '~/components/uikit/Button/Button';
import {Checkbox} from '~/components/uikit/Checkbox/Checkbox';
import {Popout} from '~/components/uikit/Popout/Popout';
import {Scroller} from '~/components/uikit/Scroller';
import {useTextareaAutocomplete} from '~/hooks/useTextareaAutocomplete';
import {useTextareaEmojiPicker} from '~/hooks/useTextareaEmojiPicker';
import {useTextareaPaste} from '~/hooks/useTextareaPaste';
import {useTextareaSegments} from '~/hooks/useTextareaSegments';
import {TextareaAutosize} from '~/lib/TextareaAutosize';
import {Routes} from '~/Routes';
import type {MessageRecord} from '~/records/MessageRecord';
import ChannelStore from '~/stores/ChannelStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import UserStore from '~/stores/UserStore';
import * as RouterUtils from '~/utils/RouterUtils';
import {FocusRing} from '../uikit/FocusRing';
import {StatusAwareAvatar} from '../uikit/StatusAwareAvatar';
import modalStyles from './ForwardModal.module.css';
const modalStylesRecord = modalStyles as Record<string, string>;

interface ForwardModalProps {
	message?: MessageRecord;
	messages?: Array<MessageRecord>;
	onForwarded?: () => void;
}

export const ForwardModal = observer(({message, messages, onForwarded}: ForwardModalProps) => {
	const {t} = useLingui();
	const messagesToForward = React.useMemo(() => {
		if (messages?.length) return messages;
		return message ? [message] : [];
	}, [message, messages]);
	const firstMessage = messagesToForward[0];
	const {filteredChannels, handleToggleChannel, isChannelDisabled, searchQuery, selectedChannelIds, setSearchQuery} =
		useForwardChannelSelection({excludedChannelId: firstMessage?.channelId});
	const [optionalMessage, setOptionalMessage] = React.useState('');
	const [isForwarding, setIsForwarding] = React.useState(false);
	const [expressionPickerOpen, setExpressionPickerOpen] = React.useState(false);
	const textareaRef = React.useRef<HTMLTextAreaElement>(null);
	const containerRef = React.useRef<HTMLDivElement>(null);
	const currentUser = UserStore.currentUser!;
	const mobileLayout = MobileLayoutStore;
	const isMobileForwarding = mobileLayout.enabled && isForwarding;

	const {
		segmentManagerRef,
		previousValueRef,
		displayToActual,
		replaceWithSegment,
		handleTextChange,
	} = useTextareaSegments();
	const {handleEmojiSelect} = useTextareaEmojiPicker({
		setValue: setOptionalMessage,
		textareaRef,
		replaceWithSegment,
		previousValueRef,
	});

	const channel = firstMessage ? ChannelStore.getChannel(firstMessage.channelId) : null;
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
		channel: channel!,
		value: optionalMessage,
		setValue: setOptionalMessage,
		textareaRef,
		segmentManagerRef,
		previousValueRef,
	});

	useTextareaPaste({
		channel: channel!,
		textareaRef,
		segmentManagerRef,
		setValue: setOptionalMessage,
		previousValueRef,
	});

	const handleForward = async () => {
		if (selectedChannelIds.size === 0 || isForwarding || !channel || messagesToForward.length === 0) return;

		setIsForwarding(true);
		try {
			const actualMessage = optionalMessage.trim() ? displayToActual(optionalMessage) : undefined;
			const references = messagesToForward.map((selectedMessage) => ({
				message_id: selectedMessage.id,
				channel_id: selectedMessage.channelId,
				guild_id: selectedMessage.guildId ?? ChannelStore.getChannel(selectedMessage.channelId)?.guildId,
			}));

			if (references.length === 1) {
				await MessageActionCreators.forward(Array.from(selectedChannelIds), references[0], actualMessage);
			} else {
				await MessageActionCreators.forwardMany(Array.from(selectedChannelIds), references, actualMessage);
			}
			ToastActionCreators.createToast({
				type: 'success',
				children: references.length === 1 ? <Trans>Message forwarded</Trans> : <Trans>Messages forwarded</Trans>,
			});
			onForwarded?.();
			ModalActionCreators.pop();

			if (selectedChannelIds.size === 1) {
				const forwardedChannelId = Array.from(selectedChannelIds)[0];
				const forwardedChannel = ChannelStore.getChannel(forwardedChannelId);
				if (forwardedChannel) {
					if (forwardedChannel.guildId) {
						RouterUtils.transitionTo(Routes.guildChannel(forwardedChannel.guildId, forwardedChannelId));
					} else {
						RouterUtils.transitionTo(Routes.dmChannel(forwardedChannelId));
					}
				}
			}
		} catch (error) {
			console.error('Failed to forward message:', error);
			ModalActionCreators.push(modal(() => <MessageForwardFailedModal />));
		} finally {
			setIsForwarding(false);
		}
	};

	const getChannelIcon = (ch: any) => {
		const iconSize = 32;

		if (ch.type === ChannelTypes.DM_PERSONAL_NOTES) {
			return <NotePencilIcon className={selectorStyles.itemIcon} weight="fill" size={iconSize} />;
		}
		if (ch.type === ChannelTypes.DM) {
			const recipientId = ch.recipientIds[0];
			const user = UserStore.getUser(recipientId);
			if (!user) return null;
			return (
				<div className={selectorStyles.avatar}>
					<StatusAwareAvatar user={user} size={iconSize} />
				</div>
			);
		}
		if (ch.type === ChannelTypes.GROUP_DM) {
			return (
				<div className={selectorStyles.avatar}>
					<GroupDMAvatar channel={ch} size={iconSize} />
				</div>
			);
		}
		if (isGuildRtcChannelType(ch.type)) {
			return <SpeakerHighIcon className={selectorStyles.itemIcon} weight="fill" size={iconSize} />;
		}
		return <HashIcon className={selectorStyles.itemIcon} weight="bold" size={iconSize} />;
	};

	return (
		<Modal.Root size="small" centered className={clsx(isMobileForwarding && modalStylesRecord.mobileForwardingRoot)}>
			<Modal.Header title={messagesToForward.length === 1 ? t`Forward Message` : t`Forward Messages`}>
				<div className={selectorStyles.headerSearch}>
					<Input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder={t`Search channels or DMs`}
						maxLength={100}
						leftIcon={<MagnifyingGlassIcon className={selectorStyles.searchIcon} weight="bold" />}
						className={selectorStyles.headerSearchInput}
					/>
				</div>
			</Modal.Header>
			<Modal.Content className={selectorStyles.selectorContent}>
				<div className={selectorStyles.listContainer}>
					<Scroller
						className={selectorStyles.scroller}
						key="forward-modal-channel-list-scroller"
						fade={false}
						reserveScrollbarTrack={false}
					>
						{filteredChannels.length === 0 ? (
							<div className={selectorStyles.emptyState}>
								<Trans>No channels found</Trans>
							</div>
						) : (
							<div className={selectorStyles.itemList}>
								{filteredChannels.map((ch) => {
									if (!ch) return null;
									const isSelected = selectedChannelIds.has(ch.id);
									const isDisabled = isChannelDisabled(ch.id);
									const displayName = getForwardChannelDisplayName(ch);
									const categoryName = getForwardChannelCategoryName(ch);
									const guildName = getForwardChannelGuildName(ch);

									return (
										<FocusRing key={ch.id} offset={-2} enabled={!isDisabled}>
											<button
												type="button"
												onClick={() => !isDisabled && handleToggleChannel(ch.id)}
												disabled={isDisabled}
												className={clsx(
													selectorStyles.itemButton,
													isSelected && selectorStyles.itemButtonSelected,
													isSelected && isMobileForwarding && modalStylesRecord.forwardingSelectedChannel,
													isDisabled && selectorStyles.itemButtonDisabled,
												)}
											>
												<div className={selectorStyles.itemContent}>
													{getChannelIcon(ch)}
													<div className={selectorStyles.itemInfo}>
														<span className={selectorStyles.itemName}>{displayName}</span>
														{ch.type === ChannelTypes.GUILD_TEXT ? (
															<span className={selectorStyles.itemSecondary}>
																{categoryName ? categoryName : t`No Category`}
																{guildName && ` • ${guildName}`}
															</span>
														) : (
															guildName && <span className={selectorStyles.itemSecondary}>{guildName}</span>
														)}
													</div>
												</div>
												<div className={selectorStyles.itemAction}>
													<Checkbox checked={isSelected} disabled={isDisabled} aria-hidden={true} />
												</div>
											</button>
										</FocusRing>
									);
								})}
							</div>
						)}
					</Scroller>
				</div>
			</Modal.Content>
			<div className={clsx(modalStyles.inputAreaContainer, isMobileForwarding && modalStylesRecord.inputAreaForwarding)}>
				{isAutocompleteAttached && containerRef.current && (
					<Autocomplete
						type={autocompleteType}
						onSelect={handleSelect}
						selectedIndex={selectedIndex}
						options={autocompleteOptions}
						setSelectedIndex={setSelectedIndex}
						referenceElement={containerRef.current}
						zIndex={20000}
						query={autocompleteQuery}
						attached
					/>
				)}

				<div ref={containerRef} className={modalStyles.messageInputContainer}>
					<TextareaAutosize
						className={clsx(modalStyles.messageInput, modalStyles.messageInputBase)}
						maxLength={currentUser.maxMessageLength}
						ref={textareaRef}
						value={optionalMessage}
						onChange={(e) => {
							const newValue = e.target.value;
							handleTextChange(newValue, previousValueRef.current);
							setOptionalMessage(newValue);
						}}
						onKeyDown={(e) => {
							onCursorMove();
							if (isAutocompleteAttached) {
								if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
									e.preventDefault();
									setSelectedIndex((prevIndex) => {
										const newIndex = e.key === 'ArrowUp' ? prevIndex - 1 : prevIndex + 1;
										return (newIndex + autocompleteOptions.length) % autocompleteOptions.length;
									});
								} else if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
									e.preventDefault();
									const selectedOption = autocompleteOptions[selectedIndex];
									if (selectedOption) {
										handleSelect(selectedOption);
									}
								}
							}
						}}
						placeholder={t`Add a comment (optional)`}
					/>
					<MessageCharacterCounter
						currentLength={optionalMessage.length}
						maxLength={currentUser.maxMessageLength}
						isPremium={currentUser.isPremium()}
					/>
					<div className={modalStyles.messageInputActions}>
						{mobileLayout.enabled ? (
							<FocusRing offset={-2}>
								<button
									type="button"
									onClick={() => setExpressionPickerOpen(true)}
									className={clsx(
										modalStyles.emojiPickerButton,
										expressionPickerOpen && modalStyles.emojiPickerButtonActive,
									)}
								>
									<SmileyIcon className={modalStyles.emojiIcon} weight="fill" />
								</button>
							</FocusRing>
						) : (
							<Popout
								position="top-end"
								animationType="none"
								offsetMainAxis={8}
								offsetCrossAxis={0}
								onOpen={() => setExpressionPickerOpen(true)}
								onClose={() => setExpressionPickerOpen(false)}
								returnFocusRef={textareaRef}
								render={({onClose}) => (
									<ExpressionPickerPopout
										channelId={firstMessage!.channelId}
										onEmojiSelect={(emoji) => {
											handleEmojiSelect(emoji);
											onClose();
										}}
										onClose={onClose}
										visibleTabs={['emojis']}
									/>
								)}
							>
								<FocusRing offset={-2}>
									<button
										type="button"
										className={clsx(
											modalStyles.emojiPickerButton,
											expressionPickerOpen && modalStyles.emojiPickerButtonActive,
										)}
									>
										<SmileyIcon className={modalStyles.emojiIcon} weight="fill" />
									</button>
								</FocusRing>
							</Popout>
						)}
					</div>
				</div>
			</div>
			<Modal.Footer>
				<div className={selectorStyles.actionRow}>
					<Button variant="secondary" onClick={() => ModalActionCreators.pop()} className={selectorStyles.actionButton}>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						onClick={handleForward}
						disabled={selectedChannelIds.size === 0 || isForwarding}
						className={clsx(
							selectorStyles.actionButton,
							isMobileForwarding && modalStylesRecord.forwardSubmitButtonBusy,
						)}
					>
						<Trans>Send ({selectedChannelIds.size}/5)</Trans>
					</Button>
				</div>
			</Modal.Footer>
			{mobileLayout.enabled && (
				<ExpressionPickerSheet
					isOpen={expressionPickerOpen}
					onClose={() => setExpressionPickerOpen(false)}
					channelId={firstMessage!.channelId}
					onEmojiSelect={handleEmojiSelect}
					visibleTabs={['emojis']}
					selectedTab="emojis"
					zIndex={30000}
				/>
			)}
		</Modal.Root>
	);
});
