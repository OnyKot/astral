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
import {PaletteIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import {useCallback} from 'react';
import * as AuthenticationActionCreators from '~/actions/AuthenticationActionCreators';
import * as ThemeActionCreators from '~/actions/ThemeActionCreators';
import {AuthBottomLink} from '~/components/auth/AuthBottomLink';
import {AuthErrorState} from '~/components/auth/AuthErrorState';
import {AuthLoadingState} from '~/components/auth/AuthLoadingState';
import {AuthMinimalRegisterFormCore} from '~/components/auth/AuthMinimalRegisterFormCore';
import {AuthPageHeader} from '~/components/auth/AuthPageHeader';
import sharedStyles from '~/components/auth/AuthPageStyles.module.css';
import {DesktopDeepLinkPrompt} from '~/components/auth/DesktopDeepLinkPrompt';
import {useAstralDocumentTitle} from '~/hooks/useAstralDocumentTitle';
import {useThemeExists} from '~/hooks/useThemeExists';
import {useParams} from '~/lib/router';
import {Routes} from '~/Routes';

const ThemeRegisterPage = observer(function ThemeRegisterPage() {
	const {t, i18n} = useLingui();
	const {themeId} = useParams() as {themeId: string};
	const themeStatus = useThemeExists(themeId);

	const handleRegisterComplete = useCallback(
		async (response: {token: string; user_id: string}) => {
			await AuthenticationActionCreators.completeLogin({
				token: response.token,
				userId: response.user_id,
			});
			ThemeActionCreators.openAcceptModal(themeId, i18n);
		},
		[themeId, i18n],
	);

	useAstralDocumentTitle(t`Apply Theme`);

	if (themeStatus === 'loading') {
		return <AuthLoadingState />;
	}

	if (themeStatus === 'error') {
		return (
			<AuthErrorState
				title={<Trans>Theme not found</Trans>}
				text={<Trans>This theme may have been removed or the link is invalid.</Trans>}
			/>
		);
	}

	return (
		<div className={sharedStyles.container}>
			<DesktopDeepLinkPrompt code={themeId} kind="theme" />

			<AuthPageHeader
				icon={
					<div className={sharedStyles.themeIconSpot}>
						<PaletteIcon className={sharedStyles.themeIcon} weight="fill" />
					</div>
				}
				title={t`You've got CSS!`}
				subtitle={t`Shared theme`}
			/>

			<AuthMinimalRegisterFormCore
				submitLabel={<Trans>Create account</Trans>}
				redirectPath={Routes.ME}
				onRegister={handleRegisterComplete}
				extraContent={
					<p className={sharedStyles.subtext}>
						<Trans>Once your account is created, you will land in your messages and can apply this theme from there.</Trans>
					</p>
				}
			/>

			<AuthBottomLink variant="login" to={Routes.themeLogin(themeId)} />
		</div>
	);
});

export default ThemeRegisterPage;
