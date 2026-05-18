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
import type React from 'react';
import {SettingsSection} from '~/components/modals/shared/SettingsSection';
import {SettingsTabContainer, SettingsTabContent} from '~/components/modals/shared/SettingsTabLayout';
import {FavoritesTabContent} from './AppearanceTab/FavoritesTab';
import {InterfaceTabContent} from './AppearanceTab/InterfaceTab';
import {AppearanceTabPreview, MessagesTabContent} from './AppearanceTab/MessagesTab';
import {ThemeTabContent} from './AppearanceTab/ThemeTab';

const AppearanceTab: React.FC = observer(() => {
	const {t} = useLingui();

	return (
		<SettingsTabContainer>
			<SettingsTabContent>
				<SettingsSection
					id="theme"
					title={t`Theme`}
					description={t`Choose the main theme, sync behavior, style preset and the wallpaper used behind chat messages.`}
				>
					<ThemeTabContent />
				</SettingsSection>

				<SettingsSection
					id="messages"
					title={t`Messages`}
					description={t`Choose how messages are displayed in chat channels.`}
				>
					<MessagesTabContent />
				</SettingsSection>

				<SettingsSection
					id="interface"
					title={t`Interface`}
					description={t`Customize interface elements and behaviors.`}
				>
					<InterfaceTabContent />
				</SettingsSection>

				<SettingsSection
					id="favorites"
					title={t`Favorites`}
					description={t`Control the visibility of favorites throughout the app.`}
					isAdvanced
					defaultExpanded={false}
				>
					<FavoritesTabContent />
				</SettingsSection>
			</SettingsTabContent>
		</SettingsTabContainer>
	);
});

export {AppearanceTabPreview};
export default AppearanceTab;
