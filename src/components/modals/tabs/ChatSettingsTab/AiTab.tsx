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
import * as AccessibilityActionCreators from '~/actions/AccessibilityActionCreators';
import {Input} from '~/components/form/Input';
import {SettingsTabSection} from '~/components/modals/shared/SettingsTabLayout';
import {Button} from '~/components/uikit/Button/Button';
import {DEFAULT_OPENROUTER_MODEL, OPENROUTER_MODEL_PRESETS} from '~/services/OpenRouterService';
import AccessibilityStore from '~/stores/AccessibilityStore';

const rowStyle: React.CSSProperties = {
	display: 'grid',
	gap: '12px',
};

const presetsStyle: React.CSSProperties = {
	display: 'flex',
	flexWrap: 'wrap',
	gap: '8px',
};

export const AiTabContent: React.FC = observer(() => {
	const {t} = useLingui();
	const openRouterApiKey = AccessibilityStore.openRouterApiKey;
	const openRouterModel = AccessibilityStore.openRouterModel || DEFAULT_OPENROUTER_MODEL;

	return (
		<SettingsTabSection
			title={t`AI Assistant`}
			description={t`Configure /ai command provider settings for this device.`}
		>
			<div style={rowStyle}>
				<Input
					label={t`OpenRouter API Key`}
					type="password"
					value={openRouterApiKey}
					placeholder={t`sk-or-v1-...`}
					onChange={(event) =>
						AccessibilityActionCreators.update({
							openRouterApiKey: event.currentTarget.value,
						})
					}
					footer={
						<span style={{color: 'var(--text-muted)', fontSize: '12px'}}>
							{openRouterApiKey.trim()
								? t`Stored locally on this device.`
								: t`Required to execute /ai commands.`}
						</span>
					}
				/>

				<Input
					label={t`OpenRouter Model`}
					type="text"
					value={openRouterModel}
					placeholder={DEFAULT_OPENROUTER_MODEL}
					onChange={(event) =>
						AccessibilityActionCreators.update({
							openRouterModel: event.currentTarget.value,
						})
					}
					footer={
						<span style={{color: 'var(--text-muted)', fontSize: '12px'}}>
							{t`Example: openai/gpt-4o-mini, anthropic/claude-3.5-haiku`}
						</span>
					}
				/>

				<div style={presetsStyle}>
					{OPENROUTER_MODEL_PRESETS.map((modelPreset) => (
						<Button
							key={modelPreset}
							variant={openRouterModel === modelPreset ? 'primary' : 'secondary'}
							small
							onClick={() =>
								AccessibilityActionCreators.update({
									openRouterModel: modelPreset,
								})
							}
						>
							{modelPreset}
						</Button>
					))}
				</div>

				<div style={{color: 'var(--text-secondary)', fontSize: '13px'}}>
					{t`Use /ai <prompt> in chat to generate text with the selected model.`}
				</div>
			</div>
		</SettingsTabSection>
	);
});
