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

import {useLingui} from '@lingui/react/macro';
import {
	BellIcon,
	CaretDownIcon,
	FolderPlusIcon,
	GearIcon,
	type Icon,
	PlusCircleIcon,
	ShieldIcon,
	SignOutIcon,
	UserCircleIcon,
	UserPlusIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as UserGuildSettingsActionCreators from '~/actions/UserGuildSettingsActionCreators';
import {Permissions} from '~/Constants';
import {CategoryCreateModal} from '~/components/modals/CategoryCreateModal';
import {ChannelCreateModal} from '~/components/modals/ChannelCreateModal';
import {GuildNotificationSettingsModal} from '~/components/modals/GuildNotificationSettingsModal';
import {GuildPrivacySettingsModal} from '~/components/modals/GuildPrivacySettingsModal';
import {GuildSettingsModal} from '~/components/modals/GuildSettingsModal';
import {InviteModal} from '~/components/modals/InviteModal';
import {UserSettingsModal} from '~/components/modals/UserSettingsModal';
import {GuildIcon} from '~/components/popouts/GuildIcon';
import {useLeaveGuild} from '~/hooks/useLeaveGuild';
import type {GuildRecord} from '~/records/GuildRecord';
import AuthenticationStore from '~/stores/AuthenticationStore';
import GuildMemberStore from '~/stores/GuildMemberStore';
import PermissionStore from '~/stores/PermissionStore';
import PresenceStore from '~/stores/PresenceStore';
import UserGuildSettingsStore from '~/stores/UserGuildSettingsStore';
import * as AvatarUtils from '~/utils/AvatarUtils';
import * as InviteUtils from '~/utils/InviteUtils';
import styles from './CommunityMembersCard.module.css';

interface CommunityActionItem {
	id: string;
	label: string;
	icon: Icon;
	onClick: () => void;
	danger?: boolean;
	state?: string;
}

export const CommunityMembersCard = observer(({guild}: {guild: GuildRecord}) => {
	const {t} = useLingui();
	const [isExpanded, setIsExpanded] = React.useState(false);
	const leaveGuild = useLeaveGuild();

	const canManageGuild = PermissionStore.can(Permissions.MANAGE_GUILD, {guildId: guild.id});
	const canManageChannels = PermissionStore.can(Permissions.MANAGE_CHANNELS, {guildId: guild.id});
	const invitableChannelId = InviteUtils.getInvitableChannelId(guild.id);
	const canInvite = InviteUtils.canInviteToChannel(invitableChannelId, guild.id);
	const canManageRoles = PermissionStore.can(Permissions.MANAGE_ROLES, {guildId: guild.id});
	const canViewAuditLog = PermissionStore.can(Permissions.VIEW_AUDIT_LOG, {guildId: guild.id});
	const canManageWebhooks = PermissionStore.can(Permissions.MANAGE_WEBHOOKS, {guildId: guild.id});
	const canManageEmojis = PermissionStore.can(Permissions.MANAGE_EXPRESSIONS, {guildId: guild.id});
	const canBanMembers = PermissionStore.can(Permissions.BAN_MEMBERS, {guildId: guild.id});
	const canAccessGuildSettings =
		canManageGuild || canManageRoles || canViewAuditLog || canManageWebhooks || canManageEmojis || canBanMembers;

	const settings = UserGuildSettingsStore.getSettings(guild.id);
	const hideMutedChannels = settings?.hide_muted_channels ?? false;
	const currentUserId = AuthenticationStore.currentUserId;
	const isCurrentUserOwner = guild.isOwner(currentUserId);

	const handleInviteMembers = React.useCallback(() => {
		ModalActionCreators.push(modal(() => <InviteModal channelId={invitableChannelId ?? ''} />));
	}, [invitableChannelId]);

	const handleCommunitySettings = React.useCallback(() => {
		ModalActionCreators.push(modal(() => <GuildSettingsModal guildId={guild.id} />));
	}, [guild.id]);

	const handleCreateChannel = React.useCallback(() => {
		ModalActionCreators.push(modal(() => <ChannelCreateModal guildId={guild.id} />));
	}, [guild.id]);

	const handleCreateCategory = React.useCallback(() => {
		ModalActionCreators.push(modal(() => <CategoryCreateModal guildId={guild.id} />));
	}, [guild.id]);

	const handleNotificationSettings = React.useCallback(() => {
		ModalActionCreators.push(modal(() => <GuildNotificationSettingsModal guildId={guild.id} />));
	}, [guild.id]);

	const handlePrivacySettings = React.useCallback(() => {
		ModalActionCreators.push(modal(() => <GuildPrivacySettingsModal guildId={guild.id} />));
	}, [guild.id]);

	const handleEditCommunityProfile = React.useCallback(() => {
		ModalActionCreators.push(modal(() => <UserSettingsModal initialGuildId={guild.id} initialTab="my_profile" />));
	}, [guild.id]);

	const handleToggleHideMutedChannels = React.useCallback(() => {
		UserGuildSettingsActionCreators.toggleHideMutedChannels(guild.id);
	}, [guild.id]);

	const handleLeaveCommunity = React.useCallback(() => {
		leaveGuild(guild.id);
	}, [guild.id, leaveGuild]);

	const actionItems = React.useMemo(() => {
		const items: Array<CommunityActionItem> = [];

		if (canInvite) {
			items.push({
				id: 'invite-members',
				label: t`Invite Members`,
				icon: UserPlusIcon,
				onClick: handleInviteMembers,
			});
		}

		if (canAccessGuildSettings) {
			items.push({
				id: 'community-settings',
				label: t`Community Settings`,
				icon: GearIcon,
				onClick: handleCommunitySettings,
			});
		}

		if (canManageChannels) {
			items.push({
				id: 'create-channel',
				label: t`Create Channel`,
				icon: PlusCircleIcon,
				onClick: handleCreateChannel,
			});
			items.push({
				id: 'create-category',
				label: t`Create Category`,
				icon: FolderPlusIcon,
				onClick: handleCreateCategory,
			});
		}

		items.push(
			{
				id: 'notification-settings',
				label: t`Notification Settings`,
				icon: BellIcon,
				onClick: handleNotificationSettings,
			},
			{
				id: 'privacy-settings',
				label: t`Privacy Settings`,
				icon: ShieldIcon,
				onClick: handlePrivacySettings,
			},
			{
				id: 'edit-profile',
				label: t`Edit Community Profile`,
				icon: UserCircleIcon,
				onClick: handleEditCommunityProfile,
			},
			{
				id: 'hide-muted-channels',
				label: t`Hide Muted Channels`,
				icon: BellIcon,
				onClick: handleToggleHideMutedChannels,
				state: hideMutedChannels ? t`On` : t`Off`,
			},
		);

		if (!isCurrentUserOwner) {
			items.push({
				id: 'leave-community',
				label: t`Leave Community`,
				icon: SignOutIcon,
				onClick: handleLeaveCommunity,
				danger: true,
			});
		}

		return items;
	}, [
		canInvite,
		canAccessGuildSettings,
		canManageChannels,
		t,
		handleInviteMembers,
		handleCommunitySettings,
		handleCreateChannel,
		handleCreateCategory,
		handleNotificationSettings,
		handlePrivacySettings,
		handleEditCommunityProfile,
		handleToggleHideMutedChannels,
		hideMutedChannels,
		isCurrentUserOwner,
		handleLeaveCommunity,
	]);

	const bannerUrl = AvatarUtils.getGuildBannerURL({id: guild.id, banner: guild.banner}, true);
	const presenceCount = PresenceStore.getPresenceCount(guild.id);
	const memberCountFromGuild = guild.memberCount;
	const memberCount =
		typeof memberCountFromGuild === 'number' && memberCountFromGuild > 0
			? memberCountFromGuild
			: GuildMemberStore.getMemberCount(guild.id);

	return (
		<section className={styles.card}>
			<button
				type="button"
				className={styles.cardHeader}
				onClick={() => setIsExpanded((value) => !value)}
				aria-expanded={isExpanded}
				aria-label={t`Community card`}
			>
				<div className={styles.bannerWrap}>
					<div
						className={clsx(styles.banner, !bannerUrl && styles.bannerFallback)}
						style={bannerUrl ? {backgroundImage: `url(${bannerUrl})`} : undefined}
					/>
					<div className={styles.bannerOverlay} />
				</div>
				<div className={styles.headerContent}>
					<div className={styles.iconWrap}>
						<GuildIcon id={guild.id} name={guild.name} icon={guild.icon} sizePx={52} className={styles.guildIcon} />
					</div>
					<div className={styles.titleBlock}>
						<span className={styles.eyebrow}>{t`Community`}</span>
						<span className={styles.title}>{guild.name}</span>
						<div className={styles.stats}>
							<span className={styles.statPill}>{t`${presenceCount} Online`}</span>
							<span className={styles.statPill}>
								{memberCount === 1 ? t`${memberCount} Member` : t`${memberCount} Members`}
							</span>
						</div>
					</div>
					<CaretDownIcon className={clsx(styles.caret, isExpanded && styles.caretExpanded)} weight="bold" />
				</div>
			</button>
			<div className={clsx(styles.actionPanel, isExpanded && styles.actionPanelExpanded)}>
				<div className={styles.actionGrid}>
					{actionItems.map((item) => (
						<button
							key={item.id}
							type="button"
							className={clsx(styles.actionButton, item.danger && styles.actionButtonDanger)}
							onClick={item.onClick}
						>
							<item.icon weight="fill" className={styles.actionIcon} />
							<span className={styles.actionLabel}>{item.label}</span>
							{item.state && <span className={styles.actionState}>{item.state}</span>}
						</button>
					))}
				</div>
			</div>
		</section>
	);
});
