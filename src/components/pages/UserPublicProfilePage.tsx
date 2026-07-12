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
import * as PrivateChannelActionCreators from '~/actions/PrivateChannelActionCreators';
import * as UserProfileActionCreators from '~/actions/UserProfileActionCreators';
import {ME, Permissions} from '~/Constants';
import {CustomStatusDisplay} from '~/components/common/CustomStatusDisplay/CustomStatusDisplay';
import {MusicActivityDisplay} from '~/components/common/MusicActivityDisplay/MusicActivityDisplay';
import {SteamNowPlayingBlock} from '~/components/common/SteamNowPlayingBlock/SteamNowPlayingBlock';
import {MobileNavigationMenuButton} from '~/components/layout/MobileNavigationDrawer';
import {UserProfileBadges} from '~/components/popouts/UserProfileBadges';
import {UserProfileBio, UserProfileMembershipInfo, UserProfileRoles} from '~/components/popouts/UserProfileShared';
import {ProfileLinkCard} from '~/components/profile/ProfileLinkCard';
import {ProfileIntegrationsBlock} from '~/components/profile/ProfileCard/ProfileIntegrationsBlock';
import {ProfileStreamingStatusCard} from '~/components/profile/ProfileCard/ProfileStreamingStatusCard';
import {Button} from '~/components/uikit/Button/Button';
import {Scroller} from '~/components/uikit/Scroller';
import {Spinner} from '~/components/uikit/Spinner';
import {StatusAwareAvatar} from '~/components/uikit/StatusAwareAvatar';
import {useAutoplayExpandedProfileAnimations} from '~/hooks/useAutoplayExpandedProfileAnimations';
import type {ProfileRecord} from '~/records/ProfileRecord';
import {UserRecord} from '~/records/UserRecord';
import ChannelStore from '~/stores/ChannelStore';
import GuildMemberStore from '~/stores/GuildMemberStore';
import MemberPresenceSubscriptionStore from '~/stores/MemberPresenceSubscriptionStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import PermissionStore from '~/stores/PermissionStore';
import UserProfileStore from '~/stores/UserProfileStore';
import UserStore from '~/stores/UserStore';
import * as NicknameUtils from '~/utils/NicknameUtils';
import * as ProfileDisplayUtils from '~/utils/ProfileDisplayUtils';
import {createMockProfile} from '~/utils/ProfileUtils';
import styles from './UserPublicProfilePage.module.css';

interface UserPublicProfilePageProps {
	userId: string;
	channelId?: string;
}

