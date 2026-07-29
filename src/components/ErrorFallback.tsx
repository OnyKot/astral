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
import {observer} from 'mobx-react-lite';
import React from 'react';
import errorFallbackStyles from '~/components/ErrorFallback.module.css';
import {AstralIcon} from '~/components/icons/AstralIcon';
import {NativeTitlebar} from '~/components/layout/NativeTitlebar';
import {Button} from '~/components/uikit/Button/Button';
import {useNativePlatform} from '~/hooks/useNativePlatform';
import {ensureLatestAssets} from '~/lib/versioning';
import UpdaterStore from '~/stores/UpdaterStore';
import {factoryReset, reloadAppHard} from '~/utils/factoryReset';

interface ErrorFallbackProps {
	error?: Error;
	eventId?: string;
	resetError?: () => void;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = observer(({error, eventId}) => {
	const {platform, isNative, isMacOS} = useNativePlatform();
	const [updateAvailable, setUpdateAvailable] = React.useState(false);
	const [isUpdating, setIsUpdating] = React.useState(false);
	const [isResetting, setIsResetting] = React.useState(false);
	const [checkingForUpdates, setCheckingForUpdates] = React.useState(true);

	React.useEffect(() => {
		let isMounted = true;

		const run = async () => {
			try {
				const timeout = new Promise<{updateFound: false}>((resolve) => {
					window.setTimeout(() => resolve({updateFound: false}), 4500);
				});
				const {updateFound} = await Promise.race([ensureLatestAssets({force: true}), timeout]);
				if (isMounted) {
					setUpdateAvailable(updateFound);
				}
			} catch (error) {
				console.error('[ErrorFallback] Failed to check for updates:', error);
			} finally {
				if (isMounted) {
					setCheckingForUpdates(false);
				}
			}
		};

		void run();

		return () => {
			isMounted = false;
		};
	}, []);

	const handleUpdate = React.useCallback(async () => {
		setIsUpdating(true);
		try {
			const {updateFound} = await ensureLatestAssets({force: true});
			if (updateFound) {
				await UpdaterStore.applyUpdate();
				return;
			}
			setIsUpdating(false);
			await reloadAppHard();
		} catch (error) {
			console.error('[ErrorFallback] Failed to apply update:', error);
			setIsUpdating(false);
		}
	}, []);

	return (
		<div className={errorFallbackStyles.errorFallbackContainer}>
			{isNative && !isMacOS && <NativeTitlebar platform={platform} />}
			<AstralIcon className={errorFallbackStyles.errorFallbackIcon} />
			<div className={errorFallbackStyles.errorFallbackContent}>
				<h1 className={errorFallbackStyles.errorFallbackTitle}>
					<Trans>Whoa, this is heavy.</Trans>
				</h1>
				<p className={errorFallbackStyles.errorFallbackDescription}>
					{checkingForUpdates ? (
						<Trans>The app has crashed. Checking for updates that might fix this issue...</Trans>
					) : updateAvailable ? (
						<Trans>Something went wrong and the app crashed. An update is available that may fix this issue.</Trans>
					) : (
						<Trans>Something went wrong and the app crashed. Try reloading or resetting the app.</Trans>
					)}
				</p>
			</div>
			<div className={errorFallbackStyles.errorFallbackActions}>
				<Button
					onClick={updateAvailable ? handleUpdate : reloadAppHard}
					disabled={isUpdating || isResetting}
				>
					{isUpdating ? (
						<Trans>Updating...</Trans>
					) : checkingForUpdates || updateAvailable ? (
						<Trans>Update app</Trans>
					) : (
						<Trans>Reload app</Trans>
					)}
				</Button>
				<Button
					onClick={async () => {
						setIsResetting(true);
						try {
							await factoryReset();
						} finally {
							reloadAppHard();
						}
					}}
					variant="danger-primary"
					disabled={isResetting || isUpdating}
				>
					{isResetting ? <Trans>Resetting...</Trans> : <Trans>Reset app data</Trans>}
				</Button>
			</div>
			{(error || eventId) && (
				<p className={errorFallbackStyles.errorFallbackDiagnostics}>
					{error?.name ? <code>{error.name}</code> : null}
					{error?.name && eventId ? ' · ' : null}
					{eventId ? <code>id: {eventId}</code> : null}
				</p>
			)}
		</div>
	);
});
