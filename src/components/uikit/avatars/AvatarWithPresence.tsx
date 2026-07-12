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
import type React from 'react';
import {StatusAwareAvatar} from '~/components/uikit/StatusAwareAvatar';
import type {UserRecord} from '~/records/UserRecord';
import styles from './AvatarWithPresence.module.css';

type AvatarWithPresenceSize = React.ComponentProps<typeof StatusAwareAvatar>['size'];

interface Props {
	user: UserRecord;
	size: AvatarWithPresenceSize;
	speaking?: boolean;
	className?: string;
	title?: string;
	borderClassName?: string;
	guildId?: string | null;
	disablePresence?: boolean;
}

export const AvatarWithPresence: React.FC<Props> = observer(function AvatarWithPresence({
	user,
	size,
	speaking,
	className,
	title,
	borderClassName,
	guildId,
	disablePresence,
}) {
	return (
		<div
			className={clsx(styles.container, borderClassName, className)}
			style={{width: size, height: size}}
			title={title ?? user.username}
		>
			<div className={clsx(styles.imageWrapper, speaking && styles.imageWrapperSpeaking)}>
				<StatusAwareAvatar
					user={user}
					size={size}
					guildId={guildId}
					className={styles.image}
					disablePresence={disablePresence}
					disableStatusTooltip={true}
				/>
			</div>
		</div>
	);
});
