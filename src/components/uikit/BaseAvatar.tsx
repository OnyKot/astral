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
import {PhoneCallIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import React from 'react';
import type {StatusType} from '~/Constants';
import {getStatusTypeLabel, normalizeStatus, StatusTypes} from '~/Constants';
import {getStatusGeometry} from '~/components/uikit/AvatarStatusGeometry';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import FocusManager from '~/lib/FocusManager';
import styles from './BaseAvatar.module.css';

interface BaseAvatarProps {
	size: number;
	avatarUrl: string;
	hoverAvatarUrl?: string;
	status?: StatusType | string | null;
	shouldPlayAnimated?: boolean;
	isTyping?: boolean;
	isInCall?: boolean;
	showOffline?: boolean;
	className?: string;
	isClickable?: boolean;
	userTag?: string;
	statusLabel?: string | null;
	disableStatusTooltip?: boolean;
	isMobileStatus?: boolean;
	isStreaming?: boolean;
	statusScale?: number;
}

export const BaseAvatar = React.forwardRef<HTMLDivElement, BaseAvatarProps>(
	(
		{
			size,
			avatarUrl,
			hoverAvatarUrl,
			status,
			shouldPlayAnimated = false,
			isTyping = false,
			isInCall = false,
			showOffline = true,
			className,
			isClickable = false,
			userTag,
			statusLabel,
			disableStatusTooltip = false,
			isMobileStatus: _isMobileStatus = false,
			isStreaming = false,
			statusScale = 1,
			...props
		},
		ref,
	) => {
		const {t, i18n} = useLingui();
		const [isFocused, setIsFocused] = React.useState(FocusManager.isFocused());

		React.useEffect(() => {
			const unsubscribe = FocusManager.subscribe(setIsFocused);
			return unsubscribe;
		}, []);

		const normalizedStatus = status == null ? null : normalizeStatus(status);
		const renderableStatus = resolveRenderableStatus(normalizedStatus);
		const shouldRenderStreaming =
			isStreaming &&
			!isTyping &&
			!isInCall &&
			normalizedStatus != null &&
			normalizedStatus !== StatusTypes.INVISIBLE &&
			renderableStatus !== StatusTypes.OFFLINE;

		const rawId = React.useId();
		const safeId = rawId.replace(/:/g, '');
		const dynamicAvatarMaskId = `svg-mask-avatar-dynamic-${safeId}`;

		const shouldShowStatus =
			size > 16 &&
			(isTyping || isInCall || (normalizedStatus != null && (showOffline || renderableStatus !== StatusTypes.OFFLINE)));

		const statusGeom = shouldShowStatus ? getStatusGeometry(size, false) : null;

		const rawStatusSize = statusGeom ? Math.round(statusGeom.size) : 0;
		const safeStatusScale = Number.isFinite(statusScale) ? Math.max(1, Math.min(statusScale, 1.45)) : 1;
		const statusSize = rawStatusSize > 0 ? Math.round(rawStatusSize * safeStatusScale) : 0;
		const cutoutR = statusGeom ? (statusGeom.radius ?? 0) + Math.max(0, statusSize - rawStatusSize) / 2 : 0;
		const cutoutCx = statusGeom?.cx ?? 0;
		const cutoutCy = statusGeom?.cy ?? 0;
		const statusRight = statusGeom ? Math.round((size - statusGeom.cx - statusSize / 2) * 100) / 100 : 0;
		const statusBottom = statusGeom ? Math.round((size - statusGeom.cy - statusSize / 2) * 100) / 100 : 0;

		const displayUrl = shouldPlayAnimated && hoverAvatarUrl && isFocused ? hoverAvatarUrl : avatarUrl;

		const avatarMaskId = shouldShowStatus && statusGeom ? dynamicAvatarMaskId : 'svg-mask-avatar-default';

		const statusColor = shouldRenderStreaming
			? 'var(--status-cosmic-core, var(--status-streaming, #9147ff))'
			: `var(--status-cosmic-core, var(--status-${renderableStatus}))`;
		const statusVariantClassName = getStatusVariantClassName(
			renderableStatus,
			isTyping,
			isInCall,
			shouldRenderStreaming,
		);
		const statusGlyphClassName = getStatusGlyphClassName(
			shouldRenderStreaming ? StatusTypes.ONLINE : renderableStatus,
			shouldRenderStreaming,
		);

		const dotDelays = [0, 250, 500] as const;

		const ariaLabel = statusLabel && userTag ? `${userTag}, ${statusLabel}` : userTag || t`Avatar`;
		const effectiveStatusLabel = isInCall
			? t`In call`
			: shouldRenderStreaming
				? t`Streaming`
			: statusLabel || (normalizedStatus ? getStatusTypeLabel(i18n, normalizedStatus) : '');

		return (
			// biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label is supported by both button and img roles
			<div
				ref={ref}
				className={`${styles.container} ${isClickable ? styles.clickable : ''} ${className || ''}`.trim()}
				role={isClickable ? 'button' : 'img'}
				aria-label={ariaLabel}
				style={{width: size, height: size}}
				aria-hidden={false}
				tabIndex={isClickable ? 0 : undefined}
				{...props}
			>
				<svg
					viewBox={`0 0 ${size} ${size}`}
					className={styles.overlay}
					style={{borderRadius: '50%'}}
					aria-hidden
					role="presentation"
				>
					{shouldShowStatus && statusGeom && (
						<defs>
							<mask id={dynamicAvatarMaskId} maskUnits="userSpaceOnUse" x={0} y={0} width={size} height={size}>
								<circle fill="white" cx={size / 2} cy={size / 2} r={size / 2} />
								<circle fill="black" cx={cutoutCx} cy={cutoutCy} r={cutoutR} />
							</mask>
						</defs>
					)}
					<image
						href={displayUrl}
						width={size}
						height={size}
						mask={`url(#${avatarMaskId})`}
						preserveAspectRatio="xMidYMid slice"
					/>
				</svg>

				<div className={styles.hoverOverlay} style={{borderRadius: '50%'}} />

				{shouldShowStatus && (
					<Tooltip text={effectiveStatusLabel}>
						<div
							className={clsx(styles.statusContainer, statusVariantClassName)}
							style={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: statusSize,
								height: statusSize,
								right: statusRight,
								bottom: statusBottom,
								pointerEvents: isTyping || disableStatusTooltip ? 'none' : 'auto',
								'--status-color': statusColor,
							} as React.CSSProperties & {'--status-color': string}}
							role="img"
							aria-label={isTyping ? t`Typing indicator` : `${effectiveStatusLabel} status`}
						>
							{isTyping ? (
								<div className={styles.typingIndicator} aria-hidden>
									{dotDelays.map((delay) => (
										<span key={delay} style={{animationDelay: `${delay}ms`}} />
									))}
								</div>
							) : isInCall ? (
								<div className={styles.inCallIndicator} aria-hidden>
									<PhoneCallIcon weight="fill" className={styles.inCallIcon} />
								</div>
							) : (
								<span className={clsx(styles.statusGlyph, statusGlyphClassName)} aria-hidden />
							)}
						</div>
					</Tooltip>
				)}
			</div>
		);
	},
);

