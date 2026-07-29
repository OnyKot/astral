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
import {
	ChatTeardropIcon,
	CheckIcon,
	DotsThreeVerticalIcon,
	PhoneIcon,
	UserCircleIcon,
	UserMinusIcon,
	VideoCameraIcon,
	XIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {autorun} from 'mobx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as ContextMenuActionCreators from '~/actions/ContextMenuActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as PrivateChannelActionCreators from '~/actions/PrivateChannelActionCreators';
import * as RelationshipActionCreators from '~/actions/RelationshipActionCreators';
import type {StatusType} from '~/Constants';
import {getStatusTypeLabel, isOfflineStatus, RelationshipTypes} from '~/Constants';
import {CustomStatusDisplay} from '~/components/common/CustomStatusDisplay/CustomStatusDisplay';
import {ConfirmModal} from '~/components/modals/ConfirmModal';
import {StartVideoCallMenuItem, StartVoiceCallMenuItem} from '~/components/uikit/ContextMenu/items/CallMenuItems';
import {RemoveFriendMenuItem} from '~/components/uikit/ContextMenu/items/RelationshipMenuItems';
import {MenuGroup} from '~/components/uikit/ContextMenu/MenuGroup';
import {UserContextMenu} from '~/components/uikit/ContextMenu/UserContextMenu';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {MenuBottomSheet, type MenuGroupType} from '~/components/uikit/MenuBottomSheet/MenuBottomSheet';
import {StatusAwareAvatar} from '~/components/uikit/StatusAwareAvatar';
import {normalizeCustomStatus} from '~/lib/customStatus';
import ContextMenuStore from '~/stores/ContextMenuStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import PresenceStore from '~/stores/PresenceStore';
import UserStore from '~/stores/UserStore';
import * as CallUtils from '~/utils/CallUtils';
import {stopPropagationOnEnterSpace} from '~/utils/KeyboardUtils';
import * as NicknameUtils from '~/utils/NicknameUtils';
import * as RelationshipActionUtils from '~/utils/RelationshipActionUtils';
import {ActionButton} from './ActionButton';
import styles from './FriendListItem.module.css';

interface FriendAction {
	icon: React.ReactNode;
	tooltip: string;
	onClick: (e: React.MouseEvent) => void;
	className?: string;
	danger?: boolean;
}

interface FriendListItemProps {
	userId: string;
	relationshipType: number;
	openProfile: (userId: string) => void;
}

const statusLabels = {
	[RelationshipTypes.INCOMING_REQUEST]: <Trans>Incoming friend request</Trans>,
	[RelationshipTypes.OUTGOING_REQUEST]: <Trans>Friend request sent</Trans>,
};

export const FriendListItem: React.FC<FriendListItemProps> = observer((props) => {
	const {t, i18n} = useLingui();
	const {userId, relationshipType, openProfile} = props;

	const itemRef = React.useRef<HTMLDivElement>(null);
	const [status, setStatus] = React.useState(() => PresenceStore.getStatus(userId));
	const [contextMenuOpen, setContextMenuOpen] = React.useState(false);
	const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

	React.useEffect(() => {
		const handlePresenceUpdate = (_userId: string, newStatus: StatusType) => {
			setStatus(newStatus);
		};

		const unsubscribe = PresenceStore.subscribeToUserStatus(userId, handlePresenceUpdate);
		return () => {
			unsubscribe();
		};
	}, [userId]);

	React.useEffect(() => {
		const disposer = autorun(() => {
			const contextMenu = ContextMenuStore.contextMenu;
			const targetElement = contextMenu?.target.target;
			const isNodeTarget = typeof Node !== 'undefined' && targetElement instanceof Node;
			const isOpen = Boolean(contextMenu && isNodeTarget && itemRef.current?.contains(targetElement));
			setContextMenuOpen(isOpen);
		});

		return () => {
			disposer();
		};
	}, []);

	const getStatusText = React.useCallback(() => {
		switch (relationshipType) {
			case RelationshipTypes.INCOMING_REQUEST:
				return statusLabels[RelationshipTypes.INCOMING_REQUEST];
			case RelationshipTypes.OUTGOING_REQUEST:
				return statusLabels[RelationshipTypes.OUTGOING_REQUEST];
			default:
				return null;
		}
	}, [relationshipType]);

	const getStatusClassName = React.useCallback(() => {
		const isOffline = isOfflineStatus(status);

		if (relationshipType === RelationshipTypes.FRIEND) {
			return isOffline ? styles.friendStatusOffline : styles.friendStatusOnline;
		}
		return styles.friendStatusOffline;
	}, [relationshipType, status]);

	const createDMChannel = React.useCallback(
		async (e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			try {
				await PrivateChannelActionCreators.openDMChannel(userId);
			} catch (error) {
				console.error('Failed to open DM channel:', error);
			}
		},
		[userId],
	);

	const startVoiceCall = React.useCallback(
		async (e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			const user = UserStore.getUser(userId);
			if (user?.bot) return;

			try {
				const channelId = await PrivateChannelActionCreators.ensureDMChannel(userId);
				await CallUtils.checkAndStartCall(channelId);
			} catch (error) {
				console.error('Failed to start voice call:', error);
			}
		},
		[userId],
	);

	const ignoreIncomingFriendRequest = React.useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			const user = UserStore.getUser(userId);
			if (!user) return;

			ModalActionCreators.push(
				modal(() => (
					<ConfirmModal
						title={t`Ignore Friend Request`}
						description={t`Are you sure you want to ignore the friend request from ${user.displayName}?`}
						primaryText={t`Ignore`}
						primaryVariant="danger-primary"
						onPrimary={() => RelationshipActionCreators.removeRelationship(userId)}
					/>
				)),
			);
		},
		[userId],
	);

	const cancelOutgoingFriendRequest = React.useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			const user = UserStore.getUser(userId);
			if (!user) return;

			ModalActionCreators.push(
				modal(() => (
					<ConfirmModal
						title={t`Cancel Friend Request`}
						description={t`Are you sure you want to cancel your friend request to ${user.displayName}?`}
						primaryText={t`Cancel Friend Request`}
						primaryVariant="danger-primary"
						onPrimary={() => RelationshipActionCreators.removeRelationship(userId)}
					/>
				)),
			);
		},
		[userId],
	);

	const acceptFriendRequest = React.useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			RelationshipActionCreators.acceptFriendRequest(userId);
		},
		[userId],
	);

	const handleContextMenuClick = React.useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			const user = UserStore.getUser(userId);
			if (!user) return;

			if (MobileLayoutStore.isMobileLayout()) {
				setMobileMenuOpen(true);
				return;
			}

			ContextMenuActionCreators.openFromEvent(e, ({onClose}) => (
				<>
					<MenuGroup>
						<StartVoiceCallMenuItem user={user} onClose={onClose} />
						<StartVideoCallMenuItem user={user} onClose={onClose} />
					</MenuGroup>
					<MenuGroup>
						<RemoveFriendMenuItem user={user} onClose={onClose} />
					</MenuGroup>
				</>
			));
		},
		[userId],
	);

	const handleUserContextMenu = React.useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			const user = UserStore.getUser(userId);
			if (!user) return;

			ContextMenuActionCreators.openFromEvent(e, ({onClose}) => <UserContextMenu user={user} onClose={onClose} />);
		},
		[userId],
	);

	const getFriendActions = React.useCallback((): Array<FriendAction> => {
		switch (relationshipType) {
			case RelationshipTypes.FRIEND:
				return [
					{
						icon: <ChatTeardropIcon weight="fill" className={styles.iconSize} />,
						tooltip: t`Send Message`,
						onClick: createDMChannel,
						className: styles.actionButtonMessage,
					},
					...(UserStore.getUser(userId)?.bot
						? []
						: [
								{
									icon: <PhoneIcon weight="fill" className={styles.iconSize} />,
									tooltip: t`Start Voice Call`,
									onClick: startVoiceCall,
									className: styles.actionButtonCall,
								},
							]),
					{
						icon: <DotsThreeVerticalIcon weight="bold" className={styles.iconSize} />,
						tooltip: t`More`,
						onClick: handleContextMenuClick,
						className: styles.actionButtonMore,
					},
				];
			case RelationshipTypes.INCOMING_REQUEST:
				return [
					{
						icon: <CheckIcon weight="bold" size={20} />,
						tooltip: t`Accept`,
						onClick: acceptFriendRequest,
						className: styles.actionButtonAccept,
					},
					{
						icon: <XIcon weight="bold" size={20} />,
						tooltip: t`Ignore`,
						onClick: ignoreIncomingFriendRequest,
						className: styles.actionButtonIgnore,
					},
				];
			case RelationshipTypes.OUTGOING_REQUEST:
				return [
					{
						icon: <XIcon weight="bold" size={20} />,
						tooltip: t`Cancel`,
						onClick: cancelOutgoingFriendRequest,
						className: styles.actionButtonCancel,
					},
				];
			default:
				return [];
		}
	}, [
		relationshipType,
		createDMChannel,
		startVoiceCall,
		handleContextMenuClick,
		acceptFriendRequest,
		ignoreIncomingFriendRequest,
		cancelOutgoingFriendRequest,
		userId,
	]);

	const user = UserStore.getUser(userId);
	if (!user) return null;
	const avatarSize = MobileLayoutStore.isMobileLayout() ? 48 : 36;

	const closeMobileMenu = () => setMobileMenuOpen(false);
	const handleMobileViewProfile = () => {
		closeMobileMenu();
		openProfile(userId);
	};
	const handleMobileVoiceCall = async () => {
		closeMobileMenu();
		try {
			const channelId = await PrivateChannelActionCreators.ensureDMChannel(userId);
			await CallUtils.checkAndStartCall(channelId);
		} catch (error) {
			console.error('Failed to start voice call:', error);
		}
	};
	const handleMobileVideoCall = async () => {
		closeMobileMenu();
		try {
			const channelId = await PrivateChannelActionCreators.ensureDMChannel(userId);
			await CallUtils.checkAndStartCall(channelId);
		} catch (error) {
			console.error('Failed to start video call:', error);
		}
	};
	const handleMobileRemoveFriend = () => {
		closeMobileMenu();
		RelationshipActionUtils.showRemoveFriendConfirmation(i18n, user);
	};

	const mobileMenuGroups: Array<MenuGroupType> = [
		{
			items: [
				{
					icon: <UserCircleIcon weight="fill" className={styles.iconSize} />,
					label: t`View Profile`,
					onClick: handleMobileViewProfile,
				},
				{
					icon: <PhoneIcon weight="fill" className={styles.iconSize} />,
					label: t`Start Voice Call`,
					onClick: handleMobileVoiceCall,
					disabled: user.bot,
				},
				{
					icon: <VideoCameraIcon weight="fill" className={styles.iconSize} />,
					label: t`Start Video Call`,
					onClick: handleMobileVideoCall,
					disabled: user.bot,
				},
			],
		},
		{
			items: [
				{
					icon: <UserMinusIcon weight="fill" className={styles.iconSize} />,
					label: t`Remove Friend`,
					onClick: handleMobileRemoveFriend,
					danger: true,
				},
			],
		},
	];

	const actions = getFriendActions();
	const customStatus = relationshipType === RelationshipTypes.FRIEND ? PresenceStore.getCustomStatus(userId) : null;
	const hasCustomStatus = !!normalizeCustomStatus(customStatus);

	return (
		<>
			<FocusRing>
				<div
					ref={itemRef}
					className={clsx(styles.friendListItem, contextMenuOpen && styles.contextMenuActive)}
					onClick={() => openProfile(userId)}
					onContextMenu={handleUserContextMenu}
					role="button"
					tabIndex={0}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							openProfile(userId);
						}
					}}
					data-list-item
				>
					<div className={styles.friendInfo}>
						<StatusAwareAvatar user={user} size={avatarSize} />
						<div className={styles.friendDetails}>
							<div className={styles.friendNameRow}>
								<span className={styles.friendName}>{NicknameUtils.getNickname(user)}</span>
								<span className={styles.friendTag}>{user.tag}</span>
							</div>
							{hasCustomStatus ? (
								<CustomStatusDisplay
									userId={userId}
									className={styles.friendSubtext}
									showTooltip
									constrained
									animateOnParentHover
								/>
							) : (
								<span className={clsx(styles.friendSubtext, getStatusClassName())}>
									{getStatusText() || <StatusLabel status={status} />}
								</span>
							)}
						</div>
					</div>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: Actions container needs click handler to prevent event bubbling */}
					<div
						className={styles.friendActions}
						onClick={(e) => e.stopPropagation()}
						onKeyDown={stopPropagationOnEnterSpace}
					>
						{actions.map((action, index) => (
							<ActionButton
								key={index}
								tooltip={action.tooltip}
								onClick={action.onClick}
								className={action.className}
								danger={action.danger}
							>
								{action.icon}
							</ActionButton>
						))}
					</div>
				</div>
			</FocusRing>
			{relationshipType === RelationshipTypes.FRIEND && (
				<MenuBottomSheet
					isOpen={mobileMenuOpen}
					onClose={closeMobileMenu}
					title={NicknameUtils.getNickname(user)}
					groups={mobileMenuGroups}
				/>
			)}
		</>
	);
});

const StatusLabel = observer(function StatusLabel({status}: {status: string}) {
	const {i18n} = useLingui();
	return <>{getStatusTypeLabel(i18n, status)}</>;
});
