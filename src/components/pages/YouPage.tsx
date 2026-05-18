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
import {GiftIcon, GearIcon, ImageSquareIcon, NotePencilIcon, PencilIcon, PlayCircleIcon, WaveformIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import React from 'react';
import type {GiftMetadata} from '~/actions/GiftActionCreators';
import * as GiftActionCreators from '~/actions/GiftActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as PremiumModalActionCreators from '~/actions/PremiumModalActionCreators';
import {CustomStatusDisplay} from '~/components/common/CustomStatusDisplay/CustomStatusDisplay';
import {NoteEditSheet} from '~/components/modals/NoteEditSheet';
import {UserSettingsModal} from '~/components/modals/UserSettingsModal';
import {UserProfileBadges} from '~/components/popouts/UserProfileBadges';
import {UserProfileBio, UserProfileMembershipInfo} from '~/components/popouts/UserProfileShared';
import {Scroller} from '~/components/uikit/Scroller';
import {Spinner} from '~/components/uikit/Spinner';
import {StatusAwareAvatar} from '~/components/uikit/StatusAwareAvatar';
import {normalizeCustomStatus} from '~/lib/customStatus';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import PresenceStore from '~/stores/PresenceStore';
import UserNoteStore from '~/stores/UserNoteStore';
import UserStore from '~/stores/UserStore';
import * as AvatarUtils from '~/utils/AvatarUtils';
import {getFormattedShortDate} from '~/utils/DateUtils';
import {getGiftDurationText} from '~/utils/giftUtils';
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
	const [giftPreview, setGiftPreview] = React.useState<Array<GiftMetadata>>([]);
	const [giftsLoading, setGiftsLoading] = React.useState(false);

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

	React.useEffect(() => {
		if (!user?.isClaimed()) {
			setGiftPreview([]);
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
	}, [user]);

	if (!user || !profile) return null;

	const bannerUrl = user.banner ? AvatarUtils.getUserBannerURL({id: user.id, banner: user.banner}, true) : null;

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
						</div>

						<div className={styles.profile}>
							<button type="button" onClick={onAvatarClick} className={styles.avatarButton}>
								<StatusAwareAvatar size={80} user={user} disableMobileStatus />
							</button>

							<div className={styles.content}>
								<div className={styles.userInfo}>
									<div className={styles.usernameRow}>
										<span className={styles.username}>{user.username}</span>
										<div className={styles.badgesWrapper}>
											<UserProfileBadges user={user} profile={profile} isModal={true} isMobile={true} />
										</div>
									</div>
									<div className={styles.tagBadgeRow}>
										<span className={styles.fullTag}>
											{user.username}#{user.discriminator}
										</span>
										{hasCustomStatus && (
											<>
												<span className={styles.fullTag}>/</span>
												<div className={styles.customStatusRow}>
													<CustomStatusDisplay
														userId={user.id}
														className={styles.customStatusText}
														showTooltip
														allowJumboEmoji
														animateOnParentHover
													/>
												</div>
											</>
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

								{!isMobileLayout && (
									<>
										<div className={styles.section}>
									<div className={styles.sectionHeader}>
										<h3 className={styles.sectionTitle}>
											<Trans>Gifts Preview</Trans>
										</h3>
										{giftsLoading ? (
											<div className={styles.giftLoadingRow}>
												<Spinner />
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

										<div className={styles.section}>
									<div className={styles.sectionHeader}>
										<h3 className={styles.sectionTitle}>
											<Trans>Media Preview</Trans>
										</h3>
										<div className={styles.mediaPreviewList}>
											<div className={styles.mediaPreviewItem}>
												<div className={styles.mediaPreviewThumb}>
													<ImageSquareIcon weight="fill" className={styles.mediaPreviewIcon} />
												</div>
												<div className={styles.mediaPreviewMeta}>
													<span className={styles.mediaPreviewTitle}>beach_trip_2026.png</span>
													<span className={styles.mediaPreviewSub}>{t`2.4 MB · Image`}</span>
												</div>
											</div>
											<div className={styles.mediaPreviewItem}>
												<div className={styles.mediaPreviewThumb}>
													<PlayCircleIcon weight="fill" className={styles.mediaPreviewIcon} />
												</div>
												<div className={styles.mediaPreviewMeta}>
													<span className={styles.mediaPreviewTitle}>city_walk.mp4</span>
													<span className={styles.mediaPreviewSub}>{t`00:23 · Video`}</span>
												</div>
											</div>
											<div className={styles.mediaPreviewItem}>
												<div className={styles.mediaPreviewThumb}>
													<WaveformIcon weight="fill" className={styles.mediaPreviewIcon} />
												</div>
												<div className={styles.mediaPreviewMeta}>
													<span className={styles.mediaPreviewTitle}>voice_001.ogg</span>
													<span className={styles.mediaPreviewSub}>{t`00:11 · Voice`}</span>
												</div>
											</div>
										</div>
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
		</>
	);
});
