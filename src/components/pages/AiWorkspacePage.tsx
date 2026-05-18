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
	ApertureIcon,
	ArrowSquareOutIcon,
	CopyIcon,
	ImageIcon,
	MagicWandIcon,
	MagnifyingGlassIcon,
	PaperPlaneRightIcon,
	PlusIcon,
	RobotIcon,
	SparkleIcon,
	UserCirclePlusIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as AiActionCreators from '~/actions/AiActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import * as UserActionCreators from '~/actions/UserActionCreators';
import {ConfirmModal} from '~/components/modals/ConfirmModal';
import {Scroller} from '~/components/uikit/Scroller';
import {SafeMarkdown} from '~/lib/markdown';
import {MarkdownContext} from '~/lib/markdown/renderers';
import {useLocation} from '~/lib/router';
import {Routes} from '~/Routes';
import type {AiWorkspaceMessage, AiWorkspaceMode, AiWorkspaceThread} from '~/stores/AiWorkspaceStore';
import AiWorkspaceStore from '~/stores/AiWorkspaceStore';
import UserStore from '~/stores/UserStore';
import * as RouterUtils from '~/utils/RouterUtils';
import styles from './AiWorkspacePage.module.css';

type TFn = (strings: TemplateStringsArray, ...values: Array<unknown>) => string;

const getModeLabel = (t: TFn, mode: AiWorkspaceMode): string => {
	switch (mode) {
		case 'chat':
			return t`AI chat`;
		case 'imagine':
			return t`Imagine`;
		case 'avatar':
			return t`Avatar`;
	}
};

const getModeTitle = (t: TFn, mode: AiWorkspaceMode): string => {
	switch (mode) {
		case 'chat':
			return t`Full AI chat`;
		case 'imagine':
			return t`Image generation`;
		case 'avatar':
			return t`Avatar generation`;
	}
};

const getModeSubtitle = (t: TFn, mode: AiWorkspaceMode): string => {
	switch (mode) {
		case 'chat':
			return t`Ask, argue, write, summarize and work with Grok right inside Astral.`;
		case 'imagine':
			return t`Generate images in the same workspace without a separate service or extra windows.`;
		case 'avatar':
			return t`Describe the style, get variants and apply the result as your avatar.`;
	}
};

const getModePrompts = (t: TFn, mode: AiWorkspaceMode): Array<string> => {
	switch (mode) {
		case 'chat':
			return [t`Make a short summary`, t`Soften the reply`, t`Brainstorm ideas`, t`Draft an action plan`];
		case 'imagine':
			return [t`Neon Astral poster`, t`Server cover`, t`Cinematic sci-fi shot`, t`Minimalist logo background`];
		case 'avatar':
			return [t`Dark futuristic portrait`, t`Astral-style anime avatar`, t`Cyberpunk with soft light`, t`Minimalist monochrome character`];
	}
};

const getModePlaceholder = (t: TFn, mode: AiWorkspaceMode): string => {
	switch (mode) {
		case 'chat':
			return t`Ask Astral AI anything`;
		case 'imagine':
			return t`Describe the image to generate`;
		case 'avatar':
			return t`Describe the avatar as precisely as possible`;
	}
};

const formatSectionLabel = (t: TFn, timestamp: number): string => {
	const today = new Date();
	const target = new Date(timestamp);
	const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
	const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
	const diffDays = Math.round((startOfToday - startOfTarget) / 86_400_000);

	if (diffDays <= 0) return t`Today`;
	if (diffDays === 1) return t`Yesterday`;
	if (diffDays < 7) return t`This week`;
	return t`Earlier`;
};

const formatMessageTime = (locale: string, timestamp: number): string =>
	new Intl.DateTimeFormat(locale, {
		hour: '2-digit',
		minute: '2-digit',
	}).format(timestamp);

const getThreadPreview = (t: TFn, thread: AiWorkspaceThread): string => {
	const lastAssistantMessage = [...thread.messages].reverse().find((message) => message.role === 'assistant');
	if (lastAssistantMessage?.kind === 'image') {
		return lastAssistantMessage.revisedPrompt || t`Image ready`;
	}

	if (lastAssistantMessage?.content) {
		return lastAssistantMessage.content.slice(0, 96);
	}

	const firstUserMessage = thread.messages.find((message) => message.role === 'user');
	return firstUserMessage?.content.slice(0, 96) ?? getModeSubtitle(t, thread.mode);
};

