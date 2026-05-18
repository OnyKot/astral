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
import {observer} from 'mobx-react-lite';
import * as AuthenticationActionCreators from '~/actions/AuthenticationActionCreators';
import {ConfirmModal} from '~/components/modals/ConfirmModal';

export const LogoutModal = observer(() => {
	const {t} = useLingui();
	return (
		<ConfirmModal
			title={t`Leaving so soon?`}
			description={<Trans>Hope to see you back in the future</Trans>}
			primaryText={t`Hit 88mph`}
			secondaryText={t`I changed my mind`}
			onPrimary={() => AuthenticationActionCreators.logout()}
		/>
	);
});
