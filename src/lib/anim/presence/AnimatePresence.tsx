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
 * but WITHOUT ANY WARRANTY; without even implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Astral. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * AnimatePresence — keeps exiting children mounted until their exit animation
 * finishes, then unmounts them.
 *
 * The motion child participates: it reads the presence context, and when its
 * key is marked absent it plays its own `exit` animation, then calls
 * `notifyExitComplete(key)` so the presence can drop it. This mirrors how
 * framer-motion does it (the child owns its exit; the presence owns the
 * lifecycle) and avoids fragile prop-capture cloning.
 *
 * Modes:
 *   - sync (default): exiting + entering children animate simultaneously.
 *   - "wait": entering children are held until all exits finish, then flushed.
 *     (AuthRegisterWizardCore, MobileSettingsView, etc. use this for step
 *     transitions.)
 *   - "popLayout": on exit, capture the child's bounding rect and set
 *     position:absolute + captured top/left/width so siblings reflow
 *     immediately. Without layout animations (we have none), siblings snap
 *     rather than glide — acceptable for the 2 consumers (single toast /
 *     nagbar). A CSS `transition: transform .2s` on the sibling container is
 *     the cheap mitigation if the snap is visible.
 *
 * `initial={false}`: skip the enter animation on the presence's FIRST mount
 * only (subsequent enters animate). `custom`: stored in a ref (always latest);
 * exiting children read it at exit-start to resolve variant functions.
 */

import {useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import * as React from 'react';

import type {Transition} from '../types';

type Mode = 'sync' | 'wait' | 'popLayout';

export interface PresenceContextValue {
	custom: unknown;
	/** Whether enter animations should run on the presence's first mount. */
	initial: boolean;
	mode: Mode;
	/** The key of the child this context is scoped to (set by the per-child wrapper). */
	key: string | null;
	/** A child calls this when its exit animation finishes (or it has no exit). */
	notifyExitComplete: (key: string) => void;
	/** Register a child as exiting so it stays mounted until it calls notifyExitComplete. */
	markExiting: (key: string) => void;
	/** Whether the given key is currently present (not exiting). */
	isPresent: (key: string) => boolean;
}

export const PresenceContext = React.createContext<PresenceContextValue | null>(null);

interface ChildRecord {
	key: string;
	node: ReactNode;
}

/** Flatten children to a keyed list (only elements with a key are trackable). */
function toKeyedChildren(children: ReactNode): ChildRecord[] {
	const arr = Array.isArray(children) ? children : [children];
	const out: ChildRecord[] = [];
	React.Children.forEach(arr, (child) => {
		if (child == null || typeof child === 'boolean') return;
		const key = (child as {key?: string}).key;
		if (key == null) return;
		out.push({key: String(key), node: child});
	});
	return out;
}

export interface AnimatePresenceProps {
	children?: ReactNode;
	mode?: Mode;
	initial?: boolean;
	custom?: unknown;
	onExitComplete?: () => void;
}

export function AnimatePresence({children, mode = 'sync', initial = true, custom, onExitComplete}: AnimatePresenceProps) {
	const [presentChildren, setPresentChildren] = useState<ChildRecord[]>(() => toKeyedChildren(children));
	const exitingKeysRef = useRef<Set<string>>(new Set());
	const isFirstMount = useRef(true);
	const pendingEnterQueue = useRef<ChildRecord[] | null>(null);
	const customRef = useRef(custom);
	customRef.current = custom;

	useLayoutEffect(() => {
		isFirstMount.current = false;
	}, []);

	const nextKeyed = toKeyedChildren(children);
	const nextKeys = new Set(nextKeyed.map((c) => c.key));

	useLayoutEffect(() => {
		const currentKeys = new Set(presentChildren.map((c) => c.key));
		const removed = [...currentKeys].filter((k) => !nextKeys.has(k));
		const added = nextKeyed.filter((c) => !currentKeys.has(c.key));

		if (removed.length === 0 && added.length === 0) {
			// No structural change — just refresh node content in place.
			setPresentChildren((prev) => prev.map((rec) => ({...rec, node: nextKeyed.find((n) => n.key === rec.key)?.node ?? rec.node})));
			return;
		}

		if (mode === 'wait' && removed.length > 0) {
			// Hold enters in a queue until exits finish, then flush.
			pendingEnterQueue.current = added;
			setPresentChildren((prev) =>
				prev.map((rec) => ({...rec, node: nextKeyed.find((n) => n.key === rec.key)?.node ?? rec.node})),
			);
			for (const k of removed) exitingKeysRef.current.add(k);
			return;
		}

		// sync / popLayout: exiting children stay until they call notifyExitComplete;
		// entering children are added immediately.
		setPresentChildren((prev) => {
			const map = new Map(prev.map((r) => [r.key, r]));
			// Refresh existing nodes.
			for (const rec of nextKeyed) {
				const existing = map.get(rec.key);
				if (existing) existing.node = rec.node;
				else map.set(rec.key, {...rec});
			}
			return Array.from(map.values());
		});
		for (const k of removed) exitingKeysRef.current.add(k);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [children, mode]);

	const flushEnterQueue = () => {
		if (pendingEnterQueue.current == null) return;
		const queued = pendingEnterQueue.current;
		pendingEnterQueue.current = null;
		setPresentChildren((prev) => {
			const map = new Map(prev.map((r) => [r.key, r]));
			for (const rec of queued) map.set(rec.key, rec);
			return Array.from(map.values());
		});
	};

	const notifyExitComplete = (key: string) => {
		exitingKeysRef.current.delete(key);
		setPresentChildren((prev) => prev.filter((rec) => rec.key !== key));
		if (mode === 'wait' && exitingKeysRef.current.size === 0) {
			flushEnterQueue();
		}
		if (exitingKeysRef.current.size === 0) {
			onExitComplete?.();
		}
	};

	const markExiting = (key: string) => {
		exitingKeysRef.current.add(key);
	};

	const isPresent = (key: string) => !exitingKeysRef.current.has(key);

	const ctxValue: PresenceContextValue = {
		custom: customRef.current,
		initial,
		mode,
		key: null,
		notifyExitComplete,
		markExiting,
		isPresent,
	};

	return (
		<PresenceContext.Provider value={ctxValue}>
			{presentChildren.map((rec) => (
				<PresenceKeyScope key={rec.key} keyId={rec.key}>
					{rec.node}
				</PresenceKeyScope>
			))}
		</PresenceContext.Provider>
	);
}

/** Scopes the presence context to a single child key so the child knows its own key. */
function PresenceKeyScope({keyId, children}: {keyId: string; children: ReactNode}) {
	const parent = React.useContext(PresenceContext);
	const scoped = React.useMemo<PresenceContextValue | null>(
		() => (parent ? {...parent, key: keyId} : null),
		[parent, keyId],
	);
	return <PresenceContext.Provider value={scoped}>{children}</PresenceContext.Provider>;
}
