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
import {CheckCircleIcon, ClipboardIcon} from '@phosphor-icons/react';
import {useCallback, useState} from 'react';
import * as TextCopyActionCreators from '~/actions/TextCopyActionCreators';
import {Button} from '~/components/uikit/Button/Button';
import i18n from '~/i18n';
import styles from './HandoffCodeDisplay.module.css';

interface HandoffCodeDisplayProps {
	code: string | null;
	isGenerating: boolean;
	error: string | null;
	success?: boolean;
	onRetry?: () => void;
}

export function HandoffCodeDisplay({code, isGenerating, error, success = false, onRetry}: HandoffCodeDisplayProps) {
	const [copied, setCopied] = useState(false);

	const handleCopyCode = useCallback(async () => {
		if (!code) return;
		await TextCopyActionCreators.copy(i18n, code);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [code]);

	if (isGenerating) {
		return (
			<div className={styles.container}>
				<h1 className={styles.title}>
					<Trans>Linking desktop...</Trans>
				</h1>
				<div className={styles.spinner}>
					<span className={styles.spinnerIcon} />
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className={styles.container}>
				<h1 className={styles.title}>
					<Trans>Something went wrong</Trans>
				</h1>
				<p className={styles.error}>{error}</p>
				{onRetry && (
					<Button onClick={onRetry} fitContainer>
						<Trans>Try again</Trans>
					</Button>
				)}
			</div>
		);
	}

	if (success) {
		return (
			<div className={styles.container}>
				<h1 className={styles.title}>
					<Trans>Desktop linked</Trans>
				</h1>
				<p className={styles.description}>
					<Trans>You can close this tab and return to the desktop app.</Trans>
				</p>
				<div className={styles.spinner}>
					<CheckCircleIcon size={48} weight="fill" />
				</div>
			</div>
		);
	}

	if (!code) {
		return null;
	}

	const codeWithoutHyphen = code.replace(/-/g, '');
	const codePart1 = codeWithoutHyphen.slice(0, 4);
	const codePart2 = codeWithoutHyphen.slice(4, 8);

	return (
		<div className={styles.container}>
			<h1 className={styles.title}>
				<Trans>Your code is ready!</Trans>
			</h1>
			<p className={styles.description}>
				<Trans>Paste it where you came from to complete sign-in.</Trans>
			</p>
			<div className={styles.codeSection}>
				<p className={styles.codeLabel}>
					<Trans>Login code</Trans>
				</p>
				<div className={styles.codeDisplay}>
					<span className={styles.codeChar}>{codePart1}</span>
					<span className={styles.codeSeparator}>-</span>
					<span className={styles.codeChar}>{codePart2}</span>
				</div>
				<Button onClick={handleCopyCode} fitContainer variant="secondary">
					{copied ? (
						<>
							<CheckCircleIcon size={16} weight="bold" />
							<Trans>Copied</Trans>
						</>
					) : (
						<>
							<ClipboardIcon size={16} weight="bold" />
							<Trans>Copy code</Trans>
						</>
					)}
				</Button>
			</div>
		</div>
	);
}
