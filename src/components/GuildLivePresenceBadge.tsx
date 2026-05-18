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

// Drop-in component that renders live "X online · Y members" counts for a
// guild, backed by the C++ `userver_presence` service. Safe to mount many
// instances — the underlying hook polls and the server caches per id.
//
// Visual layer is intentionally tiny so designers can wrap or restyle
// freely. The component takes a `className` to slot into existing styles.

import React from 'react';
import {useGuildPresenceCounts, type UseGuildPresenceCountsOptions} from '~/hooks/useGuildPresenceCounts';

interface GuildLivePresenceBadgeProps extends UseGuildPresenceCountsOptions {
	guildId: string;
	className?: string;
	// Optional renderers so the badge can be embedded in marketing layouts
	// or compact channel headers without forking the component.
	renderLoading?: () => React.ReactNode;
	renderError?: (err: Error) => React.ReactNode;
	renderNotFound?: () => React.ReactNode;
	renderCounts?: (counts: {memberCount: number; presenceCount: number}) => React.ReactNode;
}

const formatNumber = (n: number): string => {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return n.toString();
};

export const GuildLivePresenceBadge: React.FC<GuildLivePresenceBadgeProps> = ({
	guildId,
	className,
	renderLoading,
	renderError,
	renderNotFound,
	renderCounts,
	...options
}) => {
	const {data, error, loading, notFound} = useGuildPresenceCounts(guildId, options);

	if (loading && !data) {
		return <span className={className}>{renderLoading ? renderLoading() : '…'}</span>;
	}
	if (notFound) {
		return <span className={className}>{renderNotFound ? renderNotFound() : null}</span>;
	}
	if (error && !data) {
		return <span className={className}>{renderError ? renderError(error) : null}</span>;
	}
	if (!data) {
		return null;
	}

	if (renderCounts) {
		return <span className={className}>{renderCounts(data)}</span>;
	}

	return (
		<span className={className} aria-live="polite">
			<span aria-label="online members">
				<span style={{display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: '#23a55a', marginRight: 6}} />
				{formatNumber(data.presenceCount)} online
			</span>
			<span aria-hidden="true" style={{margin: '0 6px', opacity: 0.5}}>·</span>
			<span aria-label="total members">{formatNumber(data.memberCount)} members</span>
		</span>
	);
};
