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
import {GiftIcon, GearIcon, NotePencilIcon, PencilIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import type {GiftMetadata} from '~/actions/GiftActionCreators';
import * as GiftActionCreators from '~/actions/GiftActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as PremiumModalActionCreators from '~/actions/PremiumModalActionCreators';
import {getStatusTypeLabel, StatusTypes} from '~/Constants';
import {CustomStatusDisplay} from '~/components/common/CustomStatusDisplay/CustomStatusDisplay';
import {MobileNavigationMenuButton} from '~/components/layout/MobileNavigationDrawer';
import {NoteEditSheet} from '~/components/modals/NoteEditSheet';
import {StatusChangeBottomSheet} from '~/components/modals/StatusChangeBottomSheet';
import {UserSettingsModal} from '~/components/modals/UserSettingsModal';
import {UserProfileBadges} from '~/components/popouts/UserProfileBadges';
import {UserProfileBio, UserProfileMembershipInfo} from '~/components/popouts/UserProfileShared';
import {ProfileIntegrationsBlock} from '~/components/profile/ProfileCard/ProfileIntegrationsBlock';
import {ProfileStreamingStatusCard} from '~/components/profile/ProfileCard/ProfileStreamingStatusCard';
import {Scroller} from '~/components/uikit/Scroller';
import {StatusAwareAvatar} from '~/components/uikit/StatusAwareAvatar';
import {StatusIndicator} from '~/components/uikit/StatusIndicator';
import {normalizeCustomStatus} from '~/lib/customStatus';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import PresenceStore from '~/stores/PresenceStore';
import TwitchIntegrationStore from '~/stores/TwitchIntegrationStore';
import UserNoteStore from '~/stores/UserNoteStore';
import UserStore from '~/stores/UserStore';
import * as AvatarUtils from '~/utils/AvatarUtils';
import {getFormattedShortDate} from '~/utils/DateUtils';
import {getGiftDurationText} from '~/utils/giftUtils';
import * as NicknameUtils from '~/utils/NicknameUtils';
import {createMockProfile} from '~/utils/ProfileUtils';
import styles from './YouPage.module.css';

interface YouPageProps {
	onAvatarClick: () => void;
}

export const YouPage = observer(({onAvatarClick}: YouPageProps) => {
	const {i18n, t} = useLingui();
	const user = UserStore.currentUser;
	const userNote = user ? UserNoteStore.getUserNote(user.id) : '';
	const [noteSheetOpen, setNoteSheetOpen] = React.useState(false);
	const [statusSheetOpen, setStatusSheetOpen] = React.useState(false);
	const [giftPreview, setGiftPreview] = React.useState<Array<GiftMetadata>>([]);
	const [giftsLoading, setGiftsLoading] = React.useState(false);
	const giftSkeletonRows = React.useMemo(() => ['skeleton-1', 'skeleton-2'], []);

	const handleSettings = () => {
		ModalActionCreators.push(modal(() => <UserSettingsModal />));
	};

	const handleEditProfile = () => {
		ModalActionCreators.push(modal(() => <UserSettingsModal initialTab="my_profile" />));
	};

	const handleOpenPlutonium = () => {
		PremiumModalActionCreators.open();
	};

	const handleOpenGiftInventory = () => {
		ModalActionCreators.push(modal(() => <UserSettingsModal initialTab="gift_inventory" />));
	};

	const profile = React.useMemo(() => (user ? createMockProfile(user) : null), [user]);
	const normalizedCustomStatus = React.useMemo(() => {
		if (!user) return null;
		return normalizeCustomStatus(PresenceStore.getCustomStatus(user.id));
	}, [user]);

	const hasCustomStatus = Boolean(normalizedCustomStatus);
	const isMobileLayout = MobileLayoutStore.isMobileLayout();
	const currentStatus = user ? PresenceStore.getStatus(user.id) : StatusTypes.ONLINE;
	const currentUserId = user?.id;
	const twitchConnection = TwitchIntegrationStore.connection;
	const twitchLiveState = TwitchIntegrationStore.liveState;
	const shouldShowStreamingCard =
		currentUserId != null &&
		Boolean(twitchConnection) &&
		Boolean(twitchLiveState?.isLive) &&
		(twitchLiveState?.creatorUserId === currentUserId || twitchLiveState?.login === twitchConnection?.login);

	React.useEffect(() => {
		if (isMobileLayout || !user?.isClaimed()) {
			setGiftPreview([]);
			setGiftsLoading(false);
			return;
		}

		let cancelled = false;
		setGiftsLoading(true);
		GiftActionCreators.fetchUserGifts()
			.then((gifts) => {
				if (cancelled) return;
				setGiftPreview(gifts.slice(0, 3));
			})
			.catch(() => {
				if (cancelled) return;
				setGiftPreview([]);
			})
			.finally(() => {
				if (cancelled) return;
				setGiftsLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [isMobileLayout, user]);

	if (!user || !profile) return null;

	const bannerUrl = user.banner ? AvatarUtils.getUserBannerURL({id: user.id, banner: user.banner}, true) : null;
	const displayName = NicknameUtils.getNickname(user);

	return (
		<>
			<div className={styles.container}>
				<Scroller key="you-page-scroller">
					<div className={styles.pageContent}>
						<div className={styles.banner}>
							{bannerUrl ? (
								<div className={styles.bannerImage} style={{backgroundImage: `url(${bannerUrl})`}} />
							) : (
								<div className={styles.bannerDefault} />
							)}
							{!isMobileLayout && (
								<div className={styles.bannerControls}>
									<button type="button" onClick={handleSettings} className={styles.settingsButton}>
										<GearIcon className={styles.settingsIcon} weight="fill" />
										<span className={styles.settingsLabel}>
											<Trans>Settings</Trans>
										</span>
									</button>
								</div>
							)}
							{isMobileLayout && (
								<div className={styles.mobileMenuButtonWrap}>
									<MobileNavigationMenuButton className={styles.mobileMenuButton} />
								</div>
							)}
						</div>

						<div className={styles.profile}>
							<button type="button" onClick={onAvatarClick} className={styles.avatarButton}>
								<StatusAwareAvatar size={80} user={user} disableMobileStatus />
							</button>

							<div className={styles.content}>
								<div className={styles.userInfo}>
									<div className={styles.usernameRow}>
										<span className={styles.username}>{displayName}</span>
										<div className={styles.badgesWrapper}>
											<UserProfileBadges user={user} profile={profile} isModal={true} isMobile={true} />
										</div>
									</div>
									<div className={styles.tagBadgeRow}>
										<span className={styles.fullTag}>
											{user.username}#{user.discriminator}
										</span>
										{hasCustomStatus && (
											<div className={styles.customStatusRow}>
												<CustomStatusDisplay
													userId={user.id}
													className={styles.customStatusText}
													showTooltip
													allowJumboEmoji
													animateOnParentHover
												/>
											</div>
										)}
									</div>
								</div>

								<div className={styles.primaryActions}>
									<button type="button" onClick={handleEditProfile} className={styles.editButton}>
										<span className={styles.actionIconShell} aria-hidden>
											<PencilIcon className={`${styles.editIcon} ${styles.editPencilIcon}`} />
										</span>
										<span className={styles.editLabel}>
											<Trans>Edit Profile</Trans>
										</span>
									</button>
									<button type="button" onClick={() => setStatusSheetOpen(true)} className={styles.statusButton}>
										<span className={styles.actionIconShell} aria-hidden>
											<StatusIndicator status={currentStatus} size={16} />
										</span>
										<span className={styles.statusLabel}>{getStatusTypeLabel(i18n, currentStatus)}</span>
									</button>
									<button type="button" onClick={handleOpenPlutonium} className={styles.plutoniumButton}>
										<span className={styles.actionIconShell} aria-hidden>
											<span className={styles.plutoniumPlanetIcon}>
												<span className={styles.plutoniumPlanetCore} />
												<span className={styles.plutoniumPlanetRing} />
												<span className={styles.plutoniumPlanetMoon} />
											</span>
										</span>
										<span className={styles.plutoniumLabel}>
											<Trans>Plutonium</Trans>
										</span>
									</button>
									<button type="button" className={styles.giftsButton} onClick={handleOpenGiftInventory}>
										<span className={styles.actionIconShell} aria-hidden>
											<GiftIcon className={styles.editIcon} weight="bold" />
										</span>
										<span className={styles.editLabel}>
											<Trans>Gifts</Trans>
										</span>
										{user.hasUnreadGiftInventory && <span className={styles.soonPill}>{user.unreadGiftInventoryCount}</span>}
									</button>
								</div>

								<ProfileIntegrationsBlock userId={user.id} compact={isMobileLayout} className={styles.section} />
								{shouldShowStreamingCard && (
									<div className={styles.section}>
										<ProfileStreamingStatusCard userId={user.id} compact={isMobileLayout} />
									</div>
								)}

								{!isMobileLayout && (
									<>
										<div className={styles.section}>
									<div className={styles.sectionHeader}>
										<h3 className={styles.sectionTitle}>
											<Trans>Gifts Preview</Trans>
										</h3>
										{giftsLoading ? (
											<div className={styles.giftPreviewSkeletonList} aria-hidden="true">
												{giftSkeletonRows.map((rowKey) => (
													<div key={rowKey} className={styles.giftPreviewSkeletonCard}>
														<div className={styles.giftPreviewSkeletonIcon} />
														<div className={styles.giftPreviewSkeletonContent}>
															<div className={styles.giftPreviewSkeletonLine} />
															<div className={clsx(styles.giftPreviewSkeletonLine, styles.giftPreviewSkeletonLineShort)} />
														</div>
													</div>
												))}
											</div>
										) : giftPreview.length > 0 ? (
											<div className={styles.giftPreviewList}>
												{giftPreview.map((gift) => (
													<button
														type="button"
														key={gift.code}
														className={styles.giftPreviewCard}
														onClick={handleOpenGiftInventory}
													>
														<div className={styles.giftPreviewIcon}>
															<GiftIcon weight="fill" />
														</div>
														<div className={styles.giftPreviewContent}>
															<span className={styles.giftPreviewTitle}>{getGiftDurationText(i18n, gift)}</span>
															<span className={styles.giftPreviewMeta}>
																{gift.redeemed_at
																	? t`Redeemed ${getFormattedShortDate(new Date(gift.redeemed_at))}`
																	: t`Purchased ${getFormattedShortDate(new Date(gift.created_at))}`}
															</span>
														</div>
													</button>
												))}
											</div>
										) : (
											<p className={styles.noteSubtext}>
												<Trans>No gifts yet. Buy or redeem one to see it here.</Trans>
											</p>
										)}
									</div>
										</div>

									</>
								)}

								{(profile?.userProfile.bio || profile) && (
									<div className={styles.section}>
										{profile?.userProfile.bio && (
											<div className={styles.sectionHeader}>
												<h3 className={styles.sectionTitle}>
													<Trans>About Me</Trans>
												</h3>
												<UserProfileBio profile={profile} />
											</div>
										)}
										<UserProfileMembershipInfo profile={profile} user={user} />
									</div>
								)}

								<button type="button" onClick={() => setNoteSheetOpen(true)} className={styles.noteButton}>
									<div className={styles.noteInner}>
										<h3 className={styles.noteLabel}>
											<Trans>Note</Trans>
										</h3>
										<p className={styles.noteSubtext}>
											<Trans>(only visible to you)</Trans>
										</p>
										{userNote && <p className={styles.noteText}>{userNote}</p>}
									</div>
									<div className={styles.noteIconWrapper}>
										<NotePencilIcon className={styles.noteIcon} />
									</div>
								</button>
							</div>
						</div>
					</div>
				</Scroller>
			</div>

			<NoteEditSheet
				isOpen={noteSheetOpen}
				onClose={() => setNoteSheetOpen(false)}
				userId={user.id}
				initialNote={userNote}
			/>
			<StatusChangeBottomSheet isOpen={statusSheetOpen} onClose={() => setStatusSheetOpen(false)} />
		</>
	);
});
