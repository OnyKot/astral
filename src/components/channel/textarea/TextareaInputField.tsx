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

import {clsx} from 'clsx';
import React from 'react';
import * as HighlightActionCreators from '~/actions/HighlightActionCreators';
import {type AutocompleteOption, isChannel} from '~/components/channel/Autocomplete';
import type {ScrollerHandle} from '~/components/uikit/Scroller';
import {useTextareaAutofocus} from '~/hooks/useTextareaAutofocus';
import {TextareaAutosize} from '~/lib/TextareaAutosize';
import UnicodeEmojis from '~/lib/UnicodeEmojis';
import type {Emoji} from '~/stores/EmojiStore';
import EmojiStore from '~/stores/EmojiStore';
import * as AvatarUtils from '~/utils/AvatarUtils';
import * as EmojiUtils from '~/utils/EmojiUtils';
import type {MentionSegment} from '~/utils/TextareaSegmentManager';
import {EMOJI_DISPLAY_PLACEHOLDER} from '~/utils/TextareaEmojiDisplayUtils';
import {
	convertUnicodeSurrogateToName,
	getCanonicalUnicodeEmojiSurrogate,
	UNICODE_EMOJI_SURROGATE_RE,
} from '~/utils/UnicodeEmojiMatching';
import styles from './TextareaInput.module.css';

interface TextareaInputFieldProps {
	channelId: string;

	disabled: boolean;
	isMobile: boolean;
	value: string;
	placeholder: string;
	textareaRef: React.RefObject<HTMLTextAreaElement | null>;
	scrollerRef?: React.RefObject<ScrollerHandle | null>;
	shouldStickToBottomRef?: React.MutableRefObject<boolean>;
	isFocused?: boolean;
	isAutocompleteAttached: boolean;
	autocompleteOptions: Array<any>;
	selectedIndex: number;
	onFocus: () => void;
	onBlur: () => void;
	onPointerDown?: () => void;
	onChange: (value: string) => void;
	onBeforeInput?: (event: React.FormEvent<HTMLTextAreaElement>) => void;
	onHeightChange: (height: number) => void;
	onCursorMove: () => void;
	onArrowUp: (event: React.KeyboardEvent) => void;
	onEnter: () => void;
	onAutocompleteSelect: (option: AutocompleteOption) => void;
	setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
	className?: string;
	onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	onCopy?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
	segments?: Array<MentionSegment>;
	voiceInteractionActive?: boolean;
	voiceInputLevel?: number;
	voiceSpectrum?: Array<number>;
	voiceElapsedMs?: number;
}

interface RenderableEmojiToken {
	url: string;
	fallbackUrl?: string;
	alt: string;
	isAnimated: boolean;
}

interface OverlaySpan {
	start: number;
	end: number;
	token: RenderableEmojiToken | null;
	fallbackText: string;
	priority: number;
}

const css = styles as Record<string, string>;
const INLINE_EMOJI_NAME_RE = /^:([^\s:]+?(?:::skin-tone-\d)?):$/;
const CUSTOM_EMOJI_MARKDOWN_RE = /^<a?:([a-zA-Z0-9_~+-]+):(\d+)>$/;
const MAX_TOKEN_CACHE = 600;
const EMOJI_TOKEN_CACHE = new Map<string, RenderableEmojiToken>();
const MAY_CONTAIN_EMOJI_RE = /[\u00A9\u00AE\u200D\u203C-\u3299\u{1F000}-\u{1FAFF}:]/u;

function convertToCodePointsPreservingVariation(emoji: string): string {
	return Array.from(emoji)
		.map((char) => char.codePointAt(0)?.toString(16).replace(/^0+/, '') || '')
		.join('-');
}

function getCachedEmojiToken(cacheKey: string, resolver: () => RenderableEmojiToken | null): RenderableEmojiToken | null {
	if (EMOJI_TOKEN_CACHE.has(cacheKey)) {
		return EMOJI_TOKEN_CACHE.get(cacheKey) ?? null;
	}

	const resolved = resolver();
	/*
	 * Do not cache misses: emoji stores can hydrate asynchronously, and
	 * caching null would make valid emoji stay invisible until refresh.
	 */
	if (!resolved) {
		return null;
	}

	EMOJI_TOKEN_CACHE.set(cacheKey, resolved);
	if (EMOJI_TOKEN_CACHE.size > MAX_TOKEN_CACHE) {
		const firstKey = EMOJI_TOKEN_CACHE.keys().next().value;
		if (typeof firstKey === 'string') {
			EMOJI_TOKEN_CACHE.delete(firstKey);
		}
	}

	return resolved;
}

