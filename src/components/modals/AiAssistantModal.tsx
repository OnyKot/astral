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
	CopyIcon,
	DownloadSimpleIcon,
	ImageSquareIcon,
	MagnifyingGlassIcon,
	MagicWandIcon,
	PaperPlaneTiltIcon,
	PlusIcon,
	RobotIcon,
	SparkleIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import React from 'react';
import type {AiChatMessagePayload} from '~/actions/AiActionCreators';
import * as AiActionCreators from '~/actions/AiActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import * as TextCopyActionCreators from '~/actions/TextCopyActionCreators';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import * as Modal from '~/components/modals/Modal';
import {Button} from '~/components/uikit/Button/Button';
import {Spinner} from '~/components/uikit/Spinner';
import {SafeMarkdown} from '~/lib/markdown';
import {MarkdownContext} from '~/lib/markdown/renderers';
import {TextareaAutosize} from '~/lib/TextareaAutosize';
import styles from './AiAssistantModal.module.css';

type ConversationMode = 'chat' | 'imagine' | 'avatar';

type BaseMessage = {
	id: string;
	role: 'user' | 'assistant';
	createdAt: number;
};

type TextMessage = BaseMessage & {
	type: 'text';
	content: string;
	model?: string;
	pending?: boolean;
};

type ImageMessage = BaseMessage & {
	type: 'image';
	prompt: string;
	imageUrl?: string;
	imageDataUrl?: string;
	model?: string;
	revisedPrompt?: string;
	pending?: boolean;
};

type ConversationMessage = TextMessage | ImageMessage;

type Conversation = {
	id: string;
	mode: ConversationMode;
	title: string;
	messages: Array<ConversationMessage>;
	updatedAt: number;
};

type StarterPrompt = {
	id: string;
	label: string;
	description: string;
	prompt: string;
	mode: ConversationMode;
};

export interface AiAssistantModalProps {
	initialMode?: ConversationMode;
	onAvatarSelected?: (dataUrl: string) => void;
}

const createId = () =>
	globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

type TFn = (strings: TemplateStringsArray, ...values: Array<unknown>) => string;

const getDefaultTitle = (t: TFn, mode: ConversationMode): string => {
	switch (mode) {
		case 'imagine':
			return t`New image set`;
		case 'avatar':
			return t`New avatar`;
		case 'chat':
		default:
			return t`New chat`;
	}
};

const createConversation = (t: TFn, mode: ConversationMode): Conversation => ({
	id: createId(),
	mode,
	title: getDefaultTitle(t, mode),
	messages: [],
	updatedAt: Date.now(),
});

const isSameDay = (left: Date, right: Date): boolean =>
	left.getFullYear() === right.getFullYear() &&
	left.getMonth() === right.getMonth() &&
	left.getDate() === right.getDate();

const historyToChatPayload = (messages: Array<ConversationMessage>): Array<AiChatMessagePayload> =>
	messages
		.filter((message): message is TextMessage => message.type === 'text' && !message.pending)
		.map((message) => ({
			role: message.role,
			content: message.content,
		}));

const triggerDownload = (href: string, filename: string) => {
	const link = document.createElement('a');
	link.href = href;
	link.download = filename;
	link.rel = 'noopener';
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
};

const getConversationPreview = (t: TFn, conversation: Conversation): string => {
	const lastMessage = conversation.messages[conversation.messages.length - 1];
	if (!lastMessage) {
		return conversation.mode === 'chat'
			? t`Ask anything`
			: conversation.mode === 'avatar'
				? t`Describe the avatar you want`
				: t`Describe the image you want`;
	}

	if (lastMessage.type === 'image') {
		return lastMessage.pending ? t`Generating image…` : lastMessage.prompt;
	}

	if (lastMessage.pending) {
		return t`Thinking…`;
	}

	return lastMessage.content.replace(/\s+/g, ' ').trim();
};

const getShortTitle = (value: string, fallback: string): string => {
	const trimmed = value.trim();
	if (!trimmed) {
		return fallback;
	}

	return trimmed.length > 42 ? `${trimmed.slice(0, 42)}...` : trimmed;
};

