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
import {SparkleIcon} from '@phosphor-icons/react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import * as Modal from '~/components/modals/Modal';
import {Button} from '~/components/uikit/Button/Button';
import styles from './WhatsNewModal.module.css';

/**
 * Release notes are authored in scripts/cicd/release-policy.json and served through
 * version.json, so this modal never needs editing per release. The format is a title line,
 * then "Heading:" lines each followed by "• item" lines.
 */
interface NoteSection {
	title: string | null;
	items: Array<string>;
}

export function parseReleaseNotes(notes: string): {title: string; sections: Array<NoteSection>} {
	const lines = notes.split('\n').map((line) => line.trim());
	const title = lines.find((line) => line.length > 0) ?? '';

	const sections: Array<NoteSection> = [];
	let current: NoteSection | null = null;

	for (const line of lines.slice(1)) {
		if (!line) continue;
		if (line.startsWith('•') || line.startsWith('-')) {
			const item = line.replace(/^[•-]\s*/, '');
			if (!item) continue;
			if (!current) {
				current = {title: null, items: []};
				sections.push(current);
			}
			current.items.push(item);
			continue;
		}
		// A non-bullet line starts a new section, e.g. "Что нового:".
		current = {title: line.replace(/:$/, ''), items: []};
		sections.push(current);
	}

	return {title, sections: sections.filter((section) => section.items.length > 0)};
}

interface Props {
	notes: string;
}

export const WhatsNewModal: React.FC<Props> = ({notes}) => {
	const {t} = useLingui();
	const {title, sections} = parseReleaseNotes(notes);

	return (
		<Modal.Root size="small" centered>
			<Modal.ScreenReaderLabel text={t`What's new`} />
			<Modal.Content>
				<div className={styles.content}>
					<div className={styles.hero}>
						<span className={styles.badge}>
							<SparkleIcon weight="fill" className={styles.sparkle} size={13} />
							<Trans>Update</Trans>
						</span>
						<h1 className={styles.version}>{title}</h1>
						<p className={styles.tagline}>
							<Trans>Astral got better — here is what changed.</Trans>
						</p>
					</div>

					{sections.map((section, index) => (
						<div className={styles.section} key={section.title ?? `section-${index}`}>
							{section.title ? <h2 className={styles.sectionTitle}>{section.title}</h2> : null}
							<ul className={styles.list}>
								{section.items.map((item) => (
									<li className={styles.item} key={item}>
										<span className={styles.dot} aria-hidden="true" />
										<span>{item}</span>
									</li>
								))}
							</ul>
						</div>
					))}

					<div className={styles.footer}>
						<Button variant="primary" onClick={() => ModalActionCreators.pop()}>
							<Trans>Got it</Trans>
						</Button>
					</div>
				</div>
			</Modal.Content>
		</Modal.Root>
	);
};