const groupThreads = (t: TFn, threads: Array<AiWorkspaceThread>): Array<[string, Array<AiWorkspaceThread>]> => {
	const sections = new Map<string, Array<AiWorkspaceThread>>();

	for (const thread of threads) {
		const key = formatSectionLabel(t, thread.updatedAt);
		sections.set(key, [...(sections.get(key) ?? []), thread]);
	}

	return Array.from(sections.entries());
};

const buildConversationPayload = (thread: AiWorkspaceThread, nextPrompt: string): Array<AiActionCreators.AiChatMessagePayload> => {
	const history = thread.messages
		.filter((message) => message.kind === 'text' && message.content.trim().length > 0)
		.map((message) => ({
			role: message.role,
			content: message.content,
		}));

	return [...history, {role: 'user', content: nextPrompt}];
};

export const AiWorkspacePage = observer(() => {
	const {t, i18n} = useLingui();
	const location = useLocation();
	const currentUser = UserStore.currentUser;
	const requestedMode = (location.searchParams.get('mode') as AiWorkspaceMode | null) ?? null;
	const [draft, setDraft] = React.useState('');
	const [search, setSearch] = React.useState('');
	const [submitting, setSubmitting] = React.useState(false);
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
	const messagesScrollerRef = React.useRef<HTMLDivElement | null>(null);
	const composerRef = React.useRef<HTMLTextAreaElement | null>(null);

	React.useEffect(() => {
		if (requestedMode === 'chat' || requestedMode === 'imagine' || requestedMode === 'avatar') {
			AiWorkspaceStore.openMode(requestedMode);
			return;
		}

		AiWorkspaceStore.ensureThread('chat');
	}, [requestedMode]);

	const activeThread = AiWorkspaceStore.activeThread;
	const activeMode = activeThread?.mode ?? requestedMode ?? 'chat';

	const filteredThreads = React.useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) {
			return AiWorkspaceStore.orderedThreads;
		}

		return AiWorkspaceStore.orderedThreads.filter((thread) => {
			const haystack = `${thread.title} ${getThreadPreview(t, thread)}`.toLowerCase();
			return haystack.includes(query);
		});
	}, [search, AiWorkspaceStore.orderedThreads.length, AiWorkspaceStore.activeThreadId, t]);

	const groupedThreads = React.useMemo(
		() => groupThreads(t, filteredThreads),
		[filteredThreads, t],
	);

	React.useEffect(() => {
		const scroller = messagesScrollerRef.current;
		if (!scroller) {
			return;
		}

		scroller.scrollTo({
			top: scroller.scrollHeight,
			behavior: 'smooth',
		});
	}, [activeThread?.id, activeThread?.messages.length, submitting]);

	const focusComposer = React.useCallback(() => {
		requestAnimationFrame(() => composerRef.current?.focus());
	}, []);

	const openMode = React.useCallback(
		(mode: AiWorkspaceMode) => {
			AiWorkspaceStore.openMode(mode);
			RouterUtils.replaceWith(`${Routes.AI_ASSISTANT}?mode=${mode}`);
			setDraft('');
			setErrorMessage(null);
			focusComposer();
		},
		[focusComposer],
	);

	const createThread = React.useCallback(
		(mode: AiWorkspaceMode) => {
			AiWorkspaceStore.createThread(mode);
			RouterUtils.replaceWith(`${Routes.AI_ASSISTANT}?mode=${mode}`);
			setDraft('');
			setErrorMessage(null);
			focusComposer();
		},
		[focusComposer],
	);

	const openThread = React.useCallback((threadId: string) => {
		AiWorkspaceStore.setActiveThread(threadId);
		const thread = AiWorkspaceStore.activeThread;
		if (thread) {
			RouterUtils.replaceWith(`${Routes.AI_ASSISTANT}?mode=${thread.mode}`);
		}
		setErrorMessage(null);
	}, []);

	const handleCopy = React.useCallback(
		async (value: string) => {
			try {
				await navigator.clipboard.writeText(value);
				ToastActionCreators.createToast({type: 'success', children: t`Copied`});
			} catch {
				ToastActionCreators.createToast({type: 'error', children: t`Failed to copy`});
			}
		},
		[t],
	);

	const handleApplyAvatar = React.useCallback(
		(message: AiWorkspaceMessage) => {
			const imageUrl = message.imageUrl;
			if (!imageUrl) {
				return;
			}

			ModalActionCreators.push(
				modal(() => (
					<ConfirmModal
						title={t`Set generated avatar?`}
						description={t`We will apply this generated image as your current profile avatar.`}
						primaryText={t`Use avatar`}
						primaryVariant="primary"
						onPrimary={async () => {
							const base64 = message.imageUrl?.startsWith('data:')
								? message.imageUrl
								: await AiActionCreators.fetchImageDataUrl(imageUrl);
							const updatedUser = await UserActionCreators.update({avatar: base64});
							UserStore.handleUserUpdate(updatedUser);
							ToastActionCreators.createToast({type: 'success', children: t`Avatar updated`});
						}}
					/>
				)),
			);
		},
		[t],
	);

	const send = React.useCallback(async () => {
		const prompt = draft.trim();
		if (!prompt || submitting) {
			return;
		}

		const thread = AiWorkspaceStore.activeThread ?? AiWorkspaceStore.ensureThread(activeMode);
		AiWorkspaceStore.addMessage(thread.id, {
			role: 'user',
			kind: 'text',
			content: prompt,
		});

		setDraft('');
		setSubmitting(true);
		setErrorMessage(null);

		try {
			if (thread.mode === 'chat') {
				const response = await AiActionCreators.requestAiAssistantReply(buildConversationPayload(thread, prompt));
				AiWorkspaceStore.addMessage(thread.id, {
					role: 'assistant',
					kind: 'text',
					content: response.content,
				});
			} else {
				const response = await AiActionCreators.requestAiImageGeneration({
					prompt,
					mode: thread.mode === 'avatar' ? 'avatar' : 'chat',
				});
				AiWorkspaceStore.addMessage(thread.id, {
					role: 'assistant',
					kind: 'image',
					content: response.revisedPrompt || prompt,
					imageUrl: response.imageDataUrl ?? response.imageUrl,
					revisedPrompt: response.revisedPrompt,
				});
			}
		} catch (error) {
			const nextError = error instanceof Error ? error.message : t`Request failed`;
			setErrorMessage(nextError);
			ToastActionCreators.createToast({type: 'error', children: nextError});
		} finally {
			setSubmitting(false);
			focusComposer();
		}
	}, [activeMode, draft, focusComposer, submitting, t]);

	const handleKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault();
				void send();
			}
		},
		[send],
	);

	const greetingName = currentUser?.globalName || currentUser?.username || 'Astral';

	if (!activeThread) {
		return <div className={styles.page} />;
	}

	return (
		<div className={styles.page}>
			<div className={styles.sidebar}>
				<div className={styles.sidebarRail}>
					<div className={styles.sidebarLogo}>A</div>
					<button type="button" className={styles.sidebarRailButton} onClick={() => createThread('chat')}>
						<PlusIcon weight="bold" size={18} />
						<span>
							<Trans>New</Trans>
						</span>
					</button>
					<button type="button" className={styles.sidebarRailButton} onClick={() => openMode('chat')}>
						<RobotIcon weight="fill" size={18} />
						<span>
							<Trans>Chat</Trans>
						</span>
					</button>
					<button type="button" className={styles.sidebarRailButton} onClick={() => openMode('imagine')}>
						<ImageIcon weight="fill" size={18} />
						<span>Imagine</span>
					</button>
					<button type="button" className={styles.sidebarRailButton} onClick={() => openMode('avatar')}>
						<UserCirclePlusIcon weight="fill" size={18} />
						<span>Avatar</span>
					</button>
				</div>

				<div className={styles.sidebarContent}>
					<div className={styles.sidebarHeader}>
						<div className={styles.sidebarEyebrow}>Astral AI workspace</div>
						<h1 className={styles.sidebarTitle}>
							<Trans>History and modes</Trans>
						</h1>
						<p className={styles.sidebarSubtitle}>
							<Trans>One live screen for AI chat, image generation and avatars.</Trans>
						</p>
					</div>

					<label className={styles.searchBox}>
						<MagnifyingGlassIcon weight="bold" size={16} />
						<input
							type="search"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder={t`Search history`}
						/>
					</label>

					<div className={styles.quickActions}>
						<button type="button" className={styles.quickActionCard} onClick={() => createThread('chat')}>
							<RobotIcon weight="fill" size={18} />
							<div>
								<strong>
									<Trans>New chat</Trans>
								</strong>
								<span>
									<Trans>Answers, summaries and ideas.</Trans>
								</span>
							</div>
						</button>
						<button type="button" className={styles.quickActionCard} onClick={() => createThread('imagine')}>
							<ImageIcon weight="fill" size={18} />
							<div>
								<strong>Imagine</strong>
								<span>
									<Trans>Images and concepts in the same workspace.</Trans>
								</span>
							</div>
						</button>
					</div>

					<Scroller className={styles.historyScroller}>
						<div className={styles.historyContent}>
							{groupedThreads.map(([label, threads]) => (
								<section key={label} className={styles.historySection}>
									<div className={styles.historySectionLabel}>{label}</div>
									<div className={styles.historyList}>
										{threads.map((thread) => (
											<button
												key={thread.id}
												type="button"
												className={clsx(
													styles.threadCard,
													thread.id === activeThread.id && styles.threadCardActive,
												)}
												onClick={() => openThread(thread.id)}
											>
												<div className={styles.threadCardTop}>
													<span className={styles.threadMode}>{getModeLabel(t, thread.mode)}</span>
													<span className={styles.threadTime}>{formatMessageTime(i18n.locale, thread.updatedAt)}</span>
												</div>
												<div className={styles.threadTitle}>{thread.title}</div>
												<div className={styles.threadPreview}>{getThreadPreview(t, thread)}</div>
											</button>
										))}
									</div>
								</section>
							))}
						</div>
					</Scroller>
				</div>
			</div>

			<div className={styles.main}>
				<header className={styles.mainHeader}>
					<div>
						<div className={styles.mainEyebrow}>{getModeLabel(t, activeMode)}</div>
						<h2 className={styles.mainTitle}>
							{activeThread.messages.length > 0 ? activeThread.title : t`Hi, ${greetingName}`}
						</h2>
						<p className={styles.mainSubtitle}>{getModeSubtitle(t, activeMode)}</p>
					</div>

					<div className={styles.headerMeta}>
						<div className={styles.headerMetaPill}>
							<SparkleIcon weight="fill" size={14} />
							<span>{getModeLabel(t, activeMode)}</span>
						</div>
						<div className={styles.headerMetaCount}>
							<Trans>{activeThread.messages.length} messages</Trans>
						</div>
					</div>
				</header>

				<div className={styles.chatSurface}>
					<div className={styles.messagesArea} ref={messagesScrollerRef}>
						{activeThread.messages.length === 0 ? (
							<div className={styles.emptyState}>
								<div className={styles.emptyGlow} />
								<div className={styles.emptyCard}>
									<div className={styles.emptyBadge}>{getModeTitle(t, activeMode)}</div>
									<h3>
										<Trans>Not a side popup — a real AI workspace</Trans>
									</h3>
									<p>{getModeSubtitle(t, activeMode)}</p>
									<div className={styles.promptGrid}>
										{getModePrompts(t, activeMode).map((prompt) => (
											<button
												key={prompt}
												type="button"
												className={styles.promptChip}
												onClick={() => {
													setDraft(prompt);
													focusComposer();
												}}
											>
												{prompt}
											</button>
										))}
									</div>
								</div>
							</div>
						) : (
							<div className={styles.messageStack}>
								{activeThread.messages.map((message) => (
									<div
										key={message.id}
										className={clsx(
											styles.messageRow,
											message.role === 'user' ? styles.messageRowUser : styles.messageRowAssistant,
										)}
									>
										<div
											className={clsx(
												styles.messageCard,
												message.role === 'user' ? styles.messageCardUser : styles.messageCardAssistant,
												message.kind === 'image' && styles.messageCardImage,
											)}
										>
											<div className={styles.messageMeta}>
												<span>{message.role === 'user' ? t`You` : 'Astral AI'}</span>
												<span>{formatMessageTime(i18n.locale, message.createdAt)}</span>
											</div>

											{message.kind === 'text' ? (
												message.role === 'user' ? (
													<div className={styles.userText}>{message.content}</div>
												) : (
													<div className={styles.assistantMarkdown}>
														<SafeMarkdown
															content={message.content}
															options={{context: MarkdownContext.STANDARD_WITHOUT_JUMBO}}
														/>
													</div>
												)
											) : (
												<div className={styles.generatedCard}>
													{message.imageUrl && (
														<img className={styles.generatedImage} src={message.imageUrl} alt={message.content} />
													)}
													<div className={styles.generatedBody}>
														<div className={styles.generatedPrompt}>{message.revisedPrompt || message.content}</div>
														<div className={styles.generatedActions}>
															<button
																type="button"
																className={styles.secondaryAction}
																onClick={() => void handleCopy(message.revisedPrompt || message.content)}
															>
																<CopyIcon weight="bold" size={16} />
																<span>
																	<Trans>Copy prompt</Trans>
																</span>
															</button>
															{message.imageUrl && (
																<a
																	className={styles.secondaryAction}
																	href={message.imageUrl}
																	target="_blank"
																	rel="noreferrer"
																>
																	<ArrowSquareOutIcon weight="bold" size={16} />
																	<span>
																	<Trans>Open</Trans>
																</span>
																</a>
															)}
															{activeMode === 'avatar' && message.imageUrl && (
																<button
																	type="button"
																	className={styles.primaryAction}
																	onClick={() => handleApplyAvatar(message)}
																>
																	<UserCirclePlusIcon weight="fill" size={16} />
																	<span>
																	<Trans>Use as avatar</Trans>
																</span>
																</button>
															)}
														</div>
													</div>
												</div>
											)}
										</div>
									</div>
								))}
							</div>
						)}
					</div>

					<div className={styles.composerWrap}>
						<div className={styles.modeTabs}>
							{(['chat', 'imagine', 'avatar'] as Array<AiWorkspaceMode>).map((mode) => (
								<button
									key={mode}
									type="button"
									className={clsx(styles.modeTab, activeMode === mode && styles.modeTabActive)}
									onClick={() => openMode(mode)}
								>
									{mode === 'chat' && <RobotIcon weight="fill" size={16} />}
									{mode === 'imagine' && <MagicWandIcon weight="fill" size={16} />}
									{mode === 'avatar' && <ApertureIcon weight="fill" size={16} />}
									<span>{getModeLabel(t, mode)}</span>
								</button>
							))}
						</div>

						<div className={styles.composerCard}>
							<div className={styles.composerHeader}>
								<div className={styles.composerTitle}>
									<RobotIcon weight="fill" size={16} />
									<span>{getModeTitle(t, activeMode)}</span>
								</div>
								<div className={styles.composerHint}>
									<Trans>Enter to send · Shift+Enter for new line</Trans>
								</div>
							</div>

							<textarea
								ref={composerRef}
								value={draft}
								onChange={(event) => setDraft(event.target.value)}
								onKeyDown={handleKeyDown}
								className={styles.composerInput}
								placeholder={getModePlaceholder(t, activeMode)}
								rows={4}
								disabled={submitting}
							/>

							<div className={styles.promptActions}>
								{getModePrompts(t, activeMode).slice(0, 3).map((prompt) => (
									<button
										key={prompt}
										type="button"
										className={styles.promptActionChip}
										onClick={() => {
											setDraft(prompt);
											focusComposer();
										}}
									>
										{prompt}
									</button>
								))}
							</div>

							<div className={styles.composerFooter}>
								<div className={styles.modelBadge}>Grok</div>
								<div className={styles.footerRight}>
									{errorMessage && <div className={styles.errorText}>{errorMessage}</div>}
									<button
										type="button"
										className={styles.sendButton}
										onClick={() => void send()}
										disabled={submitting || draft.trim().length === 0}
									>
										{submitting ? t`Thinking…` : t`Send`}
										<PaperPlaneRightIcon weight="fill" size={16} />
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
});
