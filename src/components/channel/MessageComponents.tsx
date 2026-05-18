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

/*
 * MessageComponents — renders Discord-style action rows / buttons /
 * select menus on a webhook-authored message. Pulls the message from
 * MessageViewContext (same pattern as MessageAttachments) so callers
 * don't need to thread props.
 *
 * Click semantics:
 *   - Style 5 (link) buttons: rendered as <a href="…" target="_blank">,
 *     no server round-trip. The browser handles them like any link.
 *   - Styles 1-4: rendered as <button>, click POSTs to
 *     /v1/interactions/click. While the request is in flight the
 *     button shows a loading state. Per-button (NOT per-message) lock
 *     so you can spam different buttons in parallel.
 *   - String selects: rendered as a native <select>; on change we POST
 *     the picked value(s).
 *
 * Failure handling: any non-2xx surfaces a toast. We don't currently
 * receive a structured response from the bot — the bot's reply arrives
 * asynchronously as a normal MESSAGE_CREATE through the gateway, which
 * is the right place for it. The toast is just for "the click itself
 * couldn't be delivered" feedback.
 */

import {Trans} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useState} from 'react';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import {useMessageViewContext} from '~/components/channel/MessageViewContext';
import {Endpoints} from '~/Endpoints';
import HttpClient from '~/lib/HttpClient';
import {Logger} from '~/lib/Logger';
import {
	BUTTON_STYLE_DANGER,
	BUTTON_STYLE_LINK,
	BUTTON_STYLE_PRIMARY,
	BUTTON_STYLE_SECONDARY,
	BUTTON_STYLE_SUCCESS,
	type ButtonComponent,
	COMPONENT_TYPE_BUTTON,
	COMPONENT_TYPE_STRING_SELECT,
	type StringSelectComponent,
} from '~/records/MessageComponentTypes';
import styles from './MessageComponents.module.css';

const logger = new Logger('MessageComponents');

const BUTTON_STYLE_CLASS: Record<number, string> = {
	[BUTTON_STYLE_PRIMARY]: styles.buttonPrimary,
	[BUTTON_STYLE_SECONDARY]: styles.buttonSecondary,
	[BUTTON_STYLE_SUCCESS]: styles.buttonSuccess,
	[BUTTON_STYLE_DANGER]: styles.buttonDanger,
	[BUTTON_STYLE_LINK]: styles.buttonLink,
};

interface InteractionClickBody {
	channel_id: string;
	message_id: string;
	custom_id: string;
	values?: Array<string>;
}

async function postInteractionClick(body: InteractionClickBody): Promise<void> {
	await HttpClient.post({
		url: Endpoints.INTERACTION_CLICK,
		body,
	});
}

function renderEmoji(emoji: ButtonComponent['emoji']): string | null {
	if (!emoji) return null;
	// We only render unicode emoji here. Custom emoji (with id) would
	// need an <img> with the CDN URL — left for a follow-up.
	if (emoji.name && !emoji.id) return emoji.name;
	return null;
}

interface ButtonRendererProps {
	channelId: string;
	messageId: string;
	button: ButtonComponent;
}

function ButtonRenderer({channelId, messageId, button}: ButtonRendererProps) {
	const [isLoading, setLoading] = useState(false);
	const styleClass = BUTTON_STYLE_CLASS[button.style] ?? styles.buttonSecondary;
	const emojiText = renderEmoji(button.emoji);
	const label = button.label ?? '';
	const isDisabled = !!button.disabled || isLoading;

	if (button.style === BUTTON_STYLE_LINK) {
		// Link buttons. We render an anchor; no server round-trip.
		// rel="noopener" is mandatory — the bot's URL is untrusted.
		return (
			<a
				className={clsx(styles.button, styleClass, isDisabled && styles.buttonLoading)}
				href={button.url ?? '#'}
				target="_blank"
				rel="noopener noreferrer nofollow"
				aria-disabled={isDisabled || undefined}
				onClick={(event) => {
					if (isDisabled) {
						event.preventDefault();
					}
				}}
			>
				{emojiText && <span className={styles.buttonEmoji}>{emojiText}</span>}
				{label}
			</a>
		);
	}

	const handleClick = async () => {
		if (isDisabled) return;
		if (!button.custom_id) return;
		setLoading(true);
		try {
			await postInteractionClick({
				channel_id: channelId,
				message_id: messageId,
				custom_id: button.custom_id,
			});
		} catch (error) {
			logger.warn('Failed to post interaction click', error);
			ToastActionCreators.createToast({
				type: 'error',
				children: <Trans>Failed to send interaction</Trans>,
			});
		} finally {
			setLoading(false);
		}
	};

	return (
		<button
			type="button"
			className={clsx(styles.button, styleClass, isLoading && styles.buttonLoading)}
			disabled={isDisabled}
			onClick={handleClick}
		>
			{emojiText && <span className={styles.buttonEmoji}>{emojiText}</span>}
			{label}
		</button>
	);
}

interface SelectRendererProps {
	channelId: string;
	messageId: string;
	select: StringSelectComponent;
}

function SelectRenderer({channelId, messageId, select}: SelectRendererProps) {
	const [isLoading, setLoading] = useState(false);
	const isDisabled = !!select.disabled || isLoading;

	const handleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
		const value = event.target.value;
		if (!value) return;
		setLoading(true);
		try {
			await postInteractionClick({
				channel_id: channelId,
				message_id: messageId,
				custom_id: select.custom_id,
				values: [value],
			});
		} catch (error) {
			logger.warn('Failed to post select interaction', error);
			ToastActionCreators.createToast({
				type: 'error',
				children: <Trans>Failed to send selection</Trans>,
			});
		} finally {
			setLoading(false);
		}
	};

	const defaultOption = select.options.find((opt) => opt.default);

	return (
		<div className={styles.selectWrapper}>
			<select
				className={styles.select}
				disabled={isDisabled}
				defaultValue={defaultOption?.value ?? ''}
				onChange={handleChange}
				aria-label={select.placeholder ?? select.custom_id}
			>
				{!defaultOption && <option value="">{select.placeholder ?? '\u00A0'}</option>}
				{select.options.map((opt) => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
			</select>
		</div>
	);
}

export const MessageComponents = observer(function MessageComponents() {
	const {message} = useMessageViewContext();
	const components = message.components;
	if (!components || components.length === 0) return null;

	return (
		<div className={styles.componentsContainer}>
			{components.map((row, rowIdx) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: action rows have no stable id
				<div key={rowIdx} className={styles.actionRow}>
					{row.components.map((child, childIdx) => {
						if (child.type === COMPONENT_TYPE_BUTTON) {
							return (
								<ButtonRenderer
									// biome-ignore lint/suspicious/noArrayIndexKey: child positions are stable per render
									key={`${rowIdx}-${childIdx}`}
									channelId={message.channelId}
									messageId={message.id}
									button={child}
								/>
							);
						}
						if (child.type === COMPONENT_TYPE_STRING_SELECT) {
							return (
								<SelectRenderer
									// biome-ignore lint/suspicious/noArrayIndexKey: child positions are stable per render
									key={`${rowIdx}-${childIdx}`}
									channelId={message.channelId}
									messageId={message.id}
									select={child}
								/>
							);
						}
						return null;
					})}
				</div>
			))}
		</div>
	);
});
