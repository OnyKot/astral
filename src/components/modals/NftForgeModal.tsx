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

import {Trans, useLingui} from '@lingui/react/macro';
import React from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import hackerImage from '~/assets/haker.png';
import * as Modal from '~/components/modals/Modal';
import {Button} from '~/components/uikit/Button/Button';
import styles from './NftForgeModal.module.css';

const MATRIX_ALPHABET = '01ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&*+<>?';
const MATRIX_COLUMN_COUNT = 14;
const MATRIX_COLUMN_LENGTH = 24;
const MATRIX_REFRESH_MS = 170;

const createMatrixColumn = () =>
	Array.from({length: MATRIX_COLUMN_LENGTH}, () => MATRIX_ALPHABET[Math.floor(Math.random() * MATRIX_ALPHABET.length)]).join('\n');

const createMatrixColumns = () => Array.from({length: MATRIX_COLUMN_COUNT}, createMatrixColumn);

export const NftForgeModal: React.FC = () => {
	const {t} = useLingui();
	const initialFocusRef = React.useRef<HTMLButtonElement | null>(null);
	const [matrixColumns, setMatrixColumns] = React.useState<Array<string>>(() => createMatrixColumns());
	const actions = React.useMemo(
		() => [t`Generate NFT`, t`NFT Hash`, t`Create your NFT`, t`Craft`, t`Exchange`, t`Sell`, t`Gift`],
		[t],
	);

	React.useEffect(() => {
		const interval = window.setInterval(() => {
			setMatrixColumns(createMatrixColumns());
		}, MATRIX_REFRESH_MS);

		return () => {
			window.clearInterval(interval);
		};
	}, []);

	return (
		<Modal.Root
			size="medium"
			centered
			initialFocusRef={initialFocusRef}
			onClose={() => ModalActionCreators.pop()}
			className={styles.modalRoot}
		>
			<Modal.Header title={t`Create your NFT`} hideCloseButton />
			<Modal.Content>
				<div className={styles.content}>
					<div className={styles.heroCard}>
						<p className={styles.subtitle}>
							<Trans>This page is in development.</Trans>
						</p>
						<div className={styles.hackerScene}>
							<div className={styles.matrixLayer} aria-hidden>
								{matrixColumns.map((column, index) => (
									<span
										key={index}
										className={styles.matrixColumn}
										style={
											{
												'--matrix-delay': `${(index % 7) * -0.17}s`,
												'--matrix-duration': `${2.45 + (index % 5) * 0.34}s`,
											} as React.CSSProperties
										}
									>
										{column}
									</span>
								))}
							</div>
							<img src={hackerImage} alt="" className={styles.hackerImage} aria-hidden />
						</div>
						<div className={styles.subtitleRow}>
							<p className={styles.codeLine}>
								<Trans>generating</Trans>
								<span className={styles.codeCursor}>|</span>
							</p>
						</div>
					</div>

					<div className={styles.actionsGrid}>
						{actions.map((action) => (
							<button key={action} type="button" className={styles.actionButton} disabled>
								{action}
							</button>
						))}
					</div>
				</div>
			</Modal.Content>
			<Modal.Footer>
				<Button ref={initialFocusRef} variant="secondary" className={styles.closeButton} onClick={() => ModalActionCreators.pop()}>
					<Trans>Close</Trans>
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
};
