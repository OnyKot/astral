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

import type {Icon} from '@phosphor-icons/react';
import React from 'react';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {TooltipWithKeybind} from '~/components/uikit/KeybindHint/KeybindHint';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import {useMergeRefs} from '~/hooks/useMergeRefs';
import type {KeybindAction} from '~/stores/KeybindStore';
import styles from '../ChannelHeader.module.css';

export interface ChannelHeaderIconProps {
	icon: Icon;
	label: string;
	isSelected?: boolean;
	onClick?: React.MouseEventHandler<HTMLButtonElement>;
	disabled?: boolean;
	keybindAction?: KeybindAction;
	variant?: 'default' | 'voice';
}

export const ChannelHeaderIcon = React.forwardRef<HTMLButtonElement, ChannelHeaderIconProps>((props, ref) => {
	const {icon: Icon, label, isSelected = false, onClick, disabled = false, keybindAction, variant = 'default', ...rest} = props;
	const buttonRef = React.useRef<HTMLButtonElement | null>(null);
	const mergedRef = useMergeRefs([ref, buttonRef]);
	const buttonClassName =
		variant === 'voice'
			? (isSelected ? styles.iconButtonVoiceSelected : styles.iconButtonVoice)
			: (isSelected ? styles.iconButtonSelected : styles.iconButtonDefault);
	const iconClassName = variant === 'voice' ? styles.buttonIconVoice : styles.buttonIcon;

	const tooltipText = React.useCallback(
		() => <TooltipWithKeybind label={label} action={keybindAction} />,
		[label, keybindAction],
	);

	const button = (
		<FocusRing offset={-2} enabled={!disabled}>
			<button
				{...rest}
				ref={mergedRef}
				type="button"
				className={buttonClassName}
				aria-label={label}
				onClick={disabled ? undefined : onClick}
				disabled={disabled}
				style={{opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer'}}
			>
				<Icon className={iconClassName} />
			</button>
		</FocusRing>
	);

	if (disabled) {
		return (
			<Tooltip text={tooltipText} position="bottom">
				<div style={{display: 'inline-flex'}}>{button}</div>
			</Tooltip>
		);
	}

	return (
		<Tooltip text={tooltipText} position="bottom">
			{button}
		</Tooltip>
	);
});

ChannelHeaderIcon.displayName = 'ChannelHeaderIcon';
