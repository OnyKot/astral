/*
 * Copyright (C) 2026 Astral Contributors
 *
 * This file is part of Astral.
 *
 * Astral is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import type React from 'react';
import styles from './ReconnectOrbit.module.css';

export const ReconnectOrbit: React.FC<{
	className?: string;
	size?: 'compact' | 'default' | 'large';
}> = ({className, size = 'default'}) => {
	const {t} = useLingui();

	return (
		<div
			className={clsx(styles.orbit, size === 'compact' && styles.compact, size === 'large' && styles.large, className)}
			role="status"
			aria-label={t`Reconnecting...`}
		>
			<span className={styles.sun} aria-hidden="true" />
			<span className={styles.track} aria-hidden="true">
				<span className={styles.planet} />
			</span>
			<span className={styles.trackOuter} aria-hidden="true">
				<span className={styles.planetOuter} />
			</span>
		</div>
	);
};