BaseAvatar.displayName = 'BaseAvatar';

const resolveRenderableStatus = (status: StatusType | null | undefined): StatusType => {
	if (status == null) return StatusTypes.OFFLINE;
	if (status === StatusTypes.INVISIBLE) return StatusTypes.OFFLINE;
	return status;
};

const getStatusVariantClassName = (
	renderableStatus: StatusType,
	isTyping: boolean,
	isInCall: boolean,
	isStreaming: boolean,
): string => {
	if (isTyping) return styles.statusTyping;
	if (isInCall) return styles.statusInCall;
	if (isStreaming) return styles.statusStreaming;

	switch (renderableStatus) {
		case StatusTypes.ONLINE:
			return styles.statusOnline;
		case StatusTypes.IDLE:
			return styles.statusIdle;
		case StatusTypes.DND:
			return styles.statusDnd;
		case StatusTypes.OFFLINE:
		default:
			return styles.statusOffline;
	}
};

const getStatusGlyphClassName = (renderableStatus: StatusType, isStreaming: boolean): string => {
	if (isStreaming) return styles.statusGlyphStreaming;

	switch (renderableStatus) {
		case StatusTypes.IDLE:
			return styles.statusGlyphIdle;
		case StatusTypes.DND:
			return styles.statusGlyphDnd;
		case StatusTypes.OFFLINE:
			return styles.statusGlyphOffline;
		case StatusTypes.ONLINE:
		default:
			return styles.statusGlyphOnline;
	}
};
