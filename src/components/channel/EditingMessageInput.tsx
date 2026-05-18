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
import {SmileyIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as PopoutActionCreators from '~/actions/PopoutActionCreators';
import {Autocomplete} from '~/components/channel/Autocomplete';
import {MessageCharacterCounter} from '~/components/channel/MessageCharacterCounter';
import {TextareaButton} from '~/components/channel/textarea/TextareaButton';
import {TextareaInputField} from '~/components/channel/textarea/TextareaInputField';
import {ExpressionPickerSheet} from '~/components/modals/ExpressionPickerSheet';
import {ExpressionPickerPopout} from '~/components/popouts/ExpressionPickerPopout';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {openPopout} from '~/components/uikit/Popout/Popout';
import {Scroller, type ScrollerHandle} from '~/components/uikit/Scroller';
import {useMarkdownKeybinds} from '~/hooks/useMarkdownKeybinds';
import {useTextareaAutocomplete} from '~/hooks/useTextareaAutocomplete';
import {useTextareaEmojiPicker} from '~/hooks/useTextareaEmojiPicker';
import {useTextareaPaste} from '~/hooks/useTextareaPaste';
import {useTextareaSegments} from '~/hooks/useTextareaSegments';
import type {ChannelRecord} from '~/records/ChannelRecord';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import UserStore from '~/stores/UserStore';
import {applyMarkdownSegments} from '~/utils/MarkdownToSegmentUtils';
import {sanitizeTextareaDisplayValue} from '~/utils/TextareaEmojiDisplayUtils';
import {deleteEmojiAtCaret} from '~/utils/TextareaEmojiEditingUtils';
import editingStyles from './EditingMessageInput.module.css';
import styles from './textarea/TextareaInput.module.css';

export const EditingMessageInput = observer(
	({
		channel,
		onCancel,
		onSubmit,
		textareaRef,
		value,
		setValue,
	}: {
		channel: ChannelRecord;
		onCancel: () => void;
		onSubmit: (actualContent?: string) => void;
		textareaRef: React.RefObject<HTMLTextAreaElement | null>;
		value: string;
		setValue: React.Dispatch<React.SetStateAction<string>>;
	}) => {
		const currentUser = UserStore.getCurrentUser()!;
		const maxMessageLength = currentUser.maxMessageLength;
		const [expressionPickerOpen, setExpressionPickerOpen] = React.useState(false);
		const hasInitializedRef = React.useRef(false);
		const containerRef = React.useRef<HTMLDivElement>(null);
		const scrollerRef = React.useRef<ScrollerHandle>(null);
		const mobileLayout = MobileLayoutStore;
		const expressionPickerTriggerRef = React.useRef<HTMLButtonElement>(null);
		const [isFocused, setIsFocused] = React.useState(false);
		useMarkdownKeybinds(isFocused);
		const [textareaHeight, setTextareaHeight] = React.useState(0);
		const hasScrolledInitiallyRef = React.useRef(false);
		const shouldStickToBottomRef = React.useRef(true);

		const handleScroll = React.useCallback(() => {
			const distance = scrollerRef.current?.getDistanceFromBottom?.();
			if (distance == null) return;
			shouldStickToBottomRef.current = distance <= 8;
		}, []);
		const {
			segmentManagerRef,
			previousValueRef,
			displayToActual,
			insertSegment,
			handleTextChange,
		} = useTextareaSegments();
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

				if (event.key === 'Escape') {
					event.preventDefault();
					event.stopPropagation();
					onCancel();
				}
			},
			[onCancel, previousValueRef, segmentManagerRef, setValue, textareaRef, value],
		);
		const {handleEmojiSelect} = useTextareaEmojiPicker({
			setValue,
			textareaRef,
			insertSegment,
			previousValueRef,
			allowUnicodeEmojiSelection: true,
		});

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
			allowedTriggers: ['emoji'],
		});

		useTextareaPaste({
			channel,
			textareaRef,
			segmentManagerRef,
			setValue,
			previousValueRef,
		});

		React.useLayoutEffect(() => {
			if (!hasInitializedRef.current && value) {
				hasInitializedRef.current = true;

				const displayText = applyMarkdownSegments(value, channel.guildId, segmentManagerRef.current);

				setValue(displayText);
				previousValueRef.current = displayText;

				requestAnimationFrame(() => {
					if (textareaRef.current) {
						const length = displayText.length;
						textareaRef.current.setSelectionRange(length, length);
					}
				});
			}
		}, [value, channel.guildId, setValue, segmentManagerRef, previousValueRef]);

		React.useLayoutEffect(() => {
			if (hasScrolledInitiallyRef.current) return;
			if (!scrollerRef.current) return;
			if (textareaHeight <= 0) return;

			scrollerRef.current.scrollToBottom({animate: false});
			hasScrolledInitiallyRef.current = true;
			shouldStickToBottomRef.current = true;
		}, [textareaHeight]);

		const handleSubmit = React.useCallback(() => {
			if (value.length > maxMessageLength) {
				return;
			}
			const actualContent = displayToActual(value);
			onSubmit(actualContent);
		}, [value, displayToActual, onSubmit, maxMessageLength]);

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

		const handleExpressionPickerToggle = React.useCallback(() => {
			const triggerElement = expressionPickerTriggerRef.current;
			if (!triggerElement) return;

			const popoutKey = `editing-expression-picker-${channel.id}`;
			const isOpen = expressionPickerOpen;

			if (isOpen) {
				PopoutActionCreators.close(popoutKey);
				setExpressionPickerOpen(false);
			} else {
				openPopout(
					triggerElement,
					{
						render: ({onClose}) => (
							<ExpressionPickerPopout
								channelId={channel.id}
								onEmojiSelect={handleEmojiSelect}
								onClose={onClose}
								closeOnEmojiSelect={false}
								visibleTabs={['emojis']}
							/>
						),
						position: 'top-end',
						animationType: 'none',
						offsetCrossAxis: 16,
						onOpen: () => setExpressionPickerOpen(true),
						onClose: () => setExpressionPickerOpen(false),
						returnFocusRef: textareaRef,
					},
					popoutKey,
				);
			}
		}, [channel.id, expressionPickerOpen, handleEmojiSelect, textareaRef]);

		return (
			<>
				{isAutocompleteAttached && (
					<Autocomplete
						type={autocompleteType}
						onSelect={handleSelect}
						selectedIndex={selectedIndex}
						options={autocompleteOptions}
						setSelectedIndex={setSelectedIndex}
						referenceElement={containerRef.current}
						query={autocompleteQuery}
					/>
				)}

				<FocusRing within={true} offset={-2}>
					<div ref={containerRef} className={styles.textareaContainer}>
						<div className={styles.mainWrapperEditing}>
							<div className={styles.contentAreaEditing}>
								<Scroller
									ref={scrollerRef}
									fade={true}
									className={editingStyles.scroller}
									key="editing-message-input-scroller"
									onScroll={handleScroll}
								>
									<div style={{display: 'flex', flexDirection: 'column'}}>
										<span
											key={textareaHeight}
											style={{position: 'absolute', visibility: 'hidden', pointerEvents: 'none'}}
										/>
										<TextareaInputField
											channelId={channel.id}
											disabled={false}
											isMobile={mobileLayout.enabled}
											value={value}
											placeholder=""
											textareaRef={textareaRef}
											scrollerRef={scrollerRef}
											shouldStickToBottomRef={shouldStickToBottomRef}
											isFocused={isFocused}
											isAutocompleteAttached={isAutocompleteAttached}
											autocompleteOptions={autocompleteOptions}
											selectedIndex={selectedIndex}
											segments={segmentManagerRef.current.getSegments()}
											onFocus={() => setIsFocused(true)}
											onBlur={() => setIsFocused(false)}
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
											onHeightChange={setTextareaHeight}
											onCursorMove={onCursorMove}
											onArrowUp={() => {}}
											onEnter={handleSubmit}
											onAutocompleteSelect={handleSelect}
											setSelectedIndex={setSelectedIndex}
											onKeyDown={handleTextareaKeyDown}
											onCopy={handleTextareaCopy}
										/>
									</div>
								</Scroller>
							</div>

							<div className={styles.buttonContainerEditing}>
								<TextareaButton
									ref={mobileLayout.enabled ? undefined : expressionPickerTriggerRef}
									icon={SmileyIcon}
									iconProps={{weight: 'fill'}}
									label="Emojis"
									isSelected={expressionPickerOpen}
									onClick={mobileLayout.enabled ? () => setExpressionPickerOpen(true) : handleExpressionPickerToggle}
									data-expression-picker-tab="emojis"
									compact={true}
								/>
							</div>
						</div>

						<MessageCharacterCounter
							currentLength={value.length}
							maxLength={maxMessageLength}
							isPremium={currentUser.isPremium()}
						/>
					</div>
				</FocusRing>

				<div className={editingStyles.footer}>
					<div>
						<Trans>
							escape to{' '}
							<FocusRing offset={-2}>
								<button type="button" className={editingStyles.footerLink} onClick={onCancel} key="cancel">
									cancel
								</button>
							</FocusRing>
						</Trans>
						<div aria-hidden={true} className={editingStyles.separator} />
						<Trans>
							enter to{' '}
							<FocusRing offset={-2}>
								<button type="button" className={editingStyles.footerLink} onClick={handleSubmit} key="save">
									save
								</button>
							</FocusRing>
						</Trans>
					</div>
				</div>

				{mobileLayout.enabled && (
					<ExpressionPickerSheet
						isOpen={expressionPickerOpen}
						onClose={() => setExpressionPickerOpen(false)}
						channelId={channel.id}
						onEmojiSelect={handleEmojiSelect}
						visibleTabs={['emojis']}
						selectedTab="emojis"
					/>
				)}
			</>
		);
	},
);
