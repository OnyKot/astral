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

import type {IconProps} from '@phosphor-icons/react';
import React from 'react';

export const FriendsIcon = React.forwardRef<SVGSVGElement, IconProps>(({size = 24, className, ...props}, ref) => (
	<svg
		ref={ref}
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		className={className}
		aria-hidden={true}
		{...props}
	>
		<circle cx="8.5" cy="8.5" r="2.75" stroke="currentColor" strokeWidth="1.9" />
		<circle cx="15.75" cy="9.25" r="2.25" stroke="currentColor" strokeWidth="1.9" />
		<path
			d="M3.25 18.35C3.25 15.67 5.42 13.5 8.1 13.5H10.1C12.78 13.5 14.95 15.67 14.95 18.35"
			stroke="currentColor"
			strokeWidth="1.9"
			strokeLinecap="round"
		/>
		<path
			d="M13.55 14.7H16.2C18.44 14.7 20.25 16.51 20.25 18.75"
			stroke="currentColor"
			strokeWidth="1.9"
			strokeLinecap="round"
		/>
	</svg>
));

