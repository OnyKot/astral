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

import React from 'react';
import * as ContextMenuActionCreators from '~/actions/ContextMenuActionCreators';
import * as UserProfileActionCreators from '~/actions/UserProfileActionCreators';
import {LongPressable} from '~/components/LongPressable';
import {GuildMemberActionsSheet} from '~/components/modals/guildTabs/GuildMemberActionsSheet';
import {UserProfilePopout} from '~/components/popouts/UserProfilePopout';
import {GuildMemberContextMenu} from '~/components/uikit/ContextMenu/GuildMemberContextMenu';
import {UserContextMenu} from '~/components/uikit/ContextMenu/UserContextMenu';
import type {PopoutPosition} from '~/components/uikit/Popout';
import {Popout} from '~/components/uikit/Popout/Popout';
import type {UserRecord} from '~/records/UserRecord';
import GuildMemberStore from '~/stores/GuildMemberStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';

type PreloadableChildProps = React.HTMLAttributes<HTMLElement> &
	React.RefAttributes<HTMLElement> & {
		'data-message-swipe-ignore'?: string;
	};

export const PreloadableUserPopout = React.forwardRef<
	HTMLElement,
	{
		user: UserRecord;
		isWebhook: boolean;
		guildId?: string;
		channelId?: string;
		variant?: 'default' | 'memberList';
		children: React.ReactNode;
		position?: PopoutPosition;
		disableContextMenu?: boolean;
		disableBackdrop?: boolean;
		onPopoutOpen?: () => void;
		onPopoutClose?: () => void;
		enableLongPressActions?: boolean;
	}
>(
	(
		{
			user,
			isWebhook,
			guildId,
			channelId,
			variant = 'default',
			children,
			position = 'right-start',
			disableContextMenu = false,
			disableBackdrop = false,
			onPopoutOpen,
			onPopoutClose,
			enableLongPressActions = false,
		},
		ref,
	) => {
		const mobileLayout = MobileLayoutStore;
		const [showActionsSheet, setShowActionsSheet] = React.useState(false);
		const profileTapStartRef = React.useRef<{x: number; y: number} | null>(null);

		const member = guildId ? GuildMemberStore.getMember(guildId, user.id) : null;

		const openMobileProfile = React.useCallback(() => {
			if (isWebhook) return;
			UserProfileActionCreators.openUserProfile(user.id, guildId);
		}, [user.id, guildId, isWebhook]);

		const handleMobileClick = React.useCallback(
			(event: React.MouseEvent<HTMLElement>) => {
				event.stopPropagation();
				openMobileProfile();
			},
			[openMobileProfile],
		);

		const handleMobileTouchStart = React.useCallback((event: React.TouchEvent<HTMLElement>) => {
			event.stopPropagation();
			const touch = event.touches[0];
			if (!touch) return;
			profileTapStartRef.current = {x: touch.clientX, y: touch.clientY};
		}, []);

		const handleMobileTouchEnd = React.useCallback(
			(event: React.TouchEvent<HTMLElement>) => {
				event.stopPropagation();
				const start = profileTapStartRef.current;
				profileTapStartRef.current = null;
				if (!start || isWebhook) return;

				const touch = event.changedTouches[0];
				if (!touch) return;

				const dx = Math.abs(touch.clientX - start.x);
				const dy = Math.abs(touch.clientY - start.y);
				if (dx <= 12 && dy <= 12) {
					openMobileProfile();
				}
			},
			[isWebhook, openMobileProfile],
		);

		const handleContextMenu = React.useCallback(
			(event: React.MouseEvent<Element>) => {
				if (isWebhook) return;

				event.preventDefault();
				event.stopPropagation();

				const isGuildMember = guildId ? GuildMemberStore.getMember(guildId, user.id) : null;

				ContextMenuActionCreators.openFromEvent(event, ({onClose}) =>
					guildId && isGuildMember ? (
						<GuildMemberContextMenu user={user} onClose={onClose} guildId={guildId} channelId={channelId} />
					) : (
						<UserContextMenu user={user} onClose={onClose} guildId={guildId} channelId={channelId} />
					),
				);
			},
			[user, guildId, channelId, isWebhook],
		);

		const handleLongPress = React.useCallback(() => {
			if (isWebhook) return;
			setShowActionsSheet(true);
		}, [isWebhook]);

		const handleCloseActionsSheet = React.useCallback(() => {
			setShowActionsSheet(false);
		}, []);

		if (mobileLayout.enabled) {
			const child = React.Children.only(children) as React.ReactElement<PreloadableChildProps>;
			const {
				onClick: originalOnClick,
				onContextMenu: originalOnContextMenu,
				onTouchStart: originalTouchStart,
				onTouchEnd: originalTouchEnd,
			} = child.props;

			const clonedChild = React.cloneElement(child, {
				ref,
				'data-message-swipe-ignore': 'true',
				onClick: (event: React.MouseEvent<HTMLElement>) => {
					if (originalOnClick) {
						(originalOnClick as React.MouseEventHandler<HTMLElement>)(event);
					}
					handleMobileClick(event);
				},
				onTouchStart: (event: React.TouchEvent<HTMLElement>) => {
					if (originalTouchStart) {
						(originalTouchStart as React.TouchEventHandler<HTMLElement>)(event);
					}
					handleMobileTouchStart(event);
				},
				onTouchEnd: (event: React.TouchEvent<HTMLElement>) => {
					if (originalTouchEnd) {
						(originalTouchEnd as React.TouchEventHandler<HTMLElement>)(event);
					}
					handleMobileTouchEnd(event);
				},
				onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
					if (originalOnContextMenu) {
						(originalOnContextMenu as React.MouseEventHandler<HTMLElement>)(event);
					}
					if (!disableContextMenu) {
						handleContextMenu(event);
					}
				},
			});

			if (enableLongPressActions && member) {
				return (
					<>
						<LongPressable onLongPress={handleLongPress} delay={500}>
							{clonedChild}
						</LongPressable>
						{showActionsSheet && guildId && (
							<GuildMemberActionsSheet
								isOpen={true}
								onClose={handleCloseActionsSheet}
								user={user}
								member={member}
								guildId={guildId}
							/>
						)}
					</>
				);
			}

			return clonedChild;
		}

		return (
			<Popout
				ref={ref}
				render={({popoutKey}) => (
					<UserProfilePopout
						popoutKey={popoutKey}
						user={user}
						isWebhook={isWebhook}
						guildId={guildId}
						variant={variant}
					/>
				)}
				position={position}
				disableBackdrop={disableBackdrop}
				onOpen={onPopoutOpen}
				onClose={onPopoutClose}
			>
				{disableContextMenu
					? children
					: React.cloneElement(React.Children.only(children) as React.ReactElement<PreloadableChildProps>, {
							onContextMenu: handleContextMenu,
						})}
			</Popout>
		);
	},
);