const getModeLabel = (mode: ConversationMode): string => {
	switch (mode) {
		case 'imagine':
			return 'Imagine';
		case 'avatar':
			return 'Avatar';
		case 'chat':
		default:
			return 'Chat';
	}
};

const getModeDescription = (t: TFn, mode: ConversationMode): string => {
	switch (mode) {
		case 'imagine':
			return t`Concepts, posters and image generation`;
		case 'avatar':
			return t`Avatar generation with instant apply`;
		case 'chat':
		default:
			return t`Full AI chat inside Astral`;
	}
};

const getModePromptPlaceholder = (t: TFn, mode: ConversationMode): string => {
	switch (mode) {
		case 'imagine':
			return t`Describe the image`;
		case 'avatar':
			return t`Describe the avatar you want`;
		case 'chat':
		default:
			return t`Ask Astral AI anything`;
	}
};

const buildChatStarters = (t: TFn): Array<StarterPrompt> => [
	{
		id: 'answer',
		label: t`Soften reply`,
		description: t`Rewrite the reply to sound calmer and clearer.`,
		prompt: t`Help me rewrite this message so it sounds calmer, friendlier and clearer.`,
		mode: 'chat',
	},
	{
		id: 'summary',
		label: t`Quick summary`,
		description: t`Give a fast summary on the topic.`,
		prompt: t`Give a short summary of the topic in 5 bullet points.`,
		mode: 'chat',
	},
	{
		id: 'ideas',
		label: t`Brainstorm ideas`,
		description: t`Compress and rank the strongest options.`,
		prompt: t`Brainstorm 10 ideas and rank them from strongest to weakest.`,
		mode: 'chat',
	},
];

const buildImageStarters = (t: TFn): Array<StarterPrompt> => [
	{
		id: 'cover',
		label: t`Cover`,
		description: t`Glossy sci-fi cover for a release.`,
		prompt: t`Futuristic Astral-style cover, deep dark background, soft blue highlights, glossy finish.`,
		mode: 'imagine',
	},
	{
		id: 'poster',
		label: t`Poster`,
		description: t`Large atmospheric key visual.`,
		prompt: t`Large cinematic poster for Astral, neon mist, tech shapes, premium style.`,
		mode: 'imagine',
	},
];