function buildTokenFromEmojiLike(emoji: Partial<Emoji>): RenderableEmojiToken | null {
	if (emoji.id) {
		return {
			url: AvatarUtils.getEmojiURL({id: emoji.id, animated: emoji.animated}),
			alt: `:${emoji.name || emoji.uniqueName || 'emoji'}:`,
			isAnimated: Boolean(emoji.animated),
		};
	}

	const surrogates = typeof emoji.surrogates === 'string' ? emoji.surrogates : '';
	const preservedVariationUrl = surrogates
		? (EmojiUtils.getTwemojiURL(convertToCodePointsPreservingVariation(surrogates)) ?? null)
		: null;
	const canonicalUrl = surrogates ? EmojiUtils.getEmojiURL(surrogates) : null;
	const configuredUrl = typeof emoji.url === 'string' && emoji.url ? emoji.url : null;
	const primaryUrl = preservedVariationUrl || configuredUrl || canonicalUrl;
	if (!primaryUrl) {
		return null;
	}

	const fallbackUrl =
		configuredUrl && configuredUrl !== primaryUrl
			? configuredUrl
			: canonicalUrl && canonicalUrl !== primaryUrl
				? canonicalUrl
				: undefined;

	return {
		url: primaryUrl,
		fallbackUrl: fallbackUrl && fallbackUrl !== primaryUrl ? fallbackUrl : undefined,
		alt: `:${emoji.name || emoji.uniqueName || 'emoji'}:`,
		isAnimated: false,
	};
}

function resolveTokenFromEmojiName(emojiName: string): RenderableEmojiToken | null {
	return getCachedEmojiToken(`name:${emojiName}`, () => {
		const disambiguated = EmojiStore.getDisambiguatedEmojiContext(null).getByName(emojiName);
		if (disambiguated) {
			return buildTokenFromEmojiLike(disambiguated);
		}

		const unicode = UnicodeEmojis.findEmojiByName(emojiName);
		if (unicode) {
			return buildTokenFromEmojiLike(unicode);
		}

		return null;
	});
}

function resolveTokenFromSurrogate(surrogate: string): RenderableEmojiToken | null {
	return getCachedEmojiToken(`surrogate:${surrogate}`, () => {
		const canonicalSurrogate = getCanonicalUnicodeEmojiSurrogate(surrogate) ?? surrogate;
		const emojiName = convertUnicodeSurrogateToName(canonicalSurrogate, false, '');
		if (emojiName) {
			const byName = resolveTokenFromEmojiName(emojiName);
			if (byName) {
				return byName;
			}
		}

		return buildTokenFromEmojiLike({
			name: emojiName || 'emoji',
			uniqueName: emojiName || 'emoji',
			surrogates: canonicalSurrogate,
			url: EmojiUtils.getEmojiURL(canonicalSurrogate) ?? undefined,
		});
	});
}

function resolveTokenFromSegment(segment: MentionSegment): RenderableEmojiToken | null {
	return getCachedEmojiToken(`segment:${segment.id}:${segment.actualText}:${segment.displayText}`, () => {
		if (segment.type !== 'emoji') {
			return null;
		}

		const emojiById = EmojiStore.getEmojiById(segment.id);
		if (emojiById) {
			return buildTokenFromEmojiLike(emojiById);
		}

		const trimmedActualText = segment.actualText.trim();
		const inlineCustomMatch = trimmedActualText.match(CUSTOM_EMOJI_MARKDOWN_RE);
		if (inlineCustomMatch?.[2]) {
			const animated = trimmedActualText.startsWith('<a:');
			return {
				url: AvatarUtils.getEmojiURL({id: inlineCustomMatch[2], animated}),
				alt: `:${inlineCustomMatch[1]}:`,
				isAnimated: animated,
			};
		}

		const inlineActualMatch = trimmedActualText.match(INLINE_EMOJI_NAME_RE);
		if (inlineActualMatch?.[1]) {
			const byActualName = resolveTokenFromEmojiName(inlineActualMatch[1]);
			if (byActualName) {
				return byActualName;
			}
		}

		const inlineDisplayMatch = segment.displayText.match(INLINE_EMOJI_NAME_RE);
		if (inlineDisplayMatch?.[1]) {
			const byDisplayName = resolveTokenFromEmojiName(inlineDisplayMatch[1]);
			if (byDisplayName) {
				return byDisplayName;
			}
		}

		return resolveTokenFromSurrogate(segment.displayText);
	});
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
	return startA < endB && endA > startB;
}

