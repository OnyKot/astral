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
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import AppStorage from '~/lib/AppStorage';
import {Nagbar} from '~/components/layout/Nagbar';
import {NagbarButton} from '~/components/layout/NagbarButton';
import {NagbarContent} from '~/components/layout/NagbarContent';
import {PhoneAddModal} from '~/components/modals/PhoneAddModal';
import UserStore from '~/stores/UserStore';
import {PHONE_VERIFICATION_DISMISS_KEY, PHONE_VERIFICATION_SNOOZE_MS} from '../types';

export const PhoneVerificationNagbar = observer(({isMobile}: {isMobile: boolean}) => {
	const user = UserStore.currentUser;
	if (!user) {
		return null;
	}

	const openPhoneModal = () => {
		ModalActionCreators.push(modal(() => <PhoneAddModal />));
	};

	const handleDismiss = () => {
		const dismissedUntil = Date.now() + PHONE_VERIFICATION_SNOOZE_MS;
		AppStorage.setItem(PHONE_VERIFICATION_DISMISS_KEY, String(dismissedUntil));
	};

	return (
		<Nagbar isMobile={isMobile} backgroundColor="#4c6fff" textColor="#ffffff">
			<NagbarContent
				isMobile={isMobile}
				message={<Trans>Hey {user.displayName}, please verify your phone number.</Trans>}
				actions={
					<>
						<NagbarButton isMobile={isMobile} onClick={openPhoneModal}>
							<Trans>Verify phone</Trans>
						</NagbarButton>
						<NagbarButton isMobile={isMobile} onClick={handleDismiss}>
							<Trans>Later</Trans>
						</NagbarButton>
					</>
				}
			/>
		</Nagbar>
	);
});
