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
import {AstralIcon} from '~/components/icons/AstralIcon';
import {Button} from '~/components/uikit/Button/Button';
import {useAstralDocumentTitle} from '~/hooks/useAstralDocumentTitle';
import {Link} from '~/lib/router';
import {Routes} from '~/Routes';
import styles from './NotFoundPage.module.css';

export const NotFoundPage = observer(function NotFoundPage() {
	useAstralDocumentTitle('Not Found');

	return (
		<div className={styles.container}>
			<AstralIcon className={styles.icon} />
			<div className={styles.content}>
				<h1 className={styles.title}>
					<Trans>404: Page Not Found</Trans>
				</h1>
				<p className={styles.description}>
					<Trans>The page you're looking for doesn't exist or has been moved.</Trans>
				</p>
			</div>
			<div className={styles.actions}>
				<Link to={Routes.ME}>
					<Button>
						<Trans>Go to Home</Trans>
					</Button>
				</Link>
			</div>
		</div>
	);
});