const buildAvatarStarters = (t: TFn): Array<StarterPrompt> => [
	{
		id: 'avatar-dark',
		label: t`Dark avatar`,
		description: t`Clean minimalist portrait.`,
		prompt: t`Dark futuristic avatar, soft blue glow, minimalism, crisp technological style.`,
		mode: 'avatar',
	},
	{
		id: 'avatar-cyber',
		label: t`Cyber`,
		description: t`Bolder neon variant.`,
		prompt: t`Cyberpunk profile avatar, bright accents, clean background, stylish modern portrait.`,
		mode: 'avatar',
	},
];

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({
	initialMode = 'chat',
	onAvatarSelected,
}) => {
	const {t, i18n} = useLingui();
	const availableModes = React.useMemo<Array<ConversationMode>>(
		() => (onAvatarSelected ? ['chat', 'imagine', 'avatar'] : ['chat', 'imagine']),
		[onAvatarSelected],
	);
	const searchInputRef = React.useRef<HTMLInputElement | null>(null);
	const scrollRef = React.useRef<HTMLDivElement | null>(null);
	const [conversations, setConversations] = React.useState<Array<Conversation>>(() => [
		createConversation(t, availableModes.includes(initialMode) ? initialMode : 'chat'),
	]);
	const [selectedConversationId, setSelectedConversationId] = React.useState<string | null>(null);
	const [historyQuery, setHistoryQuery] = React.useState('');
	const [composerValue, setComposerValue] = React.useState('');
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const deferredHistoryQuery = React.useDeferredValue(historyQuery.trim().toLowerCase());

	const selectedId = selectedConversationId ?? conversations[0]?.id ?? null;
	const activeConversation = conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0];
	const starters = React.useMemo<Array<StarterPrompt>>(
		() => [
			...buildChatStarters(t),
			...buildImageStarters(t),
			...(onAvatarSelected ? buildAvatarStarters(t) : []),
		],
		[onAvatarSelected, t],
	);
	const timeFormatter = React.useMemo(
		() =>
			new Intl.DateTimeFormat(i18n.locale, {
				hour: '2-digit',
				minute: '2-digit',
			}),
		[i18n.locale],
	);
	const dateFormatter = React.useMemo(
		() =>
			new Intl.DateTimeFormat(i18n.locale, {
				month: 'short',
				day: 'numeric',
			}),
		[i18n.locale],
	);

	const filteredConversations = React.useMemo(() => {
		if (!deferredHistoryQuery) {
			return conversations;
		}

		return conversations.filter((conversation) => {
			const haystack = [
				conversation.title,
				getConversationPreview(t, conversation),
				getModeLabel(conversation.mode),
			]
				.join(' ')
				.toLowerCase();
			return haystack.includes(deferredHistoryQuery);
		});
	}, [conversations, deferredHistoryQuery, t]);

	const groupedConversations = React.useMemo(() => {
		const now = new Date();
		const yesterday = new Date(now);
		yesterday.setDate(now.getDate() - 1);
		const groups = {
			today: [] as Array<Conversation>,
			yesterday: [] as Array<Conversation>,
			earlier: [] as Array<Conversation>,
		};

		for (const conversation of filteredConversations) {
			const updatedAt = new Date(conversation.updatedAt);
			if (isSameDay(now, updatedAt)) {
				groups.today.push(conversation);
			} else if (isSameDay(yesterday, updatedAt)) {
				groups.yesterday.push(conversation);
			} else {
				groups.earlier.push(conversation);
			}
		}

		return [
			{key: 'today', label: t`Today`, items: groups.today},
			{key: 'yesterday', label: t`Yesterday`, items: groups.yesterday},
			{key: 'earlier', label: t`Earlier`, items: groups.earlier},
		].filter((group) => group.items.length > 0);
	}, [filteredConversations, t]);

	const currentStarters = React.useMemo(
		() => starters.filter((starter) => starter.mode === activeConversation?.mode),
		[activeConversation?.mode, starters],
	);

	React.useEffect(() => {
		if (!selectedConversationId && conversations[0]?.id) {
			setSelectedConversationId(conversations[0].id);
		}
	}, [conversations, selectedConversationId]);

	React.useEffect(() => {
		const scroller = scrollRef.current;
		if (!scroller) {
			return;
		}

		scroller.scrollTop = scroller.scrollHeight;
	}, [activeConversation?.id, activeConversation?.messages.length]);

	const replaceConversation = React.useCallback(
		(conversationId: string, updater: (conversation: Conversation) => Conversation) => {
			setConversations((current) =>
				current.map((conversation) => (conversation.id === conversationId ? updater(conversation) : conversation)),
			);
		},
		[],
	);

	const createAndSelectConversation = React.useCallback(
		(mode: ConversationMode) => {
			const conversation = createConversation(t, mode);
			setConversations((current) => [conversation, ...current]);
			setSelectedConversationId(conversation.id);
			setComposerValue('');
			return conversation;
		},
		[t],
	);

	const selectMode = React.useCallback(
		(mode: ConversationMode) => {
			if (!activeConversation) {
				createAndSelectConversation(mode);
				return;
			}

			if (activeConversation.mode === mode) {
				return;
			}

			if (activeConversation.messages.length === 0) {
				replaceConversation(activeConversation.id, (conversation) => ({
					...conversation,
					mode,
					title: getDefaultTitle(t, mode),
					updatedAt: Date.now(),
				}));
				return;
			}

			createAndSelectConversation(mode);
		},
		[activeConversation, createAndSelectConversation, replaceConversation, t],
	);

	const handleStarter = React.useCallback(
		(starter: StarterPrompt) => {
			const conversation =
				!activeConversation ||
				activeConversation.mode !== starter.mode ||
				activeConversation.messages.length > 0
					? createAndSelectConversation(starter.mode)
					: activeConversation;

			setSelectedConversationId(conversation.id);
			setComposerValue(starter.prompt);
		},
		[activeConversation, createAndSelectConversation],
	);

	const handleCopyMessage = React.useCallback(
		async (content: string) => {
			await TextCopyActionCreators.copy(i18n, content, true);
		},
		[i18n],
	);

	const resolveImageDataUrl = React.useCallback(
		async (message: ImageMessage): Promise<string> => {
			if (message.imageDataUrl) {
				return message.imageDataUrl;
			}

			if (!message.imageUrl) {
				throw new Error(t`The generated image is not available.`);
			}

			return await AiActionCreators.fetchImageDataUrl(message.imageUrl);
		},
		[t],
	);

	const handleDownloadImage = React.useCallback(
		async (message: ImageMessage) => {
			const dataUrl = await resolveImageDataUrl(message);
			triggerDownload(dataUrl, 'astral-ai-image.png');
		},
		[resolveImageDataUrl],
	);

	const handleUseAsAvatar = React.useCallback(
		async (message: ImageMessage) => {
			if (!onAvatarSelected) {
				return;
			}

			const dataUrl = await resolveImageDataUrl(message);
			onAvatarSelected(dataUrl);
			ToastActionCreators.createToast({type: 'success', children: t`Avatar added to your profile draft`});
			ModalActionCreators.pop();
		},
		[onAvatarSelected, resolveImageDataUrl, t],
	);

	const handleSend = React.useCallback(async () => {
		if (!activeConversation || isSubmitting) {
			return;
		}

		const trimmed = composerValue.trim();
		if (!trimmed) {
			return;
		}

		const userMessage: TextMessage = {
			id: createId(),
			role: 'user',
			type: 'text',
			content: trimmed,
			createdAt: Date.now(),
		};
		const pendingMessage: ConversationMessage =
			activeConversation.mode === 'chat'
				? {
						id: createId(),
						role: 'assistant',
						type: 'text',
						content: '',
						pending: true,
						createdAt: Date.now(),
					}
				: {
						id: createId(),
						role: 'assistant',
						type: 'image',
						prompt: trimmed,
						pending: true,
						createdAt: Date.now(),
					};

		const conversationId = activeConversation.id;
		setComposerValue('');
		setIsSubmitting(true);

		replaceConversation(conversationId, (conversation) => ({
			...conversation,
			title: getShortTitle(trimmed, getDefaultTitle(t, conversation.mode)),
			updatedAt: Date.now(),
			messages: [...conversation.messages, userMessage, pendingMessage],
		}));

		try {
			if (activeConversation.mode === 'chat') {
				const result = await AiActionCreators.requestAiAssistantReply(
					historyToChatPayload([...activeConversation.messages, userMessage]),
				);

				replaceConversation(conversationId, (conversation) => ({
					...conversation,
					updatedAt: Date.now(),
					messages: conversation.messages.map((message) =>
						message.id === pendingMessage.id
							? {
									id: message.id,
									role: 'assistant',
									type: 'text',
									content: result.content,
									model: result.model,
									createdAt: message.createdAt,
							  }
							: message,
					),
				}));
			} else {
				const result = await AiActionCreators.requestAiImageGeneration({
					prompt: trimmed,
					mode: activeConversation.mode === 'avatar' ? 'avatar' : 'chat',
				});

				replaceConversation(conversationId, (conversation) => ({
					...conversation,
					updatedAt: Date.now(),
					messages: conversation.messages.map((message) =>
						message.id === pendingMessage.id
							? {
									id: message.id,
									role: 'assistant',
									type: 'image',
									prompt: trimmed,
									imageUrl: result.imageUrl,
									imageDataUrl: result.imageDataUrl,
									model: result.model,
									revisedPrompt: result.revisedPrompt,
									createdAt: message.createdAt,
							  }
							: message,
					),
				}));
			}
		} catch (error) {
			ToastActionCreators.createToast({
				type: 'error',
				children: error instanceof Error ? error.message : t`AI request failed`,
			});

			replaceConversation(conversationId, (conversation) => ({
				...conversation,
				messages: conversation.messages.filter((message) => message.id !== pendingMessage.id),
			}));
		} finally {
			setIsSubmitting(false);
		}
	}, [activeConversation, composerValue, isSubmitting, replaceConversation, t]);

	const handleComposerKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault();
				void handleSend();
			}
		},
		[handleSend],
	);

	const activeMode = activeConversation?.mode ?? 'chat';
	const activePreview = activeConversation ? getConversationPreview(t, activeConversation) : '';
	const displayTitle =
		activeMode === 'chat' ? t`AI Assistant` : activeMode === 'avatar' ? t`Avatar Studio` : t`Imagine`;
	const displayDescription =
		activeConversation?.messages.length && activeConversation.title !== getDefaultTitle(t, activeMode)
			? activeConversation.title
			: getModeDescription(t, activeMode);

	return (
		<Modal.Root size="fullscreen" transitionPreset="instant" className={styles.modalRoot}>
			<Modal.ScreenReaderLabel text={t`Astral AI`} />
			<Modal.InsetCloseButton onClick={() => ModalActionCreators.pop()} />
			<div className={styles.shell}>
				<div className={styles.sidebarShell}>
					<div className={styles.rail}>
						<div className={styles.railBrand}>
							<div className={styles.logoBadge}>
								<RobotIcon weight="fill" className={styles.logoIcon} />
							</div>
							<div className={styles.railBrandLabel}>Astral</div>
						</div>
						<button type="button" className={styles.railAction} onClick={() => searchInputRef.current?.focus()}>
							<MagnifyingGlassIcon weight="bold" className={styles.railActionIcon} />
							<span className={styles.railActionLabel}>
								<Trans>Search</Trans>
							</span>
						</button>
						<button
							type="button"
							className={clsx(styles.railAction, activeMode === 'chat' && styles.railActionActive)}
							onClick={() => createAndSelectConversation('chat')}
						>
							<PlusIcon weight="bold" className={styles.railActionIcon} />
							<span className={styles.railActionLabel}>
								<Trans>New chat</Trans>
							</span>
						</button>
						<button
							type="button"
							className={clsx(styles.railAction, activeMode === 'chat' && styles.railActionMuted)}
							onClick={() => selectMode('chat')}
						>
							<RobotIcon weight="fill" className={styles.railActionIcon} />
							<span className={styles.railActionLabel}>AI</span>
						</button>
						<button
							type="button"
							className={clsx(styles.railAction, activeMode === 'imagine' && styles.railActionActive)}
							onClick={() => selectMode('imagine')}
						>
							<MagicWandIcon weight="bold" className={styles.railActionIcon} />
							<span className={styles.railActionLabel}>Imagine</span>
						</button>
						{onAvatarSelected && (
							<button
								type="button"
								className={clsx(styles.railAction, activeMode === 'avatar' && styles.railActionActive)}
								onClick={() => selectMode('avatar')}
							>
								<SparkleIcon weight="fill" className={styles.railActionIcon} />
								<span className={styles.railActionLabel}>
									<Trans>Avatar</Trans>
								</span>
							</button>
						)}
					</div>

					<aside className={styles.sidebar}>
						<div className={styles.sidebarHeader}>
							<div className={styles.sidebarEyebrow}>
								<Trans>Astral AI workspace</Trans>
							</div>
							<h2 className={styles.sidebarTitle}>
								<Trans>AI workspace</Trans>
							</h2>
							<p className={styles.sidebarDescription}>
								<Trans>History, modes and generation on one cohesive screen.</Trans>
							</p>
						</div>

						<div className={styles.searchBox}>
							<MagnifyingGlassIcon weight="bold" className={styles.searchIcon} />
							<input
								ref={searchInputRef}
								value={historyQuery}
								onChange={(event) => setHistoryQuery(event.currentTarget.value)}
								className={styles.searchInput}
								placeholder={t`Search history`}
							/>
						</div>

						<div className={styles.quickActions}>
							<button type="button" className={styles.quickActionCard} onClick={() => createAndSelectConversation('chat')}>
								<RobotIcon weight="fill" className={styles.quickActionIcon} />
								<div>
									<div className={styles.quickActionTitle}>
										<Trans>New chat</Trans>
									</div>
									<div className={styles.quickActionText}>
										<Trans>Answers, summaries and ideas.</Trans>
									</div>
								</div>
							</button>
							<button
								type="button"
								className={styles.quickActionCard}
								onClick={() => createAndSelectConversation('imagine')}
							>
								<ImageSquareIcon weight="fill" className={styles.quickActionIcon} />
								<div>
									<div className={styles.quickActionTitle}>Imagine</div>
									<div className={styles.quickActionText}>
										<Trans>Images and concepts in the same workspace.</Trans>
									</div>
								</div>
							</button>
							{onAvatarSelected && (
								<button
									type="button"
									className={styles.quickActionCard}
									onClick={() => createAndSelectConversation('avatar')}
								>
									<SparkleIcon weight="fill" className={styles.quickActionIcon} />
									<div>
										<div className={styles.quickActionTitle}>
											<Trans>Avatar</Trans>
										</div>
										<div className={styles.quickActionText}>
											<Trans>Straight into your profile draft.</Trans>
										</div>
									</div>
								</button>
							)}
						</div>

						<div className={styles.historySections}>
							{groupedConversations.length > 0 ? (
								groupedConversations.map((group) => (
									<div key={group.key} className={styles.historyGroup}>
										<div className={styles.historyGroupLabel}>{group.label}</div>
										<div className={styles.historyList}>
											{group.items.map((conversation) => (
												<button
													key={conversation.id}
													type="button"
													className={clsx(
														styles.historyItem,
														conversation.id === activeConversation?.id && styles.historyItemActive,
													)}
													onClick={() => setSelectedConversationId(conversation.id)}
												>
													<div className={styles.historyItemTop}>
														<span className={styles.historyMode}>{getModeLabel(conversation.mode)}</span>
														<span className={styles.historyDate}>
															{isSameDay(new Date(), new Date(conversation.updatedAt))
																? timeFormatter.format(conversation.updatedAt)
																: dateFormatter.format(conversation.updatedAt)}
														</span>
													</div>
													<div className={styles.historyTitle}>{conversation.title}</div>
													<div className={styles.historyPreview}>{getConversationPreview(t, conversation)}</div>
												</button>
											))}
										</div>
									</div>
								))
							) : (
								<div className={styles.historyEmpty}>
									<Trans>Nothing matches this query.</Trans>
								</div>
							)}
						</div>
					</aside>
				</div>

				<div className={styles.main}>
					<header className={styles.header}>
						<div className={styles.headerText}>
							<div className={styles.headerEyebrow}>
								<Trans>Full AI chat inside Astral</Trans>
							</div>
							<h1 className={styles.headerTitle}>{displayTitle}</h1>
							<p className={styles.headerDescription}>{displayDescription}</p>
						</div>
						<div className={styles.headerMeta}>
							<div className={styles.headerPill}>
								{activeMode === 'chat' ? (
									<>
										<RobotIcon weight="fill" className={styles.headerPillIcon} />
										<Trans>AI chat</Trans>
									</>
								) : activeMode === 'avatar' ? (
									<>
										<SparkleIcon weight="fill" className={styles.headerPillIcon} />
										<Trans>Avatar lab</Trans>
									</>
								) : (
									<>
										<ImageSquareIcon weight="fill" className={styles.headerPillIcon} />
										<Trans>Imagine</Trans>
									</>
								)}
							</div>
							<div className={styles.headerSubline}>
								<Trans>{activeConversation?.messages.length ?? 0} messages</Trans>
							</div>
						</div>
					</header>

					<div ref={scrollRef} className={styles.conversation}>
						<div className={styles.conversationInner}>
							{activeConversation?.messages.length ? (
								<div className={styles.messageList}>
									{activeConversation.messages.map((message) => (
										<div
											key={message.id}
											className={clsx(
												styles.messageRow,
												message.role === 'user' ? styles.messageRowUser : styles.messageRowAssistant,
											)}
										>
											<div
												className={clsx(
													styles.messageBubble,
													message.role === 'user' ? styles.userBubble : styles.assistantBubble,
												)}
											>
												<div className={styles.messageMeta}>
													<div className={styles.messageRole}>
														{message.role === 'user' ? t`You` : t`Astral AI`}
													</div>
													<div className={styles.messageTime}>{timeFormatter.format(message.createdAt)}</div>
												</div>

												{message.type === 'text' ? (
													message.pending ? (
														<div className={styles.pendingState}>
															<Spinner size="small" />
															<span>
																<Trans>Thinking…</Trans>
															</span>
														</div>
													) : message.role === 'assistant' ? (
														<>
															<div className={styles.messageMarkdown}>
																<SafeMarkdown
																	content={message.content}
																	options={{context: MarkdownContext.STANDARD_WITHOUT_JUMBO}}
																/>
															</div>
															<div className={styles.messageActions}>
																<Button
																	variant="secondary"
																	small={true}
																	leftIcon={<CopyIcon weight="bold" />}
																	onClick={() => void handleCopyMessage(message.content)}
																>
																	<Trans>Copy</Trans>
																</Button>
																{message.model && <span className={styles.modelTag}>{message.model}</span>}
															</div>
														</>
													) : (
														<div className={styles.userText}>{message.content}</div>
													)
												) : message.pending ? (
													<div className={styles.pendingImageCard}>
														<Spinner size="small" />
														<div>
															<div className={styles.pendingImageTitle}>
																<Trans>Generating image…</Trans>
															</div>
															<div className={styles.pendingImagePrompt}>{message.prompt}</div>
														</div>
													</div>
												) : (
													<div className={styles.imageCard}>
														<div className={styles.imageCardHeader}>
															<div>
																<div className={styles.imageCardTitle}>
																	{activeMode === 'avatar' ? t`Avatar option` : t`Generated image`}
																</div>
																<div className={styles.imageCardPrompt}>{message.prompt}</div>
																{message.revisedPrompt && message.revisedPrompt !== message.prompt ? (
																	<div className={styles.imageCardRevision}>
																		<Trans>Refined prompt:</Trans> {message.revisedPrompt}
																	</div>
																) : null}
															</div>
															{message.model && <span className={styles.modelTag}>{message.model}</span>}
														</div>
														{(message.imageDataUrl || message.imageUrl) && (
															<img
																src={message.imageDataUrl || message.imageUrl}
																alt={message.prompt}
																className={styles.generatedImage}
															/>
														)}
														<div className={styles.imageActions}>
															<Button
																variant="secondary"
																small={true}
																leftIcon={<DownloadSimpleIcon weight="bold" />}
																onClick={() => void handleDownloadImage(message)}
															>
																<Trans>Download</Trans>
															</Button>
															{onAvatarSelected && (
																<Button
																	small={true}
																	leftIcon={<SparkleIcon weight="fill" />}
																	onClick={() => void handleUseAsAvatar(message)}
																>
																	<Trans>Use as avatar</Trans>
																</Button>
															)}
														</div>
													</div>
												)}
											</div>
										</div>
									))}
								</div>
							) : (
								<div className={styles.emptyState}>
									<div className={styles.emptyHero}>
										<div className={styles.emptyBadge}>
											{activeMode === 'chat' ? (
												<RobotIcon weight="fill" className={styles.emptyBadgeIcon} />
											) : activeMode === 'avatar' ? (
												<SparkleIcon weight="fill" className={styles.emptyBadgeIcon} />
											) : (
												<ImageSquareIcon weight="fill" className={styles.emptyBadgeIcon} />
											)}
										</div>
										<div className={styles.emptyCopy}>
											<h3 className={styles.emptyTitle}>
												{activeMode === 'chat'
													? t`Open a full AI chat`
													: activeMode === 'avatar'
														? t`Generate a new avatar`
														: t`Generate an image inside the chat`}
											</h3>
											<p className={styles.emptyDescription}>{getModeDescription(t, activeMode)}</p>
										</div>
									</div>

									<div className={styles.heroPanels}>
										<div className={styles.heroPanel}>
											<div className={styles.heroPanelLabel}>
												<Trans>Current mode</Trans>
											</div>
											<div className={styles.heroPanelValue}>{getModeLabel(activeMode)}</div>
											<div className={styles.heroPanelText}>{activePreview}</div>
										</div>
										<div className={styles.heroPanel}>
											<div className={styles.heroPanelLabel}>
												<Trans>What it does</Trans>
											</div>
											<div className={styles.heroPanelText}>
												{activeMode === 'chat'
													? t`Summaries, ideas, message drafts and long replies without a separate settings screen.`
													: activeMode === 'avatar'
														? t`Avatar generation with instant hand-off to your profile draft, confirmed in your usual flow.`
														: t`Image, concept and cover generation right inside the same AI workspace.`}
											</div>
										</div>
									</div>

									<div className={styles.starterGrid}>
										{currentStarters.map((starter) => (
											<button
												key={starter.id}
												type="button"
												className={styles.starterCard}
												onClick={() => handleStarter(starter)}
											>
												<div className={styles.starterLabel}>{starter.label}</div>
												<div className={styles.starterDescription}>{starter.description}</div>
												<div className={styles.starterPrompt}>{starter.prompt}</div>
											</button>
										))}
									</div>
								</div>
							)}
						</div>
					</div>

					<div className={styles.composerDock}>
						<div className={styles.modeTabs}>
							{availableModes.map((mode) => (
								<button
									key={mode}
									type="button"
									className={clsx(styles.modeTab, activeMode === mode && styles.modeTabActive)}
									onClick={() => selectMode(mode)}
								>
									{mode === 'chat' ? (
										<RobotIcon weight="fill" className={styles.modeTabIcon} />
									) : mode === 'avatar' ? (
										<SparkleIcon weight="fill" className={styles.modeTabIcon} />
									) : (
										<ImageSquareIcon weight="fill" className={styles.modeTabIcon} />
									)}
									<span>{getModeLabel(mode)}</span>
								</button>
							))}
						</div>

						<div className={styles.composerCard}>
							<div className={styles.composerTopRow}>
								<div className={styles.composerMode}>
									{activeMode === 'chat' ? (
										<>
											<RobotIcon weight="fill" className={styles.composerModeIcon} />
											<Trans>AI chat</Trans>
										</>
									) : activeMode === 'avatar' ? (
										<>
											<SparkleIcon weight="fill" className={styles.composerModeIcon} />
											<Trans>Avatar mode</Trans>
										</>
									) : (
										<>
											<MagicWandIcon weight="bold" className={styles.composerModeIcon} />
											<Trans>Imagine mode</Trans>
										</>
									)}
								</div>
								<div className={styles.composerHint}>
									<Trans>Enter to send • Shift+Enter for new line</Trans>
								</div>
							</div>

							<div className={styles.composer}>
								<TextareaAutosize
									value={composerValue}
									onChange={(event) => setComposerValue(event.currentTarget.value)}
									onKeyDown={handleComposerKeyDown}
									minRows={1}
									maxRows={10}
									placeholder={getModePromptPlaceholder(t, activeMode)}
									className={styles.composerInput}
								/>
								<Button
									onClick={() => void handleSend()}
									submitting={isSubmitting}
									disabled={!composerValue.trim()}
									leftIcon={<PaperPlaneTiltIcon weight="fill" />}
									className={styles.sendButton}
								>
									<Trans>Send</Trans>
								</Button>
							</div>

							<div className={styles.composerFooter}>
								<div className={styles.inlineActions}>
									{currentStarters.slice(0, 3).map((starter) => (
										<button
											key={starter.id}
											type="button"
											className={styles.inlineAction}
											onClick={() => handleStarter(starter)}
										>
											{starter.label}
										</button>
									))}
								</div>
								<div className={styles.composerNote}>
									{activeMode === 'avatar' && onAvatarSelected
										? t`The generated avatar lands in your profile draft first, then you confirm the change yourself.`
										: activeMode === 'chat'
											? t`A full Astral-style AI chat with no separate user-provided key.`
											: t`Image generation happens right inside this same workspace.`}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</Modal.Root>
	);
};
