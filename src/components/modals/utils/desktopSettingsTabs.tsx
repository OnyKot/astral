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

import type React from 'react';
import AccessibilityTab from '../tabs/AccessibilityTab';
import AccountSecurityTab from '../tabs/AccountSecurityTab';
import AdvancedTab from '../tabs/AdvancedTab';
import AccountIntegrationsTab from '../tabs/AccountIntegrationsTab';
import AppearanceTab from '../tabs/AppearanceTab';
import ApplicationsTab from '../tabs/ApplicationsTab';
import AuthorizedAppsTab from '../tabs/AuthorizedAppsTab';
import BetaCodesTab from '../tabs/BetaCodesTab';
import BlockedUsersTab from '../tabs/BlockedUsersTab';
import ChatSettingsTab from '../tabs/ChatSettingsTab';
import ComponentGalleryTab from '../tabs/ComponentGalleryTab';
import DeveloperOptionsTab from '../tabs/DeveloperOptionsTab';
import DevicesTab from '../tabs/DevicesTab';
import ExpressionPacksTab from '../tabs/ExpressionPacksTab';
import FeatureFlagsTab from '../tabs/FeatureFlagsTab';
import GiftInventoryTab from '../tabs/GiftInventoryTab';
import KeybindsTab from '../tabs/KeybindsTab';
import LanguageTab from '../tabs/LanguageTab';
import MusicConnectionsTab from '../tabs/MusicConnectionsTab';
import MyProfileTab from '../tabs/MyProfileTab';
import NotificationsTab from '../tabs/NotificationsTab';
import PlutoniumTab from '../tabs/PlutoniumTab';
import PrivacySafetyTab from '../tabs/PrivacySafetyTab';
import StreamingTab from '../tabs/StreamingTab';
import VoiceVideoTab from '../tabs/VoiceVideoTab';
import type {UserSettingsTabType} from './settingsConstants';

const DESKTOP_TAB_COMPONENTS: Partial<Record<UserSettingsTabType, React.ComponentType<any>>> = {
	my_profile: MyProfileTab,
	account_security: AccountSecurityTab,
	beta_codes: BetaCodesTab,
	plutonium: PlutoniumTab,
	gift_inventory: GiftInventoryTab,
	privacy_safety: PrivacySafetyTab,
	authorized_apps: AuthorizedAppsTab,
	blocked_users: BlockedUsersTab,
	devices: DevicesTab,
	music_connections: MusicConnectionsTab,
	streaming: StreamingTab,
	appearance: AppearanceTab,
	accessibility: AccessibilityTab,
	chat_settings: ChatSettingsTab,
	account_integrations: AccountIntegrationsTab,
	voice_video: VoiceVideoTab,
	keybinds: KeybindsTab,
	notifications: NotificationsTab,
	language: LanguageTab,
	advanced: AdvancedTab,
	applications: ApplicationsTab,
	feature_flags: FeatureFlagsTab,
	developer_options: DeveloperOptionsTab,
	component_gallery: ComponentGalleryTab,
	expression_packs: ExpressionPacksTab,
};

export const getSettingsTabComponent = (tabType: UserSettingsTabType): React.ComponentType<any> | null => {
	return DESKTOP_TAB_COMPONENTS[tabType] ?? null;
};
