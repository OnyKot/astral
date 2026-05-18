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
import {SettingsSection} from '~/components/modals/shared/SettingsSection';
import {SettingsTabContainer, SettingsTabContent} from '~/components/modals/shared/SettingsTabLayout';
import type {ChatTab} from '~/components/modals/utils/settingsConstants';
import {AiTabContent} from './ChatSettingsTab/AiTab';
import {DisplayTabContent} from './ChatSettingsTab/DisplayTab';
import {InputTabContent} from './ChatSettingsTab/InputTab';
import {InteractionTabContent} from './ChatSettingsTab/InteractionTab';
import {MediaTabContent} from './ChatSettingsTab/MediaTab';

interface ChatSettingsTabProps {
	initialSubtab?: ChatTab;
}

const ChatSettingsTab: React.FC<ChatSettingsTabProps> = observer(({initialSubtab}) => {
	const {t} = useLingui();
	const [expandedSections, setExpandedSections] = React.useState(() => ({
		interaction: initialSubtab === 'interaction',
		ai: initialSubtab === 'ai',
	}));

	React.useEffect(() => {
		if (!initialSubtab) {
			return;
		}

		if (initialSubtab === 'interaction' || initialSubtab === 'ai') {
			setExpandedSections((previous) => ({
				...previous,
				[initialSubtab]: true,
			}));
		}

		const scrollTarget = document.getElementById(initialSubtab);
		const scrollContainer = scrollTarget?.closest('[data-settings-scroll-container]') as HTMLElement | null;
		if (!scrollTarget || !scrollContainer) {
			return;
		}

		requestAnimationFrame(() => {
			const containerRect = scrollContainer.getBoundingClientRect();
			const targetRect = scrollTarget.getBoundingClientRect();
			const scrollTop = scrollContainer.scrollTop + (targetRect.top - containerRect.top) - 24;
			scrollContainer.scrollTo({top: Math.max(0, scrollTop), behavior: 'auto'});
		});
	}, [initialSubtab]);

	return (
		<SettingsTabContainer>
			<SettingsTabContent>
				<SettingsSection
					id="display"
					title={t`Display`}
					description={t`Control how messages, media, and other content are displayed.`}
				>
					<DisplayTabContent />
				</SettingsSection>

				<SettingsSection id="media" title={t`Media`} description={t`Customize media size preferences and buttons.`}>
					<MediaTabContent />
				</SettingsSection>

				<SettingsSection id="input" title={t`Input`} description={t`Customize message input settings.`}>
					<InputTabContent />
				</SettingsSection>

				<SettingsSection
					id="interaction"
					title={t`Interaction`}
					description={t`Configure message interaction settings.`}
					isAdvanced
					defaultExpanded={false}
					expanded={expandedSections.interaction}
					onExpandedChange={(expanded) =>
						setExpandedSections((previous) => ({
							...previous,
							interaction: expanded,
						}))
					}
				>
					<InteractionTabContent />
				</SettingsSection>

				<SettingsSection
					id="ai"
					title={t`AI Assistant`}
					description={t`Configure built-in /ai command and model settings.`}
					isAdvanced
					defaultExpanded={false}
					expanded={expandedSections.ai}
					onExpandedChange={(expanded) =>
						setExpandedSections((previous) => ({
							...previous,
							ai: expanded,
						}))
					}
				>
					<AiTabContent />
				</SettingsSection>
			</SettingsTabContent>
		</SettingsTabContainer>
	);
});

export default ChatSettingsTab;
