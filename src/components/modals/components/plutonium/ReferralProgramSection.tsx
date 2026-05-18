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
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import {Button} from '~/components/uikit/Button/Button';
import styles from './ReferralProgramSection.module.css';
import {useReferralProgram} from './hooks/useReferralProgram';

export const ReferralProgramSection: React.FC = () => {
	const {t} = useLingui();
	const {summary, loading, error} = useReferralProgram();

	const handleCopyLink = React.useCallback(async () => {
		if (!summary) return;

		try {
			await navigator.clipboard.writeText(summary.share_url);
			ToastActionCreators.success(t`Реферальная ссылка скопирована.`);
		} catch {
			ToastActionCreators.error(t`Не удалось скопировать ссылку.`);
		}
	}, [summary, t]);

	return (
		<section className={styles.card}>
			<div className={styles.header}>
				<h2 className={styles.title}>
					<Trans>Реферальная программа</Trans>
				</h2>
				<p className={styles.description}>
					<Trans>
						Приглашайте людей в Astral и получайте процент с оплаченных подписок приглашённых пользователей.
					</Trans>
				</p>
			</div>

			{loading ? <div className={styles.loading}>{t`Загружаем статистику рефералок...`}</div> : null}
			{error ? <div className={styles.error}>{error}</div> : null}

			{summary ? (
				<>
					<div className={styles.statsGrid}>
						<div className={styles.stat}>
							<span className={styles.statLabel}>
								<Trans>Оплаченных рефералов</Trans>
							</span>
							<div className={styles.statValue}>{summary.paid_referrals_count}</div>
						</div>
						<div className={styles.stat}>
							<span className={styles.statLabel}>
								<Trans>Текущая ставка</Trans>
							</span>
							<div className={styles.statValue}>{summary.reward_percent}%</div>
						</div>
						<div className={styles.stat}>
							<span className={styles.statLabel}>
								<Trans>Максимальная ставка</Trans>
							</span>
							<div className={styles.statValue}>{summary.max_reward_percent}%</div>
						</div>
					</div>

					<div className={styles.shareBox}>
						<div className={styles.shareLabel}>
							<Trans>Ваша реферальная ссылка</Trans>
						</div>
						<div className={styles.shareRow}>
							<div className={styles.shareUrl}>{summary.share_url}</div>
							<Button onClick={handleCopyLink} small variant="primary">
								<Trans>Скопировать</Trans>
							</Button>
						</div>
					</div>

					<ul className={styles.rules}>
						<li>
							<Trans>Реферал засчитывается только после первой оплаченной подписки приглашённого пользователя.</Trans>
						</li>
						<li>
							<Trans>Ставка растёт от 10% до 50% в зависимости от числа оплаченных рефералов.</Trans>
						</li>
						<li>
							{summary.support_bot_username ? (
								<Trans>
									Выводы обрабатываются вручную раз в неделю через Telegram-бота поддержки @{summary.support_bot_username}.
								</Trans>
							) : (
								<Trans>Выводы обрабатываются вручную раз в неделю через Telegram-бота поддержки.</Trans>
							)}
						</li>
					</ul>
				</>
			) : null}
		</section>
	);
};
