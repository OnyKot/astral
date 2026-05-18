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
import {CheckCircleIcon, MusicNotesIcon, WarningCircleIcon} from '@phosphor-icons/react';
import React from 'react';
import {Routes} from '~/Routes';
import AppStorage from '~/lib/AppStorage';
import {SPOTIFY_OAUTH_RESULT_KEY} from '~/stores/MusicPresenceStore';
import styles from './SpotifyConnectCallbackPage.module.css';

const SpotifyConnectCallbackPage: React.FC = () => {
	const {t} = useLingui();
	const params = React.useMemo(() => new URLSearchParams(window.location.search), []);
	const payload = React.useMemo(
		() => ({
			code: params.get('code') ?? undefined,
			state: params.get('state') ?? undefined,
			error: params.get('error') ?? undefined,
		}),
		[params],
	);
	const isError = Boolean(payload.error);

	React.useEffect(() => {
		AppStorage.setJSON(SPOTIFY_OAUTH_RESULT_KEY, payload);

		try {
			window.opener?.postMessage({type: 'spotify-oauth-result', payload}, window.location.origin);
		} catch {}

		const timeoutId = window.setTimeout(() => {
			try {
				window.close();
			} catch {}

			window.location.replace(Routes.ME);
		}, isError ? 2200 : 1400);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [isError, payload]);

	return (
		<div className={styles.page}>
			<div className={styles.shell}>
				<div className={styles.glow} aria-hidden="true" />
				<div className={styles.hero}>
					<div className={styles.brandMark}>A</div>
					<div className={styles.heroCopy}>
						<div className={styles.eyebrow}>
							<Trans>Astral Music Presence</Trans>
						</div>
						<div className={styles.title}>
							<Trans>Spotify handoff</Trans>
						</div>
						<div className={styles.description}>
							<Trans>Your listening card is being linked back into Astral.</Trans>
						</div>
					</div>
				</div>

				<div className={styles.statusCard}>
					<div className={isError ? `${styles.statusPill} ${styles.statusPillError}` : styles.statusPill}>
						{isError ? <WarningCircleIcon size={14} weight="fill" /> : <CheckCircleIcon size={14} weight="fill" />}
						<span>{isError ? t`Needs attention` : t`Connection complete`}</span>
					</div>

					<div className={styles.statusHeading}>
						{isError ? <Trans>Spotify returned an error</Trans> : <Trans>Spotify connection complete</Trans>}
					</div>

					<div className={styles.statusText}>
						{isError ? (
							<Trans>Astral received the callback, but Spotify returned an error. You can return and try again.</Trans>
						) : (
							<Trans>Authorization was accepted. Astral will close this window and refresh your music settings shortly.</Trans>
						)}
					</div>

					<div className={styles.stepGrid}>
						<div className={styles.step}>
							<div className={styles.stepNumber}>
								<Trans>Step 1</Trans>
							</div>
							<div className={styles.stepLabel}>
								<Trans>Approve Spotify access</Trans>
							</div>
						</div>
						<div className={styles.step}>
							<div className={styles.stepNumber}>
								<Trans>Step 2</Trans>
							</div>
							<div className={styles.stepLabel}>
								<Trans>Return the token to Astral</Trans>
							</div>
						</div>
						<div className={`${styles.step} ${styles.stepActive}`}>
							<div className={styles.stepNumber}>
								<Trans>Step 3</Trans>
							</div>
							<div className={styles.stepLabel}>
								{isError ? <Trans>Retry the connection</Trans> : <Trans>Update your live music card</Trans>}
							</div>
						</div>
					</div>
				</div>

				<div className={styles.footer}>
					<div className={styles.footerNote}>
						{isError ? (
							<Trans>Returning you to Astral so you can try the Spotify flow again.</Trans>
						) : (
							<Trans>You can close this window now, but Astral will also handle it automatically.</Trans>
						)}
					</div>
					<a className={styles.returnButton} href={Routes.ME}>
						<MusicNotesIcon size={16} weight="fill" />
						<span>{isError ? t`Return to Astral` : t`Back to Astral`}</span>
					</a>
				</div>
			</div>
		</div>
	);
};

export default SpotifyConnectCallbackPage;
