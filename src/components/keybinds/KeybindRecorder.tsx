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
import {ArrowCounterClockwiseIcon, KeyboardIcon, PencilSimpleIcon, TrashIcon} from '@phosphor-icons/react';
import clsx from 'clsx';
import React from 'react';
import {Button} from '~/components/uikit/Button/Button';
import type {KeybindAction, KeyCombo} from '~/stores/KeybindStore';
import {formatKeyCombo} from '~/utils/KeybindUtils';
import styles from './KeybindRecorder.module.css';

interface KeybindRecorderProps {
	action: KeybindAction;
	value: KeyCombo;
	defaultValue?: KeyCombo | null;
	disabled?: boolean;
	onChange: (combo: KeyCombo) => void;
	onClear?: () => void;
	onReset?: () => void;
	className?: string;
	allowMouseButtons?: boolean;
}

const combosEqual = (a: KeyCombo | null | undefined, b: KeyCombo | null | undefined): boolean => {
	if (!a && !b) return true;
	if (!a || !b) return false;
	return (
		a.key === b.key &&
		a.code === b.code &&
		!!a.ctrlOrMeta === !!b.ctrlOrMeta &&
		!!a.ctrl === !!b.ctrl &&
		!!a.alt === !!b.alt &&
		!!a.shift === !!b.shift &&
		!!a.meta === !!b.meta
	);
};

const isModifierKey = (key: string | undefined | null): boolean => {
	if (!key) return false;
	return key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta';
};

const normalizeKeyForCombo = (key: string): string => {
	if (key === 'Spacebar') return ' ';
	return key;
};

const keyboardEventToCombo = (event: KeyboardEvent): KeyCombo => ({
	key: normalizeKeyForCombo(event.key),
	code: event.code,
	ctrlOrMeta: event.metaKey || event.ctrlKey,
	ctrl: event.ctrlKey,
	alt: event.altKey,
	shift: event.shiftKey,
});

const browserMouseButtonToDisplayButton = (button: number): number => {
	switch (button) {
		case 0:
			return 1;
		case 2:
			return 2;
		case 1:
			return 3;
		default:
			return button + 1;
	}
};

const mouseEventToCombo = (event: MouseEvent): KeyCombo => {
	const buttonNumber = browserMouseButtonToDisplayButton(event.button);
	return {
		key: `Mouse ${buttonNumber}`,
		code: `Mouse${buttonNumber}`,
		ctrlOrMeta: event.metaKey || event.ctrlKey,
		ctrl: event.ctrlKey,
		alt: event.altKey,
		shift: event.shiftKey,
	};
};

export const KeybindRecorder: React.FC<KeybindRecorderProps> = ({
	action,
	value,
	defaultValue = null,
	disabled = false,
	onChange,
	onClear,
	onReset,
	className,
	allowMouseButtons = false,
}) => {
	const {t} = useLingui();
	const buttonRef = React.useRef<HTMLButtonElement | null>(null);
	const [recording, setRecording] = React.useState(false);
	const [draftCombo, setDraftCombo] = React.useState<KeyCombo | null>(null);

	const currentCombo = draftCombo ?? value;
	const isEmpty = !currentCombo?.key && !currentCombo?.code;
	const hasValue = !isEmpty;
	const displayValue = formatKeyCombo(currentCombo) || '';
	const currentIsModified = defaultValue ? !combosEqual(currentCombo, defaultValue) : false;
	const canSave = hasValue && !combosEqual(currentCombo, value);

	const cancelRecording = React.useCallback(() => {
		setRecording(false);
		setDraftCombo(null);
	}, []);

	const startRecording = React.useCallback(() => {
		if (disabled) return;
		setDraftCombo(null);
		setRecording(true);
		buttonRef.current?.focus();
	}, [disabled]);

	React.useEffect(() => {
		if (!recording) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				cancelRecording();
				return;
			}

			event.preventDefault();
			event.stopPropagation();

			const combo = keyboardEventToCombo(event);
			setDraftCombo({
				...combo,
				global: value.global,
				enabled: true,
			});

			if (isModifierKey(event.key)) return;
			if (!combo.key && !combo.code) return;

			setRecording(false);
		};

		window.addEventListener('keydown', handleKeyDown, true);
		const handleMouseDown = (event: MouseEvent) => {
			if (!allowMouseButtons) return;
			if (event.button === 0) return;

			event.preventDefault();
			event.stopPropagation();

			setDraftCombo({
				...mouseEventToCombo(event),
				global: value.global,
				enabled: true,
			});
			setRecording(false);
		};

		const handleContextMenu = (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
		};

		window.addEventListener('mousedown', handleMouseDown, true);
		window.addEventListener('contextmenu', handleContextMenu, true);
		return () => {
			window.removeEventListener('keydown', handleKeyDown, true);
			window.removeEventListener('mousedown', handleMouseDown, true);
			window.removeEventListener('contextmenu', handleContextMenu, true);
		};
	}, [recording, allowMouseButtons, cancelRecording, value.global]);

	const handleSave = () => {
		if (!canSave) return;
		onChange({
			...currentCombo,
			global: value.global,
			enabled: true,
		});
		setDraftCombo(null);
		setRecording(false);
	};

	const handleClear = () => {
		setDraftCombo(null);
		setRecording(false);
		onClear?.();
	};

	const handleReset = () => {
		setDraftCombo(null);
		setRecording(false);
		onReset?.();
	};

	return (
		<div className={clsx(styles.inlineEditor, className)}>
			<button
				ref={buttonRef}
				type="button"
				className={clsx(
					styles.recorder,
					hasValue && styles.hasValue,
					recording && styles.recording,
					canSave && styles.dirty,
					disabled && styles.disabled,
				)}
				disabled={disabled}
				data-keybind-recorder="true"
				onClick={startRecording}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						startRecording();
					}
				}}
				aria-label={recording ? t`Recording shortcut for ${action}` : t`Edit keyboard shortcut for ${action}`}
				aria-pressed={recording}
			>
				<div className={styles.layout}>
					<div className={styles.editIconLeft} aria-hidden>
						{recording ? <KeyboardIcon size={16} weight="bold" /> : <PencilSimpleIcon size={14} weight="bold" />}
					</div>
					<div className={styles.inputWrapper}>
						<span className={styles.input}>
							{recording ? t`Press a key...` : hasValue ? displayValue : t`No keybind set`}
						</span>
					</div>
				</div>
			</button>
			<div className={styles.inlineActions}>
				{canSave && (
					<Button variant="primary" small type="button" onClick={handleSave}>
						<Trans>Save</Trans>
					</Button>
				)}
				{onClear && hasValue && !canSave && (
					<Button variant="secondary" small type="button" onClick={handleClear} leftIcon={<TrashIcon size={16} />}>
						<Trans>Clear</Trans>
					</Button>
				)}
				{onReset && currentIsModified && !canSave && (
					<Button
						variant="secondary"
						small
						type="button"
						onClick={handleReset}
						leftIcon={<ArrowCounterClockwiseIcon size={16} />}
					>
						<Trans>Reset</Trans>
					</Button>
				)}
			</div>
		</div>
	);
};