function buildOverlayNodes(value: string, segments: Array<MentionSegment>): Array<React.ReactNode> {
	if (!value) {
		return [];
	}

	const spans: Array<OverlaySpan> = [];

	for (const segment of segments) {
		if (segment.type !== 'emoji') {
			continue;
		}
		if (segment.start < 0 || segment.end <= segment.start || segment.end > value.length) {
			continue;
		}

		spans.push({
			start: segment.start,
			end: segment.end,
			token: resolveTokenFromSegment(segment),
			fallbackText: value.slice(segment.start, segment.end),
			priority: 3,
		});
	}

	if (UNICODE_EMOJI_SURROGATE_RE && MAY_CONTAIN_EMOJI_RE.test(value) && value.length <= 6000) {
		UNICODE_EMOJI_SURROGATE_RE.lastIndex = 0;
		let surrogateMatch: RegExpExecArray | null;
		while ((surrogateMatch = UNICODE_EMOJI_SURROGATE_RE.exec(value)) !== null) {
			const surrogate = surrogateMatch[0];
			const start = surrogateMatch.index;
			const end = start + surrogate.length;

			const overlapsExistingSpan = spans.some((span) => rangesOverlap(start, end, span.start, span.end));
			if (overlapsExistingSpan) {
				continue;
			}

			spans.push({
				start,
				end,
				token: resolveTokenFromSurrogate(surrogate),
				fallbackText: surrogate,
				priority: 2,
			});
		}
	}

	if (spans.length === 0) {
		return [value.replaceAll(EMOJI_DISPLAY_PLACEHOLDER, '')];
	}

	spans.sort((a, b) => {
		if (a.start !== b.start) {
			return a.start - b.start;
		}
		if (a.priority !== b.priority) {
			return b.priority - a.priority;
		}
		return b.end - a.end;
	});

	const sanitized: Array<OverlaySpan> = [];
	let lastEnd = -1;
	for (const span of spans) {
		if (span.start < lastEnd) {
			continue;
		}
		sanitized.push(span);
		lastEnd = span.end;
	}

	const nodes: Array<React.ReactNode> = [];
	let cursor = 0;
	let emojiIndex = 0;

	for (const span of sanitized) {
		if (span.start > cursor) {
			nodes.push(value.slice(cursor, span.start));
		}

		if (span.token?.url) {
			const renderMetricsText = span.fallbackText.startsWith(EMOJI_DISPLAY_PLACEHOLDER)
				? EMOJI_DISPLAY_PLACEHOLDER
				: span.fallbackText;
			nodes.push(
				<span
					key={`overlay-emoji-${span.start}-${span.end}-${emojiIndex++}`}
					className={css.textareaOverlayEmoji ?? 'textareaOverlayEmoji'}
				>
					<span className={css.textareaOverlayEmojiMetrics ?? 'textareaOverlayEmojiMetrics'}>
						{renderMetricsText}
					</span>
					<img
						src={span.token.url}
						alt={span.token.alt}
						loading="eager"
						decoding="async"
						draggable={false}
						className={css.textareaOverlayEmojiImage ?? 'textareaOverlayEmojiImage'}
						data-animated={span.token.isAnimated || undefined}
						data-fallback-url={span.token.fallbackUrl}
						onError={handleOverlayEmojiImageError}
					/>
				</span>,
			);

			const trailingText = span.fallbackText.startsWith(EMOJI_DISPLAY_PLACEHOLDER)
				? span.fallbackText.slice(EMOJI_DISPLAY_PLACEHOLDER.length)
				: '';
			if (trailingText) {
				nodes.push(trailingText);
			}
		} else {
			const safeFallbackText = span.fallbackText.replaceAll(EMOJI_DISPLAY_PLACEHOLDER, '');
			if (safeFallbackText) {
				nodes.push(safeFallbackText);
			}
		}

		cursor = span.end;
	}

	if (cursor < value.length) {
		nodes.push(value.slice(cursor));
	}

	return nodes;
}

