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
import * as GuildActionCreators from '~/actions/GuildActionCreators';
import type {DiscoveryApplication} from '~/actions/GuildActionCreators';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import {Input, Textarea} from '~/components/form/Input';
import {Select} from '~/components/form/Select';
import type {SelectOption} from '~/components/form/Select';
import {Button} from '~/components/uikit/Button/Button';
import {SettingsSection} from '../components/SettingsSection';
import styles from './DiscoveryApplicationSection.module.css';

interface Props {
	guildId: string;
	canManageGuild: boolean;
}

export const DiscoveryApplicationSection: React.FC<Props> = ({guildId, canManageGuild}) => {
	const {t} = useLingui();
	const [loading, setLoading] = React.useState(true);
	const [submitting, setSubmitting] = React.useState(false);
	const [application, setApplication] = React.useState<DiscoveryApplication | null>(null);
	const [editing, setEditing] = React.useState(false);
	const [category, setCategory] = React.useState<string>('featured');
	const [description, setDescription] = React.useState<string>('');
	const [tagsRaw, setTagsRaw] = React.useState<string>('');
	const [error, setError] = React.useState<string | null>(null);
	const discoveryCategories = React.useMemo<ReadonlyArray<SelectOption<string>>>(
		() => [
			{value: 'featured', label: t`Featured`},
			{value: 'voice', label: t`Voice`},
			{value: 'media', label: t`Media`},
			{value: 'expressive', label: t`Expressive`},
			{value: 'large', label: t`Large`},
			{value: 'new', label: t`New`},
		],
		[t],
	);
	const getStatusLabel = React.useCallback(
		(status: DiscoveryApplication['status']) => {
			switch (status) {
				case 'pending':
					return t`Pending review`;
				case 'approved':
					return t`Approved`;
				case 'rejected':
					return t`Rejected`;
				case 'withdrawn':
					return t`Withdrawn`;
				default:
					return status;
			}
		},
		[t],
	);

	const loadApplication = React.useCallback(async () => {
		try {
			setLoading(true);
			const result = await GuildActionCreators.fetchDiscoveryApplication(guildId);
			setApplication(result);
			if (result) {
				setCategory(result.category ?? 'featured');
				setDescription(result.description ?? '');
				setTagsRaw(result.tags.join(', '));
			}
		} catch {
			// non-fatal: leave application null and let the user submit a fresh one
		} finally {
			setLoading(false);
		}
	}, [guildId]);

	React.useEffect(() => {
		void loadApplication();
	}, [loadApplication]);

	const beginEdit = React.useCallback(() => {
		setEditing(true);
		setError(null);
	}, []);

	const cancelEdit = React.useCallback(() => {
		setEditing(false);
		setError(null);
		if (application) {
			setCategory(application.category ?? 'featured');
			setDescription(application.description ?? '');
			setTagsRaw(application.tags.join(', '));
		} else {
			setCategory('featured');
			setDescription('');
			setTagsRaw('');
		}
	}, [application]);

	const submit = React.useCallback(async () => {
		setError(null);
		const trimmedDescription = description.trim();
		if (trimmedDescription.length < 50) {
			setError(t`Tell admins at least 50 characters about your community.`);
			return;
		}
		const tags = tagsRaw
			.split(',')
			.map((tag) => tag.trim())
			.filter((tag) => tag.length > 0)
			.slice(0, 10);

		try {
			setSubmitting(true);
			const result = await GuildActionCreators.submitDiscoveryApplication(guildId, {
				category,
				description: trimmedDescription,
				tags,
			});
			setApplication(result);
			setEditing(false);
			ToastActionCreators.createToast({
				type: 'success',
				children: t`Submitted to the discovery review queue.`,
			});
		} catch (err) {
			setError(t`Failed to submit. Try again in a moment.`);
		} finally {
			setSubmitting(false);
		}
	}, [category, description, guildId, t, tagsRaw]);

	const withdraw = React.useCallback(async () => {
		try {
			setSubmitting(true);
			await GuildActionCreators.withdrawDiscoveryApplication(guildId);
			setApplication((prev) => (prev ? {...prev, status: 'withdrawn'} : prev));
			ToastActionCreators.createToast({
				type: 'success',
				children: t`Discovery listing withdrawn.`,
			});
		} catch {
			ToastActionCreators.createToast({
				type: 'error',
				children: t`Failed to withdraw application.`,
			});
		} finally {
			setSubmitting(false);
		}
	}, [guildId, t]);

	const showForm = editing || !application || application.status === 'rejected' || application.status === 'withdrawn';

	return (
		<SettingsSection
			title={<Trans>Community Discovery</Trans>}
			description={
				<Trans>
					Apply to be listed in the public Discover catalog. An admin reviews every submission. Until you're
					approved, your community is hidden from Discovery search.
				</Trans>
			}
		>
			{loading ? (
				<p className={styles.loadingText}>
					<Trans>Loading…</Trans>
				</p>
			) : (
				<div className={styles.container}>
					{application && (
						<div className={styles.statusBlock} data-status={application.status}>
							<div className={styles.statusBadge}>{getStatusLabel(application.status)}</div>
							{application.review_note && (
								<p className={styles.reviewNote}>
									<Trans>Reviewer note:</Trans> {application.review_note}
								</p>
							)}
							<p className={styles.metaLine}>
								<Trans>Submitted</Trans> {new Date(application.submitted_at).toLocaleDateString()}
								{application.reviewed_at ? (
									<>
										{' · '}
										<Trans>Reviewed</Trans> {new Date(application.reviewed_at).toLocaleDateString()}
									</>
								) : null}
							</p>
						</div>
					)}

					{!showForm && application && (
						<div className={styles.actionsRow}>
							<Button variant="secondary" onClick={beginEdit} disabled={!canManageGuild || submitting}>
								<Trans>Edit details</Trans>
							</Button>
							<Button
								variant="danger-secondary"
								onClick={withdraw}
								disabled={!canManageGuild || submitting}
								submitting={submitting}
							>
								<Trans>Withdraw</Trans>
							</Button>
						</div>
					)}

					{showForm && (
						<div className={styles.formContainer}>
							<Select<string>
								label={t`Category`}
								value={category}
								options={discoveryCategories}
								onChange={(value) => setCategory(value)}
								disabled={!canManageGuild || submitting}
							/>

							<Textarea
								label={t`Pitch your community`}
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								minRows={4}
								maxRows={10}
								maxLength={2000}
								showCharacterCount
								disabled={!canManageGuild || submitting}
								placeholder={t`What is this community about? Who is it for?`}
							/>

							<Input
								label={t`Tags (comma separated)`}
								value={tagsRaw}
								onChange={(e) => setTagsRaw(e.target.value)}
								placeholder={t`gaming, art, music`}
								disabled={!canManageGuild || submitting}
								maxLength={300}
							/>

							{error && <p className={styles.errorText}>{error}</p>}

							<div className={styles.actionsRow}>
								{application && editing && (
									<Button
										variant="secondary"
										onClick={cancelEdit}
										disabled={submitting}
									>
										<Trans>Cancel</Trans>
									</Button>
								)}
								<Button
									variant="primary"
									onClick={submit}
									disabled={!canManageGuild || submitting}
									submitting={submitting}
								>
									{application && application.status !== 'withdrawn' && application.status !== 'rejected' ? (
										<Trans>Update application</Trans>
									) : (
										<Trans>Submit for review</Trans>
									)}
								</Button>
							</div>
						</div>
					)}
				</div>
			)}
		</SettingsSection>
	);
};
