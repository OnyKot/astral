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
import {motion, useReducedMotion} from 'framer-motion';
import {UserCirclePlus} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import {AddFriendForm} from './AddFriendForm';
import styles from './AddFriendView.module.css';

export const AddFriendView = observer(() => {
	const prefersReducedMotion = useReducedMotion();

	return (
		<div className={styles.addFriendContainer}>
			<motion.div
				className={styles.card}
				initial={prefersReducedMotion ? false : {opacity: 0, y: 18, scale: 0.985}}
				animate={prefersReducedMotion ? {opacity: 1} : {opacity: 1, y: 0, scale: 1}}
				transition={prefersReducedMotion ? {duration: 0} : {duration: 0.32, ease: [0.22, 1, 0.36, 1]}}
			>
				<UserCirclePlus weight="fill" className={styles.heroIcon} />
				<h2 className={styles.title}>
					<Trans>Add Friend</Trans>
				</h2>
				<p className={styles.subtitle}>
					<Trans>You can add friends with their AstralTag.</Trans>
				</p>
				<div className={styles.formContainer}>
					<AddFriendForm />
				</div>
			</motion.div>
		</div>
	);
});
