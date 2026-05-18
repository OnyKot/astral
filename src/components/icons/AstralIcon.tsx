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
import logoGlyph from '../../../logo.svg';

export const AstralIcon = observer((props: React.SVGProps<SVGSVGElement>) => {
	const {t} = useLingui();

	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 512 512"
			role="img"
			aria-label={t`Astral application icon`}
			{...props}
		>
			<rect fill="var(--brand-primary)" height={512} rx={256} width={512} />
			<image
				href={logoGlyph}
				x={96}
				y={90}
				width={320}
				height={332}
				preserveAspectRatio="xMidYMid meet"
			/>
		</svg>
	);
});
