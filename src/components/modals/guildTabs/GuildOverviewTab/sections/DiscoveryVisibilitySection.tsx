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
import type React from 'react';
import type {UseFormReturn} from 'react-hook-form';
import {Controller} from 'react-hook-form';
import {Switch} from '~/components/form/Switch';
import type {FormInputs} from '~/utils/modals/guildTabs/GuildOverviewTabUtils';
import {SettingsSection} from '../components/SettingsSection';

export const DiscoveryVisibilitySection: React.FC<{
	form: UseFormReturn<FormInputs>;
	canManageGuild: boolean;
}> = ({form, canManageGuild}) => {
	const {t} = useLingui();

	return (
		<SettingsSection
			title={<Trans>Discovery Visibility</Trans>}
			description={<Trans>Control whether this community is listed in Community Discovery</Trans>}
		>
			<Controller
				name="discovery_visible"
				control={form.control}
				render={({field}) => (
					<Switch
						label={t`Show this community in Discovery`}
						description={t`When disabled, this community is hidden from Discovery listings and search.`}
						value={field.value ?? true}
						onChange={field.onChange}
						disabled={!canManageGuild}
					/>
				)}
			/>
		</SettingsSection>
	);
};
