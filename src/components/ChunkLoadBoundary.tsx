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
import {isChunkLoadError, recoverFromChunkLoadError} from '~/utils/chunkLoadRecovery';

interface ChunkLoadBoundaryProps {
	children: React.ReactNode;
}

interface ChunkLoadBoundaryState {
	hasError: boolean;
	error: unknown;
	recovering: boolean;
}

/**
 * Error boundary for React.lazy fences: turns a chunk that failed to download
 * into a single hard reload instead of a crash screen.
 *
 * A tab that is still holding the index.html from before a redeploy asks for
 * chunk names the server no longer has (production serves the frontend from the
 * rspack dev server, whose chunk filenames are not content-hashed, so the old
 * names disappear rather than linger). The lazy payload rejects, the rejection
 * is thrown from render, and without this boundary it climbs all the way to the
 * root Sentry boundary — replacing the whole app with the crash fallback for
 * what is really one missing file.
 *
 * Everything that is not a chunk-load failure is re-thrown untouched, so the
 * root boundary keeps seeing exactly the errors it saw before.
 */
export class ChunkLoadBoundary extends React.Component<ChunkLoadBoundaryProps, ChunkLoadBoundaryState> {
	constructor(props: ChunkLoadBoundaryProps) {
		super(props);
		this.state = {hasError: false, error: null, recovering: false};
	}

	static getDerivedStateFromError(error: unknown): ChunkLoadBoundaryState {
		return {hasError: true, error, recovering: isChunkLoadError(error)};
	}

	override componentDidCatch(error: unknown): void {
		if (!isChunkLoadError(error)) {
			return;
		}

		// console.warn rather than console.error on purpose: Sentry's
		// captureConsoleIntegration files every console.error as an issue, and a
		// stale-deploy chunk miss is an expected, self-healing condition.
		console.warn('[ChunkLoadBoundary] A code-split chunk failed to load; reloading for a fresh index.html', error);

		if (!recoverFromChunkLoadError()) {
			// A reload was already spent on this recently and the chunk is still
			// missing, so reloading again would only loop. Let the error through to
			// the crash screen, which offers the update / reset actions.
			this.setState({recovering: false});
		}
	}

	override render(): React.ReactNode {
		if (this.state.hasError && !this.state.recovering) {
			throw this.state.error;
		}

		// While the reload is in flight, render nothing rather than a fallback that
		// would flash for the moment before the document is replaced.
		return this.state.recovering ? null : this.props.children;
	}
}
