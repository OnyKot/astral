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
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import ChannelListLayoutStore from '~/stores/ChannelListLayoutStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import {ResizeHandle} from './ResizeHandle';
import LayoutSizingStore from '~/stores/LayoutSizingStore';
import styles from './GuildNavbar.module.css';

interface GuildSidebarProps {
	header: React.ReactNode;
	content: React.ReactNode;
	roundTopLeft?: boolean;
	resizeable?: boolean;
}

export const GuildSidebar = observer(({header, content, roundTopLeft = true, resizeable = false}: GuildSidebarProps) => {
	const {t} = useLingui();
	const mobileLayout = MobileLayoutStore;
	const sidebarCollapsed = !mobileLayout.enabled && ChannelListLayoutStore.getSidebarCollapsed();

	return (
		<div
			className={clsx(
				styles.guildNavbarContainer,
				sidebarCollapsed && styles.guildNavbarContainerCollapsed,
				mobileLayout.enabled && styles.guildNavbarContainerMobile,
			)}
			style={roundTopLeft ? undefined : {borderTopLeftRadius: 0}}
		>
			<div className={styles.sidebarInner}>
				{header}
				{content}
			</div>
			{resizeable && !sidebarCollapsed && (
				<ResizeHandle
					direction="right"
					getSize={() => LayoutSizingStore.sidebarWidthPx}
					onResize={(px) => {
						LayoutSizingStore.previewSidebarWidth(px);
					}}
					onResizeEnd={(px) => {
						LayoutSizingStore.commitSidebarWidth(px);
					}}
					onReset={() => {
						LayoutSizingStore.resetSidebar();
					}}
					ariaLabel={t`Resize community list`}
				/>
			)}
		</div>
	);
});