export const UserPublicProfilePage = observer(({userId, channelId}: UserPublicProfilePageProps) => {
	const {t} = useLingui();
	const channel = channelId ? ChannelStore.getChannel(channelId) : null;
	const inferredGuildId = channel?.guildId && channel.guildId !== ME ? channel.guildId : undefined;
	const storeUser = UserStore.getUser(userId);
	const fallbackUser = React.useMemo(
		() =>
			new UserRecord({
				id: userId,
				username: userId,
				discriminator: '0000',
				avatar: null,
				flags: 0,
			}),
		[userId],
	);
	const displayUser = storeUser ?? fallbackUser;
	const initialProfile = React.useMemo(
		() => UserProfileStore.getProfile(userId, inferredGuildId),
		[userId, inferredGuildId],
	);
	const [profile, setProfile] = React.useState<ProfileRecord | null>(initialProfile);
	const [isProfileLoading, setIsProfileLoading] = React.useState(() => !initialProfile);
	const isMobileLayout = MobileLayoutStore.isMobileLayout();
	const shouldAutoplayProfileAnimations = useAutoplayExpandedProfileAnimations();

	React.useEffect(() => {
		setProfile(initialProfile);
		setIsProfileLoading(!initialProfile);
	}, [initialProfile]);

	React.useEffect(() => {
		if (!userId || profile) {
			setIsProfileLoading(false);
			return;
		}

		let cancelled = false;
		setIsProfileLoading(true);

		UserProfileActionCreators.fetch(userId, inferredGuildId)
			.then(() => {
				if (cancelled) return;
				const fetchedProfile = UserProfileStore.getProfile(userId, inferredGuildId);
				if (fetchedProfile) {
					setProfile(fetchedProfile);
				}
			})
			.catch((error) => {
				if (cancelled) return;
				console.error('[UserPublicProfilePage] Failed to fetch user profile:', error);
			})
			.finally(() => {
				if (cancelled) return;
				setIsProfileLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [inferredGuildId, profile, userId]);

	React.useEffect(() => {
		if (!inferredGuildId || !userId) {
			return;
		}

		const hasMember = GuildMemberStore.getMember(inferredGuildId, userId);
		if (!hasMember) {
			MemberPresenceSubscriptionStore.touchMember(inferredGuildId, userId);
			GuildMemberStore.fetchMembers(inferredGuildId, {userIds: [userId]}).catch((error) => {
				console.error('[UserPublicProfilePage] Failed to fetch guild member:', error);
			});
		} else {
			MemberPresenceSubscriptionStore.touchMember(inferredGuildId, userId);
		}

		return () => {
			MemberPresenceSubscriptionStore.unsubscribe(inferredGuildId, userId);
		};
	}, [inferredGuildId, userId]);

	const mockProfile = React.useMemo(() => createMockProfile(displayUser), [displayUser]);
	const resolvedProfile = profile ?? mockProfile;
	const resolvedGuildId = resolvedProfile?.guildId ?? inferredGuildId;
	const displayName = NicknameUtils.getNickname(displayUser, resolvedGuildId, channelId);
	const guildMember = resolvedGuildId ? GuildMemberStore.getMember(resolvedGuildId, displayUser.id) : null;
	const memberRoles = resolvedProfile?.guildId && guildMember ? [...guildMember.getSortedRoles()] : [];
	const canManageRoles = PermissionStore.can(Permissions.MANAGE_ROLES, {guildId: resolvedProfile?.guildId ?? resolvedGuildId});
	const profileContext = React.useMemo<ProfileDisplayUtils.ProfileDisplayContext>(
		() => ({
			user: displayUser,
			profile: resolvedProfile,
			guildId: resolvedGuildId,
			guildMember,
			guildMemberProfile: resolvedProfile?.guildMemberProfile ?? undefined,
		}),
		[displayUser, guildMember, resolvedGuildId, resolvedProfile],
	);
	const {avatarUrl, hoverAvatarUrl} = React.useMemo(
		() => ProfileDisplayUtils.getProfileAvatarUrls(profileContext),
		[profileContext],
	);
	const bannerUrl = React.useMemo(
		() => ProfileDisplayUtils.getProfileBannerUrl(profileContext, undefined, shouldAutoplayProfileAnimations),
		[profileContext, shouldAutoplayProfileAnimations],
	);

	const handleOpenDM = React.useCallback(async () => {
		try {
			await PrivateChannelActionCreators.openDMChannel(displayUser.id);
		} catch (error) {
			console.error('[UserPublicProfilePage] Failed to open DM channel:', error);
		}
	}, [displayUser.id]);

	return (
		<div className={styles.container}>
			{isMobileLayout && (
				<div className={styles.mobileMenuButtonWrap}>
					<MobileNavigationMenuButton className={styles.mobileMenuButton} />
				</div>
			)}
			<Scroller key={`user-profile-page-${userId}`}>
				<div className={styles.pageContent}>
					<div className={styles.banner}>
						{bannerUrl ? (
							<div className={styles.bannerImage} style={{backgroundImage: `url(${bannerUrl})`}} />
						) : (
							<div className={styles.bannerDefault} />
						)}
					</div>

					<div className={styles.profileCard}>
						<div className={styles.avatarWrap}>
							<StatusAwareAvatar
								size={80}
								user={displayUser}
								avatarUrl={avatarUrl}
								hoverAvatarUrl={hoverAvatarUrl}
								disableMobileStatus
							/>
						</div>

						<div className={styles.content}>
							<div className={styles.userInfo}>
								<div className={styles.nameRow}>
									<span className={styles.displayName}>{displayName}</span>
									<div className={styles.badges}>
										<UserProfileBadges user={displayUser} profile={resolvedProfile} isModal={true} isMobile={isMobileLayout} />
									</div>
								</div>
								<div className={styles.tag}>{displayUser.tag}</div>
								<div className={styles.statusRow}>
									<CustomStatusDisplay
										userId={displayUser.id}
										className={styles.statusText}
										showTooltip
										allowJumboEmoji
										animateOnParentHover
									/>
								</div>
								<MusicActivityDisplay userId={displayUser.id} className={styles.activityRow} />
								<SteamNowPlayingBlock userId={displayUser.id} className={styles.activityRow} />
							</div>

							<div className={styles.actions}>
								<Button
									small={isMobileLayout}
									onClick={handleOpenDM}
									leftIcon={<ChatTeardropIcon size={16} weight="bold" />}
									disabled={displayUser.id === UserStore.currentUser?.id}
								>
									<Trans>Message</Trans>
								</Button>
							</div>

							{isProfileLoading && (
								<div className={styles.loadingRow}>
									<Spinner />
									<span>{t`Loading profile...`}</span>
								</div>
							)}

							<div className={styles.section}>
								<ProfileIntegrationsBlock userId={displayUser.id} compact={isMobileLayout} />
							</div>
							<div className={styles.section}>
								<ProfileStreamingStatusCard userId={displayUser.id} compact={isMobileLayout} />
							</div>

							<div className={styles.section}>
								<h3 className={styles.sectionTitle}>
									<Trans>About Me</Trans>
								</h3>
								<UserProfileBio profile={resolvedProfile} />
								{storeUser && <UserProfileMembershipInfo profile={resolvedProfile} user={storeUser} />}
							</div>

							<div className={styles.section}>
								<UserProfileRoles
									profile={resolvedProfile}
									user={displayUser}
									memberRoles={memberRoles}
									canManageRoles={canManageRoles}
									forceMobile={isMobileLayout}
								/>
							</div>

							<div className={styles.section}>
								<ProfileLinkCard
									user={displayUser}
									guildId={resolvedGuildId}
									channelId={channelId}
									compact={isMobileLayout}
								/>
							</div>
						</div>
					</div>
				</div>
			</Scroller>
		</div>
	);
});
