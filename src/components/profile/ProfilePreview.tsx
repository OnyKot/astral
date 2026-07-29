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
import {ChatTeardropIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import * as UserProfileActionCreators from '~/actions/UserProfileActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as PrivateChannelActionCreators from '~/actions/PrivateChannelActionCreators';
import {DEFAULT_ACCENT_COLOR} from '~/Constants';
import {CustomStatusDisplay} from '~/components/common/CustomStatusDisplay/CustomStatusDisplay';
import {MusicActivityDisplay} from '~/components/common/MusicActivityDisplay/MusicActivityDisplay';
import {SteamNowPlayingBlock} from '~/components/common/SteamNowPlayingBlock/SteamNowPlayingBlock';
import {CustomStatusModal} from '~/components/modals/CustomStatusModal';
import {UserProfileModal} from '~/components/modals/UserProfileModal';
import {UserProfileBadges} from '~/components/popouts/UserProfileBadges';
import {UserProfileBio, UserProfileMembershipInfo} from '~/components/popouts/UserProfileShared';
import {ProfileCardBanner} from '~/components/profile/ProfileCard/ProfileCardBanner';
import {ProfileCardContent} from '~/components/profile/ProfileCard/ProfileCardContent';
import {ProfileCardFooter} from '~/components/profile/ProfileCard/ProfileCardFooter';
import {ProfileCardLayout} from '~/components/profile/ProfileCard/ProfileCardLayout';
import {ProfileCardUserInfo} from '~/components/profile/ProfileCard/ProfileCardUserInfo';
import {Button} from '~/components/uikit/Button/Button';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import {useAutoplayExpandedProfileAnimations} from '~/hooks/useAutoplayExpandedProfileAnimations';
import type {CustomStatus} from '~/lib/customStatus';
import type {GuildMemberRecord} from '~/records/GuildMemberRecord';
import type {ProfileRecord} from '~/records/ProfileRecord';
import type {UserProfile, UserRecord} from '~/records/UserRecord';
import AuthenticationStore from '~/stores/AuthenticationStore';
import GuildStore from '~/stores/GuildStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import * as ColorUtils from '~/utils/ColorUtils';
import * as NicknameUtils from '~/utils/NicknameUtils';
import * as ProfileDisplayUtils from '~/utils/ProfileDisplayUtils';
import type {ProfileAccentEffectPreset} from '~/utils/ProfileAccentEffectUtils';
import {getProfileAccentEffectPreset} from '~/utils/ProfileEffectResolver';
import {type BadgeSettings, createMockProfile} from '~/utils/ProfileUtils';
import styles from './ProfilePreview.module.css';

interface ProfilePreviewProps {
	user: UserRecord;
	previewAvatarUrl?: string | null;
	previewBannerUrl?: string | null;
	hasClearedAvatar?: boolean;
	hasClearedBanner?: boolean;
	previewBio?: string | null;
	previewPronouns?: string | null;
	previewAccentColor?: string | null;
	previewAccentEffectPreset?: ProfileAccentEffectPreset;
	previewGlobalName?: string | null;
	previewNick?: string | null;
	guildId?: string | null;
	guildMember?: GuildMemberRecord | null;
	guildMemberProfile?: UserProfile | null;
	previewBadgeSettings?: BadgeSettings;
	ignoreGuildAvatarInPreview?: boolean;
	ignoreGuildBannerInPreview?: boolean;
	showMembershipInfo?: boolean;
	showMessageButton?: boolean;
	showPreviewLabel?: boolean;
	previewCustomStatus?: CustomStatus | null;
}

export const ProfilePreview: React.FC<ProfilePreviewProps> = observer(
	({
		user,
		previewAvatarUrl,
		previewBannerUrl,
		hasClearedAvatar,
		hasClearedBanner,
		previewBio,
		previewPronouns,
		previewAccentColor,
		previewAccentEffectPreset,
		previewGlobalName,
		previewNick,
		guildId,
		guildMember,
		guildMemberProfile,
		previewBadgeSettings,
		ignoreGuildAvatarInPreview,
		ignoreGuildBannerInPreview,
		showMembershipInfo = true,
		showMessageButton = true,
		showPreviewLabel = true,
		previewCustomStatus,
	}) => {
		const {t} = useLingui();

		const profileContext = React.useMemo<ProfileDisplayUtils.ProfileDisplayContext>(
			() => ({
				user,
				profile: null,
				guildId,
				guildMember,
				guildMemberProfile,
			}),
			[user, guildId, guildMember, guildMemberProfile],
		);

		const previewOverrides = React.useMemo<ProfileDisplayUtils.ProfilePreviewOverrides>(
			() => ({
				previewAvatarUrl,
				previewBannerUrl,
				hasClearedAvatar,
				hasClearedBanner,
				ignoreGuildAvatar: ignoreGuildAvatarInPreview,
				ignoreGuildBanner: ignoreGuildBannerInPreview,
			}),
			[
				previewAvatarUrl,
				previewBannerUrl,
				hasClearedAvatar,
				hasClearedBanner,
				ignoreGuildAvatarInPreview,
				ignoreGuildBannerInPreview,
			],
		);

		const {avatarUrl: finalAvatarUrl, hoverAvatarUrl: finalHoverAvatarUrl} = React.useMemo(
			() => ProfileDisplayUtils.getProfileAvatarUrls(profileContext, previewOverrides),
			[profileContext, previewOverrides],
		);

		const shouldAutoplayProfileAnimations = useAutoplayExpandedProfileAnimations();
		const finalBannerUrl = React.useMemo(
			() => ProfileDisplayUtils.getProfileBannerUrl(profileContext, previewOverrides, shouldAutoplayProfileAnimations),
			[profileContext, previewOverrides, shouldAutoplayProfileAnimations],
		) as string | null;

		const previewUser = React.useMemo(() => {
			const bio = previewBio !== undefined ? previewBio : user.bio;
			const pronouns = previewPronouns !== undefined ? previewPronouns : user.pronouns;
			const globalName = previewGlobalName !== undefined ? previewGlobalName : user.globalName;
			return user.withUpdates({bio, pronouns, global_name: globalName});
		}, [user, previewBio, previewPronouns, previewGlobalName]);

		const mockProfile = React.useMemo(() => {
			const profile = createMockProfile(previewUser, {
				previewBannerUrl,
				hasClearedBanner,
				previewBio,
				previewPronouns,
				previewAccentColor,
				previewBadgeSettings,
			});

			if (guildId && guildMemberProfile) {
				return profile
					.withUpdates({
						guild_member_profile: {
							bio: previewBio !== undefined ? previewBio : guildMemberProfile.bio,
							banner: previewBannerUrl || guildMemberProfile.banner,
							pronouns: previewPronouns !== undefined ? previewPronouns : guildMemberProfile.pronouns,
							accent_color: previewAccentColor !== undefined ? previewAccentColor : guildMemberProfile.accent_color,
						},
					})
					.withGuildId(guildId);
			}

			return profile;
		}, [
			previewUser,
			previewBannerUrl,
			hasClearedBanner,
			previewBio,
			previewPronouns,
			previewAccentColor,
			previewBadgeSettings,
			guildId,
			guildMemberProfile,
		]);

		const openMockProfile = React.useCallback(() => {
			if (MobileLayoutStore.enabled) {
				UserProfileActionCreators.openUserProfile(user.id, guildId || undefined);
				return;
			}

			ModalActionCreators.push(
				modal(() => (
					<UserProfileModal
						userId={user.id}
						guildId={guildId || undefined}
						disableEditProfile={true}
						previewOverrides={{
							previewAvatarUrl,
							previewBannerUrl,
							hasClearedAvatar,
							hasClearedBanner,
						}}
						previewUser={previewUser}
					/>
				)),
			);
		}, [user.id, guildId, previewAvatarUrl, previewBannerUrl, hasClearedAvatar, hasClearedBanner, previewUser]);

		const pronouns = previewPronouns !== undefined ? previewPronouns : user.pronouns;
		const displayName = previewNick || NicknameUtils.getNickname(previewUser, guildId);

		const rawAccentColor = previewAccentColor !== undefined ? previewAccentColor : user.accentColor;
		const accentColorHex = typeof rawAccentColor === 'number' ? ColorUtils.int2hex(rawAccentColor) : rawAccentColor;
		const borderColor = accentColorHex || DEFAULT_ACCENT_COLOR;
		const bannerColor = accentColorHex || DEFAULT_ACCENT_COLOR;
		const accentEffectPreset = previewAccentEffectPreset ?? getProfileAccentEffectPreset(user);

		const selectedGuild = guildId ? GuildStore.getGuild(guildId) : null;

		const hasPreviewStatus = previewCustomStatus !== undefined;
		const isCurrentUser = user.id === AuthenticationStore.currentUserId;
		const canEditCustomStatus = isCurrentUser && !hasPreviewStatus;

		const openCustomStatus = React.useCallback(() => {
			ModalActionCreators.push(modal(() => <CustomStatusModal />));
		}, []);

		const handleMessageClick = React.useCallback(async () => {
			if (isCurrentUser) return;

			try {
				await PrivateChannelActionCreators.openDMChannel(user.id);
				ModalActionCreators.pop();
			} catch (error) {
				console.error('Failed to open DM from profile preview:', error);
			}
		}, [isCurrentUser, user.id]);

		const handlePreviewKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				openMockProfile();
			}
		};

		return (
			<FocusRing offset={-2}>
				<div
					className={styles.previewInteractive}
					role="group"
					aria-label={t`Profile preview (press Enter to open full preview)`}
					onKeyDown={handlePreviewKeyDown}
				>
					<ProfileCardLayout
						key={`profile-preview-${accentEffectPreset}`}
						borderColor={borderColor}
						accentEffectPreset={accentEffectPreset}
						showPreviewLabel={showPreviewLabel}
					>
						<ProfileCardBanner
							bannerUrl={finalBannerUrl}
							bannerColor={bannerColor}
							user={user}
							avatarUrl={finalAvatarUrl}
							hoverAvatarUrl={finalHoverAvatarUrl}
							isClickable={true}
							onAvatarClick={openMockProfile}
						/>

						<UserProfileBadges user={previewUser} profile={mockProfile} />

						<ProfileCardContent>
							<ProfileCardUserInfo
								displayName={displayName}
								user={previewUser}
								pronouns={pronouns}
								showUsername={true}
								isClickable={true}
								onDisplayNameClick={openMockProfile}
								onUsernameClick={openMockProfile}
							/>
							<div className={styles.profileCustomStatus}>
								<CustomStatusDisplay
									userId={hasPreviewStatus ? undefined : user.id}
									customStatus={hasPreviewStatus ? previewCustomStatus : undefined}
									className={styles.profileCustomStatusText}
									allowJumboEmoji
									maxLines={0}
									isEditable={canEditCustomStatus}
									onEdit={openCustomStatus}
									showPlaceholder={canEditCustomStatus}
									alwaysAnimate={shouldAutoplayProfileAnimations}
								/>
							</div>
							<MusicActivityDisplay userId={user.id} className={styles.profileMusicActivity} />
							<SteamNowPlayingBlock userId={user.id} className={styles.profileSteamNowPlaying} />
							<UserProfileBio profile={mockProfile} onShowMore={openMockProfile} />
							{showMembershipInfo && (
								<UserProfileMembershipInfo
									profile={{...mockProfile, guild: selectedGuild, guildMember} as ProfileRecord}
									user={previewUser}
								/>
							)}
						</ProfileCardContent>

						{showMessageButton && (
							<ProfileCardFooter>
								<Tooltip text={isCurrentUser ? t`You can't message yourself` : t`Send a direct message`} maxWidth="xl">
									<div className={styles.messageButtonWrapper}>
										<Button
											small={true}
											fitContainer={true}
											leftIcon={<ChatTeardropIcon className={styles.messageIcon} />}
											disabled={isCurrentUser}
											aria-label={isCurrentUser ? t`You can't message yourself` : t`Message ${displayName}`}
											onClick={() => void handleMessageClick()}
										>
											<Trans>Message</Trans>
										</Button>
									</div>
								</Tooltip>
							</ProfileCardFooter>
						)}
					</ProfileCardLayout>
				</div>
			</FocusRing>
		);
	},
);
