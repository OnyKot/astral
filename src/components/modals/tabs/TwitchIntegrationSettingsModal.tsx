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
import React from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import * as Modal from '~/components/modals/Modal';
import StreamingTab from '~/components/modals/tabs/StreamingTab';
import styles from './TwitchIntegrationSettingsModal.module.css';

export const TwitchIntegrationSettingsModal: React.FC = observer(() => {
	const {t} = useLingui();

	return (
		<Modal.Root size="large" centered className={styles.modalRoot} onClose={() => ModalActionCreators.pop()}>
			<Modal.Header title={t`Streaming & Twitch`} />
			<Modal.Content className={styles.content} padding="none">
				<StreamingTab embedded={true} />
			</Modal.Content>
		</Modal.Root>
	);
});