function handleOverlayEmojiImageError(event: React.SyntheticEvent<HTMLImageElement>) {
	const target = event.currentTarget;
	const fallbackUrl = target.dataset.fallbackUrl;
	if (fallbackUrl && target.src !== fallbackUrl) {
		target.src = fallbackUrl;
		target.dataset.fallbackUrl = '';
		return;
	}

	target.style.opacity = '0.5';
}

export const TextareaInputField = React.forwardRef<HTMLTextAreaElement, TextareaInputFieldProps>(
	(
		{
			disabled,
			isMobile,
			value,
			placeholder,
			textareaRef,
			isAutocompleteAttached,
			autocompleteOptions,
			selectedIndex,
			onFocus,
			onBlur,
			onPointerDown,
			onChange,
			onBeforeInput,
			onHeightChange,
			onCursorMove,
			onArrowUp,
			onEnter,
			onAutocompleteSelect,
			setSelectedIndex,
			className,
			onKeyDown,
			onCopy,
			segments = [],
			voiceInteractionActive = false,
			voiceInputLevel = 0,
			voiceSpectrum = [],
			voiceElapsedMs = 0,
		},
		_ref,
	) => {
		useTextareaAutofocus(textareaRef, isMobile, !disabled);
		const hasOverlay = value.length > 0 && !voiceInteractionActive;
		const overlayNodes = React.useMemo(() => buildOverlayNodes(value, segments), [value, segments]);
		const [overlayScrollOffset, setOverlayScrollOffset] = React.useState({top: 0, left: 0});
		const clampedVoiceLevel = Math.max(0, Math.min(1, voiceInputLevel));
		const elapsedLabel = React.useMemo(() => {
			const totalSeconds = Math.max(0, Math.floor(voiceElapsedMs / 1000));
			const minutes = Math.floor(totalSeconds / 60);
			const seconds = totalSeconds % 60;
			return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
		}, [voiceElapsedMs]);
		const recorderBars = React.useMemo(
			() => {
				const barCount = 20;
				return Array.from({length: barCount}, (_, index) => {
					const spectral = Math.max(0, Math.min(1, voiceSpectrum[index] ?? clampedVoiceLevel * 0.5));
					const amplitude = Math.max(0, spectral - 0.035);
					const normalized = Math.min(1, amplitude / 0.965);
					const heightPx = Math.round(normalized * 20);
					return {id: index, heightPx, opacity: normalized < 0.03 ? 0 : Math.min(1, 0.2 + normalized * 1.25)};
				});
			},
			[clampedVoiceLevel, voiceSpectrum],
		);

		const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
			onCursorMove();

			if (isAutocompleteAttached) {
				if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
					event.preventDefault();
					setSelectedIndex((prevIndex) => {
						const newIndex = event.key === 'ArrowUp' ? prevIndex - 1 : prevIndex + 1;
						const clampedIndex = (newIndex + autocompleteOptions.length) % autocompleteOptions.length;
						if (isChannel(autocompleteOptions[clampedIndex])) {
							HighlightActionCreators.highlightChannel(autocompleteOptions[clampedIndex].channel.id);
						} else {
							HighlightActionCreators.clearChannelHighlight();
						}
						return clampedIndex;
					});
				} else if (event.key === 'Tab') {
					event.preventDefault();
					const selectedOption = autocompleteOptions[selectedIndex];
					if (selectedOption) {
						onAutocompleteSelect(selectedOption);
					}
				} else if (event.key === 'Enter') {
					event.preventDefault();
					const selectedOption = autocompleteOptions[selectedIndex];
					if (selectedOption) {
						onAutocompleteSelect(selectedOption);
					}
				}
			} else if (event.key === 'Enter' && !event.shiftKey && !isMobile) {
				event.preventDefault();
				onEnter();
			} else if (event.key === 'ArrowUp') {
				onArrowUp(event);
			}

			if (onKeyDown) {
				onKeyDown(event);
			}
		};

		const handleTextareaScroll = React.useCallback((event: React.UIEvent<HTMLTextAreaElement>) => {
			const target = event.currentTarget;
			const nextTop = target.scrollTop;
			const nextLeft = target.scrollLeft;

			setOverlayScrollOffset((prev) => {
				if (prev.top === nextTop && prev.left === nextLeft) {
					return prev;
				}
				return {top: nextTop, left: nextLeft};
			});
		}, []);

		const handleTextareaContextMenu = React.useCallback(
			(event: React.MouseEvent<HTMLTextAreaElement>) => {
				if (!isMobile) {
					return;
				}

				event.preventDefault();
				event.stopPropagation();
			},
			[isMobile],
		);

		return (
			<div className={css.textareaVisualLayer ?? 'textareaVisualLayer'}>
				{voiceInteractionActive && (
					<div className={css.voiceTypingOverlay ?? 'voiceTypingOverlay'} aria-hidden={true}>
						<div className={css.voiceTypingShell ?? 'voiceTypingShell'}>
							<div className={css.voiceTypingBadge ?? 'voiceTypingBadge'}>
								<span className={css.voiceTypingDot ?? 'voiceTypingDot'} />
								<span>REC</span>
							</div>
							<div className={css.voiceTypingWave ?? 'voiceTypingWave'}>
								{recorderBars.map((bar) => (
									<span
										key={bar.id}
										className={css.voiceTypingWaveBar ?? 'voiceTypingWaveBar'}
										style={{height: `${bar.heightPx}px`, opacity: bar.opacity}}
									/>
								))}
							</div>
							<span className={css.voiceTypingTimer ?? 'voiceTypingTimer'}>{elapsedLabel}</span>
						</div>
					</div>
				)}
				{hasOverlay && (
					<div
						className={css.textareaOverlay ?? 'textareaOverlay'}
						style={{transform: `translate(${-overlayScrollOffset.left}px, ${-overlayScrollOffset.top}px)`}}
						aria-hidden={true}
					>
						{overlayNodes}
					</div>
				)}
				<TextareaAutosize
					data-channel-textarea
					data-native-mobile-textarea={isMobile || undefined}
					spellCheck={!isMobile}
					/*
					 * Mobile keyboard hints:
					 * - enterKeyHint="send" -> iOS/Android show a "Send" key instead
					 *   of a generic Enter on the on-screen keyboard
					 * - autoCapitalize="sentences" -> messaging-app standard, first
					 *   letter of each sentence auto-caps
					 * - autoCorrect="off" on mobile -> avoid native long-press/spellcheck
					 *   popovers fighting the emoji overlay in Android WebView
					 * - autoComplete="off" -> stop password managers / form autofill
					 *   from injecting suggestions into the message composer
					 */
					enterKeyHint="send"
					autoCapitalize="sentences"
					autoCorrect={isMobile ? 'off' : 'on'}
					autoComplete="off"
					disabled={disabled}
					className={clsx(
						css.textarea ?? 'textarea',
						hasOverlay && (css.textareaWithVisualOverlay ?? 'textareaWithVisualOverlay'),
						voiceInteractionActive && (css.textareaVoiceHidden ?? 'textareaVoiceHidden'),
						disabled && 'pointer-events-none',
						className,
					)}
					onBlur={onBlur}
					onBeforeInput={onBeforeInput}
					onChange={(event) => onChange(event.target.value)}
					onContextMenu={handleTextareaContextMenu}
					onFocus={onFocus}
					onPointerDown={onPointerDown}
					onHeightChange={(h) => onHeightChange(h)}
					onKeyDown={handleKeyDown}
					onCopy={onCopy}
					onScroll={handleTextareaScroll}
					placeholder={voiceInteractionActive ? '' : placeholder}
					readOnly={voiceInteractionActive}
					ref={textareaRef}
					value={value}
				/>
			</div>
		);
	},
);

TextareaInputField.displayName = 'TextareaInputField';
