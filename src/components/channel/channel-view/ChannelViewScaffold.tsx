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
import type React from 'react';
import styles from '../ChannelIndexPage.module.css';

interface ChannelViewScaffoldProps {
	header: React.ReactNode;
	chatArea: React.ReactNode;
	sidePanel?: React.ReactNode | null;
	showMemberListDivider?: boolean;
	className?: string;
}

export const ChannelViewScaffold: React.FC<ChannelViewScaffoldProps> = ({
	header,
	chatArea,
	sidePanel = null,
	showMemberListDivider = false,
	className,
}) => {
	return (
		<div className={clsx(styles.channelGrid, className)}>
			<div>{header}</div>
			<div className={styles.contentGrid}>
				{showMemberListDivider && <div className={styles.memberListDivider} />}
				{chatArea}
				{sidePanel}
			</div>
		</div>
	);
};
