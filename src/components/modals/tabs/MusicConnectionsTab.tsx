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
import {ArrowSquareOutIcon, MusicNotesIcon, SparkleIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {MusicActivityDisplay} from '~/components/common/MusicActivityDisplay/MusicActivityDisplay';
import {Switch} from '~/components/form/Switch';
import {SettingsSection} from '~/components/modals/shared/SettingsSection';
import {SettingsTabContainer, SettingsTabContent, SettingsTabHeader} from '~/components/modals/shared/SettingsTabLayout';
import {Button} from '~/components/uikit/Button/Button';
import AstralMusicStore from '~/stores/AstralMusicStore';
import MusicPresenceStore from '~/stores/MusicPresenceStore';
import styles from './MusicConnectionsTab.module.css';

const MusicConnectionsTab: React.FC = observer(() => {
	const {t} = useLingui();

	const connectedSourcesCount =
		Number(AstralMusicStore.hasSession) + Number(MusicPresenceStore.desktopNowPlayingAvailable);
	const sharingSummary = MusicPresenceStore.shareListeningStatus ? t`Трансляция включена` : t`Трансляция выключена`;
	const currentActivitySummary = AstralMusicStore.currentActivity
		? t`Карточку сейчас ведёт Astral Music`
		: MusicPresenceStore.desktopNowPlaying
			? t`Карточку сейчас ведёт Now Playing на ПК`
			: t`Сейчас ничего не транслируется`;

	return (
		<SettingsTabContainer>
			<SettingsTabHeader
				title={t`Музыка и прослушивание`}
				description={t`Astral Music теперь встроен прямо в мессенджер. Ищите треки, закрепляйте их в карточке и делитесь прослушиванием без лишней настройки.`}
			/>

			<SettingsTabContent>
				<section className={styles.hero}>
					<div className={styles.heroGlow} aria-hidden="true" />
					<div className={styles.heroHeader}>
						<div className={styles.heroIconWrap}>
							<MusicNotesIcon size={22} weight="fill" />
						</div>
						<div className={styles.heroCopy}>
							<div className={styles.heroEyebrow}>
								<Trans>Astral Music</Trans>
							</div>
							<h3 className={styles.heroTitle}>
								<Trans>Один музыкальный слой для мессенджера, профилей и карточек</Trans>
							</h3>
							<p className={styles.heroDescription}>
								<Trans>
									Теперь музыка живёт прямо внутри Astral. Откройте библиотеку, выберите трек и используйте одну и ту
									же аккуратную карточку в профиле, попаутах и домашнем экране DM.
								</Trans>
							</p>
						</div>
					</div>

					<div className={styles.summaryGrid}>
						<div className={styles.summaryCard}>
							<div className={styles.summaryLabel}>
								<Trans>Доступные источники</Trans>
							</div>
							<div className={styles.summaryValue}>{connectedSourcesCount}</div>
							<div className={styles.summaryText}>
								{AstralMusicStore.hasSession
									? t`Astral Music уже готов управлять вашей карточкой`
									: t`Откройте Astral Music, чтобы музыка снова появилась в мессенджере`}
							</div>
						</div>

						<div className={styles.summaryCard}>
							<div className={styles.summaryLabel}>
								<Trans>Состояние трансляции</Trans>
							</div>
							<div className={styles.summaryValueSmall}>{sharingSummary}</div>
							<div className={styles.summaryText}>
								<Trans>Карточка в профиле и presence обновляются сразу после переключения.</Trans>
							</div>
						</div>

						<div className={styles.summaryCard}>
							<div className={styles.summaryLabel}>
								<Trans>Текущий источник карточки</Trans>
							</div>
							<div className={styles.summaryValueSmall}>{currentActivitySummary}</div>
							<div className={styles.summaryText}>
								<Trans>Ниже можно посмотреть, что именно увидят другие люди в вашем профиле.</Trans>
							</div>
						</div>
					</div>
				</section>

				<SettingsSection
					id="services"
					title={t`Astral Music`}
					description={t`Мессенджер теперь работает с Astral Music напрямую, а на ПК дополнительно умеет подхватывать системный Now Playing.`}
				>
					<div className={styles.serviceGrid}>
						<div className={styles.serviceCard}>
							<div className={styles.serviceHeader}>
								<div className={styles.serviceBadgeDesktop}>
									<MusicNotesIcon size={13} weight="fill" />
									<span>
										<Trans>Встроенная библиотека</Trans>
									</span>
								</div>
								<div className={styles.serviceStatus}>
									{AstralMusicStore.hasSession ? t`Интеграция с мессенджером активна` : t`Готово к запуску`}
								</div>
							</div>

							<div className={styles.serviceCopy}>
								<div className={styles.serviceTitle}>
									<Trans>Музыка прямо внутри мессенджера</Trans>
								</div>
								<div className={styles.serviceDescription}>
									<Trans>
										Ищите треки, закрепляйте их и сразу смотрите превью внутри Astral. Выбранный трек теперь
										попадает в карточку профиля, попауты и домашний экран DM.
									</Trans>
								</div>
							</div>

							<div className={styles.downloadCard}>
								<div className={styles.downloadCopy}>
									<div className={styles.downloadTitle}>
										<Trans>Открыть Astral Music</Trans>
									</div>
									<div className={styles.downloadText}>
										<Trans>Перейдите в полное приложение Astral Music, если нужна большая библиотека и полноценный поиск.</Trans>
									</div>
								</div>
								<Button small onClick={() => AstralMusicStore.openMusicApp()}>
									<ArrowSquareOutIcon size={16} weight="bold" />
									<Trans>Открыть музыку</Trans>
								</Button>
							</div>

							<div className={styles.helperPill}>
								<SparkleIcon size={14} weight="fill" />
								<span>
									<Trans>Astral Music ведёт карточку, а на Windows дополнительно работает Now Playing</Trans>
								</span>
							</div>
						</div>
					</div>
				</SettingsSection>

				<SettingsSection
					id="sharing"
					title={t`Трансляция`}
					description={t`Управляйте тем, показывает ли Astral текущий трек в presence и отображается ли подпись источника.`}
				>
					<div className={styles.switchStack}>
						<Switch
							value={MusicPresenceStore.shareListeningStatus}
							onChange={MusicPresenceStore.setShareListeningStatus}
							label={t`Показывать, что я слушаю`}
							description={t`Показывает выбранный трек из Astral Music или Now Playing на ПК в карточке профиля и presence.`}
						/>
						<Switch
							value={MusicPresenceStore.showProviderBadge}
							onChange={MusicPresenceStore.setShowProviderBadge}
							label={t`Показывать подпись источника`}
							description={t`Добавляет на карточку подпись вроде Astral Music или Now Playing вместо голого названия трека.`}
						/>
					</div>
				</SettingsSection>

				<SettingsSection
					id="preview"
					title={t`Предпросмотр`}
					description={t`Так карточка прослушивания будет выглядеть, когда кто-то откроет ваш профиль.`}
				>
					<div className={clsx(styles.previewWrap, !MusicPresenceStore.currentActivity && styles.previewWrapEmpty)}>
						<div className={styles.previewHeader}>
							<div className={styles.previewTitle}>
								<Trans>Музыкальная карточка профиля</Trans>
							</div>
							<div className={styles.previewCaption}>
								<Trans>Единый вид для профиля, модалки и мобильного нижнего листа.</Trans>
							</div>
						</div>
						<MusicActivityDisplay activity={MusicPresenceStore.currentActivity} showEmptyState />
					</div>
				</SettingsSection>
			</SettingsTabContent>
		</SettingsTabContainer>
	);
});

export default MusicConnectionsTab;
