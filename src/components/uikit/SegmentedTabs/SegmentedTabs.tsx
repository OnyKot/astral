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
import {motion} from 'framer-motion';
import type React from 'react';
import styles from './SegmentedTabs.module.css';

export type SegmentedTab<T extends string = string> = {
	id: T;
	label: string;
	ariaLabel?: string;
	icon?: React.ComponentType<{className?: string; weight?: 'regular' | 'bold' | 'fill'}>;
};

type SegmentedTabsProps<T extends string = string> = {
	tabs: Array<SegmentedTab<T>>;
	selectedTab: T;
	onTabChange: (tab: T) => void;
	ariaLabel?: string;
	className?: string;
};

export function SegmentedTabs<T extends string = string>({
	tabs,
	selectedTab,
	onTabChange,
	ariaLabel,
	className,
}: SegmentedTabsProps<T>) {
	const selectedIndex = tabs.findIndex((tab) => tab.id === selectedTab);
	const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
		if (event.pointerType === 'touch') {
			(event.currentTarget as HTMLButtonElement).blur();
		}
	};

	return (
		<div className={clsx(styles.container, className)}>
			<div className={styles.tabList} role="tablist" aria-label={ariaLabel}>
				{tabs.map((tab) => {
					const Icon = tab.icon;

					return (
						<button
							key={tab.id}
							type="button"
							role="tab"
							aria-label={tab.ariaLabel ?? tab.label}
							aria-selected={selectedTab === tab.id}
							onPointerDown={handlePointerDown}
							onClick={() => onTabChange(tab.id)}
							className={clsx(styles.tab, selectedTab === tab.id ? styles.tabActive : styles.tabInactive)}
						>
							{Icon ? <Icon className={styles.tabIcon} weight={selectedTab === tab.id ? 'bold' : 'regular'} /> : null}
							<span className={styles.tabLabel}>{tab.label}</span>
						</button>
					);
				})}
				<motion.div
					className={styles.tabBackground}
					layout
					transition={{
						type: 'spring',
						stiffness: 500,
						damping: 35,
					}}
					style={{
						width: `calc((100% - 6px) / ${tabs.length})`,
						left: `calc(3px + (100% - 6px) * ${selectedIndex} / ${tabs.length})`,
					}}
				/>
			</div>
		</div>
	);
}
