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

import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type {AnchorHTMLAttributes, FC, MouseEventHandler} from 'react';
import {useRef} from 'react';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {getElectronAPI, isElectron, openExternalUrl} from '~/utils/NativeUtils';
import styles from './ExternalLink.module.css';

type ExternalLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
	href: string;
	children: React.ReactNode;
	forceExternal?: boolean;
};

function isSameOrigin(url: string): boolean {
	try {
		return new URL(url, window.location.href).origin === window.location.origin;
	} catch {
		return false;
	}
}

export const ExternalLink: FC<ExternalLinkProps> = observer(({href, children, className, forceExternal, ...props}) => {
	const linkRef = useRef<HTMLAnchorElement>(null);

	const handleClick: MouseEventHandler<HTMLAnchorElement> = async (event) => {
		event.preventDefault();
		event.stopPropagation();

		if (forceExternal) {
			await openExternalUrl(href);
			return;
		}

		if (isElectron()) {
			if (isSameOrigin(href)) {
				window.open(href, '_blank', 'noopener,noreferrer');
			} else {
				const electronApi = getElectronAPI();
				if (electronApi) {
					await electronApi.openExternal(href);
				} else {
					window.open(href, '_blank', 'noopener,noreferrer');
				}
			}
			return;
		}

		await openExternalUrl(href);
	};

	return (
		<FocusRing ringTarget={linkRef}>
			<a
				ref={linkRef}
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				className={clsx(styles.externalLink, className)}
				onClick={handleClick}
				{...props}
			>
				{children}
			</a>
		</FocusRing>
	);
});
