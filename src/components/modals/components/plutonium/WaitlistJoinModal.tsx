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
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import type {PremiumWaitlistEntry} from '~/actions/PremiumActionCreators';
import * as PremiumActionCreators from '~/actions/PremiumActionCreators';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import {Textarea} from '~/components/form/Input';
import * as Modal from '~/components/modals/Modal';
import {Button} from '~/components/uikit/Button/Button';
import {Logger} from '~/lib/Logger';
import styles from './WaitlistJoinModal.module.css';

const logger = new Logger('WaitlistJoinModal');
const COMMENT_MAX_LENGTH = 500;

type WaitlistPlan = 'monthly' | 'yearly' | 'visionary';

interface WaitlistJoinModalProps {
	plan: WaitlistPlan;
	initialComment?: string;
	onJoined: (entry: PremiumWaitlistEntry) => void;
}

export const WaitlistJoinModal: React.FC<WaitlistJoinModalProps> = observer(({plan, initialComment = '', onJoined}) => {
	const {t} = useLingui();
	const [comment, setComment] = React.useState(initialComment);
	const [commentError, setCommentError] = React.useState<string | undefined>();
	const [submitting, setSubmitting] = React.useState(false);
	const submitButtonRef = React.useRef<HTMLButtonElement | null>(null);

	const planLabel = React.useMemo(() => {
		switch (plan) {
			case 'monthly':
				return t`Monthly`;
			case 'yearly':
				return t`Yearly`;
			case 'visionary':
				return t`Visionary`;
		}
	}, [plan, t]);

	const handleCancel = React.useCallback(() => {
		ModalActionCreators.pop();
	}, []);

	const handleCommentChange = React.useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
		const nextValue = event.target.value;
		setComment(nextValue);
		if (nextValue.length > COMMENT_MAX_LENGTH) {
			setCommentError(t`Comment must be ${COMMENT_MAX_LENGTH} characters or fewer.`);
		} else {
			setCommentError(undefined);
		}
	}, [t]);

	const handleSubmit = React.useCallback(async () => {
		if (comment.length > COMMENT_MAX_LENGTH) {
			setCommentError(t`Comment must be ${COMMENT_MAX_LENGTH} characters or fewer.`);
			return;
		}

		setSubmitting(true);
		try {
			const trimmedComment = comment.trim();
			const entry = await PremiumActionCreators.joinPremiumWaitlist(plan, trimmedComment || undefined);
			onJoined(entry);
			ModalActionCreators.pop();
		} catch (error) {
			logger.error('Failed to join premium waitlist', error);
			ToastActionCreators.error(t`Failed to join the waitlist. Please try again.`);
		} finally {
			setSubmitting(false);
		}
	}, [comment, onJoined, plan, t]);

	return (
		<Modal.Root size="small" centered initialFocusRef={submitButtonRef}>
			<Modal.Header title={<Trans>Join waitlist — {planLabel}</Trans>} />
			<Modal.Content className={styles.content}>
				<p className={styles.description}>
					<Trans>
						Payments are temporarily unavailable. Join the waitlist to register interest for this plan while we
						finish checkout.
					</Trans>
				</p>
				<Textarea
					label={t`Comment (optional)`}
					value={comment}
					onChange={handleCommentChange}
					maxLength={COMMENT_MAX_LENGTH}
					showCharacterCount
					minRows={3}
					maxRows={6}
					disabled={submitting}
					error={commentError}
					placeholder={t`Tell us anything that would help (optional)`}
				/>
			</Modal.Content>
			<Modal.Footer className={styles.footer}>
				<Button type="button" variant="secondary" onClick={handleCancel} disabled={submitting}>
					{t`Cancel`}
				</Button>
				<Button
					type="button"
					variant="primary"
					onClick={() => {
						void handleSubmit();
					}}
					submitting={submitting}
					ref={submitButtonRef}
				>
					{t`Join waitlist`}
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});
