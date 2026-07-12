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
import {AnimatePresence, motion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import {entrance} from '~/lib/motion/effects';
import dividerStyles from './Divider.module.css';
import styles from './Messages.module.css';

type UnreadDividerSlotProps =
	| {beforeId: string; afterId?: never; visible: boolean}
	| {afterId: string; beforeId?: never; visible: boolean};

export const UnreadDividerSlot = observer(function UnreadDividerSlot(props: UnreadDividerSlotProps) {
	const data: Record<string, string> = {'data-divider-slot': 'unread'};
	if ('beforeId' in props && props.beforeId !== undefined) data['data-before-id'] = props.beforeId;
	if ('afterId' in props && props.afterId !== undefined) data['data-after-id'] = props.afterId;

	/*
	 * The visible divider used to be aria-hidden which meant screen
	 * readers literally jumped past the "unread boundary" with no
	 * indication that the next message was new. Mark the visible state
	 * as a polite live region with a real label so the divider is
	 * announced once when it appears (and only when visible — the
	 * hidden placeholder branch stays aria-hidden).
	 *
	 * The "New" badge pops in with a bouncy spring (physics, not linear)
	 * so the unread boundary feels like it physically materializes rather
	 * than snapping in.
	 */
	return (
		<div
			className={styles.unreadSlot}
			aria-hidden={props.visible ? undefined : 'true'}
			role={props.visible ? 'separator' : undefined}
			aria-live={props.visible ? 'polite' : undefined}
			aria-label={props.visible ? 'New messages below' : undefined}
			id={props.visible ? 'new-messages-bar' : undefined}
			data-visible={props.visible ? '1' : undefined}
			{...(data as any)}
		>
			<div className={dividerStyles.unreadContainer}>
				<div className={dividerStyles.unreadLine} />
				<AnimatePresence>
					{props.visible && (
						<motion.span
							key="unread-badge"
							className={dividerStyles.unreadBadge}
							{...entrance('springPop')}
						>
							<Trans>New</Trans>
						</motion.span>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
});
