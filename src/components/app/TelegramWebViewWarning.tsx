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
	ArrowSquareOutIcon,
	CopyIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import {motion, useReducedMotion} from 'framer-motion';
import React from 'react';
import AppStorage from '~/lib/AppStorage';
import styles from './TelegramWebViewWarning.module.css';

/**
 * Full-screen nudge when the app is loaded inside the Telegram in-app browser.
 * That WebView breaks OAuth flows, autofill, cookies, and long-lived sessions —
 * users end up stuck on the login screen with no idea why.
 *
 * Detection is UA-based: Telegram's WebView injects "Telegram" somewhere in
 * the navigator.userAgent on both iOS and Android. We also detect
 * window.TelegramWebviewProxy (Android) as a secondary signal.
 *
 * The nudge is dismissible for the session — we don't want to force a user
 * out if they really just want to look at something. `AppStorage` key is
 * session-scoped intentionally so the warning comes back on a fresh open.
 */

const DISMISS_KEY = 'astral:telegram-webview-dismissed-session';

function isTelegramWebView(): boolean {
	if (typeof navigator === 'undefined') return false;
	const ua = navigator.userAgent || '';
	if (/Telegram/i.test(ua)) return true;
	// Android-specific bridge
	if (typeof window !== 'undefined') {
		const anyWindow = window as unknown as {
			TelegramWebviewProxy?: unknown;
			TelegramWebview?: unknown;
		};
		if (anyWindow.TelegramWebviewProxy || anyWindow.TelegramWebview) return true;
	}
	return false;
}

export const TelegramWebViewWarning: React.FC = () => {
	const {t} = useLingui();
	const reducedMotion = useReducedMotion() ?? false;
	const [isOpen, setIsOpen] = React.useState<boolean>(false);
	const [copied, setCopied] = React.useState<boolean>(false);

	React.useEffect(() => {
		if (!isTelegramWebView()) return;
		// Session-scoped dismiss — sessionStorage would be nicer but AppStorage
		// is already the pattern used across the app. Use a session flag fallback.
		try {
			if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
		} catch {}
		setIsOpen(true);
	}, []);

	const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

	const handleCopy = React.useCallback(async () => {
		try {
			await navigator.clipboard.writeText(currentUrl);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1800);
		} catch {
			// clipboard can be blocked in Telegram — fall back to legacy select
			const tmp = document.createElement('textarea');
			tmp.value = currentUrl;
			tmp.style.position = 'fixed';
			tmp.style.left = '-9999px';
			document.body.appendChild(tmp);
			tmp.select();
			try {
				document.execCommand('copy');
				setCopied(true);
				window.setTimeout(() => setCopied(false), 1800);
			} catch {}
			document.body.removeChild(tmp);
		}
	}, [currentUrl]);

	const handleOpenExternal = React.useCallback(() => {
		try {
			window.open(currentUrl, '_blank', 'noopener,noreferrer');
		} catch {
			// Some Telegram WebView builds block window.open — at least navigate
			window.location.href = currentUrl;
		}
	}, [currentUrl]);

	const handleDismiss = React.useCallback(() => {
		try {
			sessionStorage.setItem(DISMISS_KEY, '1');
		} catch {
			AppStorage.setItem(DISMISS_KEY, '1');
		}
		setIsOpen(false);
	}, []);

	if (!isOpen) return null;

	return (
		<motion.div
			className={styles.backdrop}
			role="dialog"
			aria-modal="true"
			aria-label={t`Open Astral in a real browser`}
			initial={reducedMotion ? false : {opacity: 0}}
			animate={{opacity: 1}}
			exit={{opacity: 0}}
			transition={{duration: 0.28, ease: [0.22, 1, 0.36, 1]}}
		>
			<motion.div
				className={styles.card}
				initial={reducedMotion ? false : {opacity: 0, y: 18, scale: 0.985}}
				animate={reducedMotion ? {} : {opacity: 1, y: 0, scale: 1}}
				transition={{duration: 0.34, ease: [0.22, 1, 0.36, 1]}}
			>
				<div className={styles.iconShell} aria-hidden>
					<WarningIcon weight="fill" />
				</div>
				<h2 className={styles.title}>
					<Trans>You're in the Telegram browser</Trans>
				</h2>
				<p className={styles.body}>
					<Trans>
						Astral login, autofill, and calls don't work reliably inside the Telegram in-app browser. Open this
						page in Chrome, Safari, or Firefox and sign in there — it's a 10-second fix.
					</Trans>
				</p>

				<p className={styles.joke}>
					<Trans>
						Telegram's browser is like a hotel with no reception: you got in fine — the only way out is through
						the window.
					</Trans>
				</p>

				<div className={styles.urlRow}>
					<code className={styles.url}>{currentUrl}</code>
				</div>

				<div className={styles.actions}>
					<button type="button" className={styles.primaryAction} onClick={handleOpenExternal}>
						<ArrowSquareOutIcon weight="bold" />
						<span>
							<Trans>Open in my browser</Trans>
						</span>
					</button>
					<button type="button" className={styles.secondaryAction} onClick={handleCopy}>
						<CopyIcon weight="bold" />
						<span>{copied ? <Trans>Copied</Trans> : <Trans>Copy link</Trans>}</span>
					</button>
				</div>

				<button type="button" className={styles.dismissLink} onClick={handleDismiss}>
					<Trans>Continue anyway</Trans>
				</button>
			</motion.div>
		</motion.div>
	);
};
