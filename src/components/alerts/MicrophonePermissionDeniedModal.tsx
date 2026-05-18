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

import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {ConfirmModal} from '~/components/modals/ConfirmModal';
import {openNativePermissionSettings} from '~/utils/NativePermissions';
import {isNativeAndroidApp} from '~/utils/AndroidAppInfo';
import {isDesktop, isNativeMacOS} from '~/utils/NativeUtils';

export const MicrophonePermissionDeniedModal = observer(() => {
	const {t} = useLingui();

	if (isNativeAndroidApp()) {
		return (
			<ConfirmModal
				title={t`Microphone Permission Required`}
				description={t`Astral needs microphone access for voice chat and calls. Open Android app settings, allow microphone access, and return to the app.`}
				primaryText={t`Open Settings`}
				primaryVariant="primary"
				onPrimary={() => openNativePermissionSettings('microphone')}
				secondaryText={t`Close`}
			/>
		);
	}

	if (isDesktop() && isNativeMacOS()) {
		return (
			<ConfirmModal
				title={t`Microphone Permission Required`}
				description={t`Astral needs access to your microphone. Open System Settings → Privacy & Security → Microphone, allow Astral, and then restart the app.`}
				primaryText={t`Open Settings`}
				primaryVariant="primary"
				onPrimary={() => openNativePermissionSettings('microphone')}
				secondaryText={t`Close`}
			/>
		);
	}

	const message = isDesktop()
		? t`Astral needs access to your microphone. Allow microphone access in your operating system privacy settings and restart the app.`
		: t`Astral needs access to your microphone to enable voice chat. Please grant microphone permission in your browser settings and try again.`;

	return (
		<ConfirmModal
			title={t`Microphone Permission Required`}
			description={message}
			primaryText={t`Understood`}
			onPrimary={() => {}}
		/>
	);
});
