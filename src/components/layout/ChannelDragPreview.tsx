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

import {FolderIcon, HashStraightIcon} from '@phosphor-icons/react';
import {createPortal} from 'react-dom';
import {useDragLayer} from 'react-dnd';
import type {DragItem} from './types/dnd';
import {DND_TYPES} from './types/dnd';
import ChannelStore from '~/stores/ChannelStore';
import * as ChannelUtils from '~/utils/ChannelUtils';
import styles from './ChannelDragPreview.module.css';

const PREVIEW_OFFSET_X = 16;
const PREVIEW_OFFSET_Y = 14;

export const ChannelDragPreview = () => {
	const {isDragging, item, currentOffset} = useDragLayer((monitor) => ({
		item: monitor.getItem() as DragItem | null,
		isDragging: monitor.isDragging(),
		currentOffset: monitor.getClientOffset(),
	}));

	const isChannelDrag = item?.type === DND_TYPES.CHANNEL || item?.type === DND_TYPES.CATEGORY;
	if (!isDragging || !isChannelDrag || !item || !currentOffset) return null;

	const channel = ChannelStore.getChannel(item.id);
	const dragName = channel?.name ?? 'Channel';
	const icon = item.type === DND_TYPES.CATEGORY
		? <FolderIcon weight="fill" className={styles.dragPreviewIcon} />
		: channel
			? ChannelUtils.getIcon(channel, {className: styles.dragPreviewIcon})
			: <HashStraightIcon weight="bold" className={styles.dragPreviewIcon} />;

	return createPortal(
		<div className={styles.dragLayer} aria-hidden>
			<div
				className={styles.dragPreview}
				style={{
					transform: `translate3d(${currentOffset.x + PREVIEW_OFFSET_X}px, ${currentOffset.y + PREVIEW_OFFSET_Y}px, 0)`,
				}}
			>
				<span className={styles.dragPreviewIconWrap}>{icon}</span>
				<span className={styles.dragPreviewLabel}>{dragName}</span>
			</div>
		</div>,
		document.body,
	);
};
