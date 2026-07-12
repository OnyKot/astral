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
import {CaretRightIcon, GearIcon, SealCheckIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {motion, type MotionValue} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as ContextMenuActionCreators from '~/actions/ContextMenuActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import {GuildFeatures, Permissions} from '~/Constants';
import {GuildHeaderBottomSheet} from '~/components/bottomsheets/GuildHeaderBottomSheet';
import {GuildHeaderShell} from '~/components/layout/GuildHeaderShell';
import {GuildSettingsModal} from '~/components/modals/GuildSettingsModal';
import {GuildIcon} from '~/components/popouts/GuildIcon';
import {NativeDragRegion} from '~/components/layout/NativeDragRegion';
import {GuildHeaderPopout} from '~/components/popouts/GuildHeaderPopout';
import {GuildContextMenu} from '~/components/uikit/ContextMenu/GuildContextMenu';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import {useAnimatedNumber} from '~/hooks/useAnimatedNumber';
import {useGuildPresenceCounts} from '~/hooks/useGuildPresenceCounts';
import type {GuildRecord} from '~/records/GuildRecord';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import ChannelListLayoutStore from '~/stores/ChannelListLayoutStore';
import GuildMemberStore from '~/stores/GuildMemberStore';
import PermissionStore from '~/stores/PermissionStore';
import PresenceStore from '~/stores/PresenceStore';
import * as AvatarUtils from '~/utils/AvatarUtils';
import styles from './GuildHeader.module.css';

const HEADER_MIN_HEIGHT = 56;
const DEFAULT_BANNER_ASPECT_RATIO = 16 / 9;
const MAX_VIEWPORT_HEIGHT_FRACTION = 0.3;
const MAX_VIEWPORT_HEIGHT_FRACTION_MOBILE = 0.22;
const BANNER_COLLAPSE_DISTANCE_DESKTOP = 112;
const BANNER_COLLAPSE_DISTANCE_MOBILE = 80;

interface GuildHeaderProps {
	guild: GuildRecord;
	scrollY?: MotionValue<number>;
}

export const GuildHeader = observer(({guild, scrollY}: GuildHeaderProps) => {
	const {t} = useLingui();
	const isMobile = MobileLayoutStore.isMobileLayout();
	const sidebarCollapsed = !isMobile && ChannelListLayoutStore.getSidebarCollapsed();

	const bannerURL = AvatarUtils.getGuildBannerURL({id: guild.id, banner: guild.banner}, true);
	const isDetachedBanner = guild.features.has(GuildFeatures.DETACHED_BANNER);
	const showIntegratedBanner = isMobile && Boolean(bannerURL && !isDetachedBanner);
	const {data: liveCounts} = useGuildPresenceCounts(guild.id, {intervalMs: 10000});
	const presenceCount = Math.max(PresenceStore.getPresenceCount(guild.id), liveCounts?.presenceCount ?? 0);
	const cachedMemberCount = GuildMemberStore.getMemberCount(guild.id);
	const memberCount = Math.max(guild.memberCount ?? 0, liveCounts?.memberCount ?? 0, cachedMemberCount);
	const animatedMemberCount = useAnimatedNumber(memberCount, {durationMs: 700});
	const animatedPresenceCount = useAnimatedNumber(presenceCount, {durationMs: 560});
	const countFormatter = React.useMemo(() => new Intl.NumberFormat(), []);
	const memberCountLabel = `${countFormatter.format(animatedMemberCount)} ${
		animatedMemberCount === 1 ? t`Member` : t`Members`
	}`;
	const presenceCountLabel = `${countFormatter.format(animatedPresenceCount)} ${t`Online`}`;
	const canManageGuild = PermissionStore.can(Permissions.MANAGE_GUILD, {guildId: guild.id});
	const canManageRoles = PermissionStore.can(Permissions.MANAGE_ROLES, {guildId: guild.id});
	const canViewAuditLog = PermissionStore.can(Permissions.VIEW_AUDIT_LOG, {guildId: guild.id});
	const canManageWebhooks = PermissionStore.can(Permissions.MANAGE_WEBHOOKS, {guildId: guild.id});
	const canManageEmojis = PermissionStore.can(Permissions.MANAGE_EXPRESSIONS, {guildId: guild.id});
	const canBanMembers = PermissionStore.can(Permissions.BAN_MEMBERS, {guildId: guild.id});
	const canAccessGuildSettings =
		canManageGuild || canManageRoles || canViewAuditLog || canManageWebhooks || canManageEmojis || canBanMembers;

	const headerContainerRef = React.useRef<HTMLDivElement | null>(null);

	const calculateBannerLayout = React.useCallback(() => {
		if (!showIntegratedBanner || !bannerURL) {
			return {height: HEADER_MIN_HEIGHT, centerCrop: false};
		}

		const width = headerContainerRef.current?.clientWidth ?? window.innerWidth;
		if (!width) return {height: HEADER_MIN_HEIGHT, centerCrop: false};

		const aspectRatio =
			guild.bannerWidth && guild.bannerHeight ? guild.bannerWidth / guild.bannerHeight : DEFAULT_BANNER_ASPECT_RATIO;

		const idealHeight = width / aspectRatio;
		const viewportCap = window.innerHeight * (isMobile ? MAX_VIEWPORT_HEIGHT_FRACTION_MOBILE : MAX_VIEWPORT_HEIGHT_FRACTION);
		const isCapped = idealHeight > viewportCap;

		return {
			height: Math.max(HEADER_MIN_HEIGHT, Math.min(idealHeight, viewportCap)),
			centerCrop: isMobile && isCapped,
		};
	}, [showIntegratedBanner, bannerURL, guild.bannerWidth, guild.bannerHeight, isMobile]);

	const [{height: bannerMaxHeight, centerCrop}, setBannerLayout] = React.useState(() => calculateBannerLayout());
	const [scrollTop, setScrollTop] = React.useState(() => scrollY?.get() ?? 0);
	const scrollAnimationFrameRef = React.useRef<number | null>(null);
	const pendingScrollTopRef = React.useRef(0);

	React.useLayoutEffect(() => {
		const updateLayout = () => setBannerLayout(calculateBannerLayout());
		updateLayout();
		window.addEventListener('resize', updateLayout);
		return () => window.removeEventListener('resize', updateLayout);
	}, [calculateBannerLayout]);

	React.useEffect(() => {
		if (!scrollY) {
			pendingScrollTopRef.current = 0;
			setScrollTop(0);
			return;
		}

		const current = scrollY.get();
		pendingScrollTopRef.current = current;
		setScrollTop(current);

		const unsubscribe = scrollY.on('change', (latest) => {
			pendingScrollTopRef.current = latest;
			if (scrollAnimationFrameRef.current != null) {
				return;
			}

			scrollAnimationFrameRef.current = window.requestAnimationFrame(() => {
				scrollAnimationFrameRef.current = null;
				const next = pendingScrollTopRef.current;
				setScrollTop((previous) => (Math.abs(next - previous) < 1 ? previous : next));
			});
		});
		return () => {
			unsubscribe();
			if (scrollAnimationFrameRef.current != null) {
				window.cancelAnimationFrame(scrollAnimationFrameRef.current);
				scrollAnimationFrameRef.current = null;
			}
		};
	}, [scrollY]);

	const collapseDistance = isMobile ? BANNER_COLLAPSE_DISTANCE_MOBILE : BANNER_COLLAPSE_DISTANCE_DESKTOP;
	const rawCollapseProgress = showIntegratedBanner ? Math.min(Math.max(scrollTop / collapseDistance, 0), 1) : 1;
	const collapseProgress =
		rawCollapseProgress >= 1 ? 1 : rawCollapseProgress * rawCollapseProgress * (3 - 2 * rawCollapseProgress);
	const collapseRatio = 1 - collapseProgress;
	const isBannerCollapsed = showIntegratedBanner && collapseProgress >= 0.92;
	const dynamicHeaderHeight =
		showIntegratedBanner
			? Math.max(HEADER_MIN_HEIGHT, bannerMaxHeight - (bannerMaxHeight - HEADER_MIN_HEIGHT) * collapseProgress)
			: HEADER_MIN_HEIGHT;

	const headerInlineStyles = React.useMemo(() => {
		return {
			height: dynamicHeaderHeight,
			'--guild-banner-progress': `${collapseProgress}`,
			'--guild-banner-visible': `${collapseRatio}`,
			'--guild-banner-progress-pct': `${Math.round(collapseProgress * 100)}%`,
			'--guild-banner-visible-pct': `${Math.round(collapseRatio * 100)}%`,
		} as React.CSSProperties;
	}, [collapseProgress, collapseRatio, dynamicHeaderHeight]);

	const handleContextMenu = React.useCallback(
		(event: React.MouseEvent) => {
			ContextMenuActionCreators.openFromEvent(event, ({onClose}) => (
				<GuildContextMenu guild={guild} onClose={onClose} />
			));
		},
		[guild],
	);
	const handleOpenCommunitySettings = React.useCallback(() => {
		ModalActionCreators.push(modal(() => <GuildSettingsModal guildId={guild.id} />));
	}, [guild.id]);

	const headerButtonRef = React.useRef<HTMLDivElement | null>(null);

	return (
		<div className={clsx(styles.headerWrapper, sidebarCollapsed && styles.headerWrapperCollapsed)}>
			<NativeDragRegion
				as={motion.div}
				ref={headerContainerRef}
				className={clsx(
					styles.headerContainer,
					showIntegratedBanner && styles.headerContainerWithBanner,
					showIntegratedBanner && isBannerCollapsed && styles.headerContainerCollapsed,
					!showIntegratedBanner && styles.headerContainerNoBanner,
					!isMobile && styles.headerContainerDesktop,
					sidebarCollapsed && styles.headerContainerSidebarCollapsed,
				)}
				style={headerInlineStyles}
			>
				{showIntegratedBanner && (
					<>
						<div
							className={clsx(styles.bannerBackground, centerCrop && styles.bannerBackgroundCentered)}
							style={{backgroundImage: `url(${bannerURL})`}}
						/>
						<div className={styles.bannerGradient} />
					</>
				)}

				{isMobile ? (
					<GuildHeaderShell
						popoutId="guild-header"
						renderPopout={() => <GuildHeaderPopout guild={guild} />}
						renderBottomSheet={({isOpen, onClose}) => (
							<GuildHeaderBottomSheet isOpen={isOpen} onClose={onClose} guild={guild} />
						)}
						onContextMenu={handleContextMenu}
						className={styles.headerContent}
						triggerRef={headerButtonRef}
					>
						<div className={styles.mobileHeaderCard}>
							<div className={styles.mobileHeaderIconWrap}>
								<GuildIcon id={guild.id} name={guild.name} icon={guild.icon} sizePx={40} className={styles.mobileGuildIcon} />
							</div>
							<div className={styles.mobileHeaderText}>
								<div className={styles.mobileHeaderTitleRow}>
									{guild.features.has(GuildFeatures.VERIFIED) && (
										<Tooltip text={t`Verified Community`} position="bottom">
											<SealCheckIcon
												className={showIntegratedBanner ? styles.verifiedIconWithBanner : styles.verifiedIconDefault}
											/>
										</Tooltip>
									)}
									<span className={showIntegratedBanner ? styles.guildNameWithBanner : styles.guildNameDefault}>
										{guild.name}
									</span>
								</div>
								<div className={styles.mobileHeaderStats}>
									<span className={styles.mobileHeaderStat}>{memberCountLabel}</span>
									<span className={styles.mobileHeaderStat}>{presenceCountLabel}</span>
								</div>
							</div>
						</div>
					</GuildHeaderShell>
				) : (
					<div ref={headerButtonRef} className={clsx(styles.headerContent, styles.headerContentDesktop)}>
						<div className={clsx(styles.guildIdentity, styles.guildIdentityDesktopTextOnly)}>
							<div className={styles.identityText}>
								<div className={styles.guildNameDesktop}>{guild.name}</div>
								<div className={styles.identityMeta}>
									{guild.features.has(GuildFeatures.VERIFIED) && (
										<Tooltip text={t`Verified Community`} position="bottom">
											<span className={styles.verifiedBadge}>
												<SealCheckIcon weight="fill" className={styles.verifiedBadgeIcon} />
												<span>{t`Verified`}</span>
											</span>
										</Tooltip>
									)}
								</div>
							</div>
						</div>
						<div className={clsx(styles.headerActions, sidebarCollapsed && styles.headerActionsCollapsed)}>
							{canAccessGuildSettings && (
								<Tooltip text={t`Community Settings`} position="bottom">
									<button
										type="button"
										className={styles.headerActionButton}
										onClick={handleOpenCommunitySettings}
										aria-label={t`Community Settings`}
									>
										<GearIcon weight="bold" className={styles.headerActionIcon} />
									</button>
								</Tooltip>
							)}
							<Tooltip text={sidebarCollapsed ? t`Expand channel list` : t`Collapse channel list`} position="bottom">
								<button
									type="button"
									className={clsx(styles.headerActionButton, sidebarCollapsed && styles.headerActionButtonActive)}
									onClick={() => ChannelListLayoutStore.toggleSidebarCollapsed()}
									aria-label={sidebarCollapsed ? t`Expand channel list` : t`Collapse channel list`}
								>
									<CaretRightIcon
										weight="bold"
										className={clsx(
											styles.headerActionIcon,
											!sidebarCollapsed && styles.headerActionIconCollapse,
										)}
									/>
								</button>
							</Tooltip>
						</div>
					</div>
				)}
			</NativeDragRegion>
		</div>
	);
});
