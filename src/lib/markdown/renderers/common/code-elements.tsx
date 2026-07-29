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

import {msg} from '@lingui/core/macro';
import {CheckCircleIcon, ClipboardIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useState} from 'react';
import * as TextCopyActionCreators from '~/actions/TextCopyActionCreators';
import codeElementsStyles from '~/styles/CodeElements.module.css';
import markupStyles from '~/styles/Markup.module.css';
import type {CodeBlockNode, InlineCodeNode} from '../../parser/types/nodes';
import type {RendererProps} from '..';

/*
 * highlight.js (~960 KB raw, because the root entry registers every language)
 * and katex (~265 KB) used to be static imports here. This module is on the
 * initial graph — the markdown renderer registry is reached from
 * NotificationStore and from Message/UserMessage — so both libraries plus
 * their stylesheets were downloaded and parsed on every cold load even though
 * most sessions never render a single fenced code block.
 *
 * They are fetched on first use now, cached in module-level singletons so every
 * code block on the page shares one request, and the block renders as the plain
 * <pre><code> we already fall back to for unregistered languages until the
 * library lands. Two deliberate choices:
 *
 *  - we load the full 'highlight.js' entry rather than 'highlight.js/lib/common'
 *    so no language silently loses highlighting (common only registers 36 of
 *    them, and this project's own code is Erlang/Elixir-flavoured);
 *  - we do NOT build the specifier from `language` (i.e. no
 *    import(`highlight.js/lib/languages/${language}`)): `language` comes from
 *    untrusted message content, and a template specifier also makes the bundler
 *    emit a context module with one tiny chunk per language.
 */
type HighlightApi = typeof import('highlight.js').default;
type KatexApi = typeof import('katex').default;

let highlighter: HighlightApi | null = null;
let highlighterPromise: Promise<void> | null = null;
let katex: KatexApi | null = null;
let katexPromise: Promise<void> | null = null;

const loadHighlighter = (): Promise<void> => {
	highlighterPromise ??= Promise.all([
		import('highlight.js'),
		// github-dark is what actually colours the hljs-* tokens; it used to be
		// a render-blocking stylesheet imported from App.tsx.
		import('highlight.js/styles/github-dark.css'),
	]).then(
		([hljsModule]) => {
			highlighter = hljsModule.default;
		},
		(error: unknown) => {
			// Keep the settled promise cached so we don't retry per code block.
			// The block stays unhighlighted, which is the pre-existing fallback.
			console.error('Failed to load syntax highlighter:', error);
		},
	);

	return highlighterPromise;
};

const loadKatex = (): Promise<void> => {
	katexPromise ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(
		([katexModule]) => {
			katex = katexModule.default;
		},
		(error: unknown) => {
			console.error('Failed to load KaTeX:', error);
		},
	);

	return katexPromise;
};

export const CodeBlockRenderer = observer(function CodeBlockRenderer({
	node,
	id,
	options,
}: RendererProps<CodeBlockNode>): React.ReactElement {
	const i18n = options.i18n!;
	const {content, language} = node;
	const [isCopied, setIsCopied] = useState(false);
	const [, bumpLoadedRevision] = useState(0);
	const normalizedLanguage = language?.toLowerCase();
	const isLatex = normalizedLanguage === 'latex' || normalizedLanguage === 'tex';

	useEffect(() => {
		// A fence with no language never needed the highlighter, so don't pay for
		// the chunk at all.
		if (!isLatex && !language) {
			return;
		}

		// Already resolved (the common case after the first code block on the
		// page): the render above used the real library, so skip the extra pass.
		if (isLatex ? katex !== null : highlighter !== null) {
			return;
		}

		let cancelled = false;
		void (isLatex ? loadKatex() : loadHighlighter()).then(() => {
			if (!cancelled) {
				bumpLoadedRevision((revision) => revision + 1);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [isLatex, language]);

	const handleCopy = () => {
		TextCopyActionCreators.copy(i18n, content);
		setIsCopied(true);
		setTimeout(() => setIsCopied(false), 2000);
	};

	const copyButton = (
		<div className={markupStyles.codeActions}>
			<button
				type="button"
				onClick={handleCopy}
				aria-label={isCopied ? i18n._(msg`Copied!`) : i18n._(msg`Copy code`)}
				className={clsx(isCopied && markupStyles.codeActionsVisible)}
			>
				{isCopied ? (
					<CheckCircleIcon className={codeElementsStyles.icon} />
				) : (
					<ClipboardIcon className={codeElementsStyles.icon} />
				)}
			</button>
		</div>
	);

	// Both are null while the library is still in flight, which routes us to the
	// plain <pre><code> below — the same output an unregistered language gets.
	const katexRenderer = isLatex ? katex : null;
	const activeHighlighter = isLatex ? null : highlighter;

	if (katexRenderer) {
		try {
			const html = katexRenderer.renderToString(content, {
				displayMode: true,
				throwOnError: false,
				errorColor: 'var(--accent-danger)',
				trust: false,
				strict: false,
				output: 'html',
			});

			return (
				<div key={id} className={markupStyles.latexCodeBlock}>
					<div className={markupStyles.codeContainer}>
						{copyButton}
						<div
							className={markupStyles.latexContent}
							// biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX output is sanitized
							dangerouslySetInnerHTML={{__html: html}}
						/>
					</div>
				</div>
			);
		} catch (error) {
			console.error('KaTeX rendering error:', error);
			return (
				<div key={id} className={markupStyles.codeContainer}>
					{copyButton}
					<pre>
						<code className={markupStyles.hljs}>
							{i18n._(msg`Error rendering LaTeX: ${(error as Error).message || i18n._(msg`Unknown error`)}`)}
						</code>
					</pre>
				</div>
			);
		}
	}

	let highlightedContent: React.ReactElement;

	if (language && activeHighlighter?.getLanguage(language)) {
		try {
			const highlighted = activeHighlighter.highlight(content, {
				language: language,
				ignoreIllegals: true,
			});

			highlightedContent = (
				// biome-ignore lint/security/noDangerouslySetInnerHtml: highlight.js output is sanitized
				<code className={clsx(markupStyles.hljs, language)} dangerouslySetInnerHTML={{__html: highlighted.value}} />
			);
		} catch (error) {
			console.error('Syntax highlighting error:', error);
			highlightedContent = <code className={markupStyles.hljs}>{content}</code>;
		}
	} else {
		highlightedContent = <code className={markupStyles.hljs}>{content}</code>;
	}

	return (
		<div key={id} className={markupStyles.codeContainer}>
			{copyButton}
			<pre>{highlightedContent}</pre>
		</div>
	);
});

export const InlineCodeRenderer = observer(function InlineCodeRenderer({
	node,
	id,
}: RendererProps<InlineCodeNode>): React.ReactElement {
	const normalizedContent = node.content.replace(/\s+/g, ' ');

	return (
		<code key={id} className={markupStyles.inline}>
			{normalizedContent}
		</code>
	);
});
