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
 * useMotionValue — a reactive number/string box.
 *
 * NOT React-reactive (matches framer-motion): `.set()` does not trigger a
 * re-render. Consumers subscribe imperatively via `.on('change', cb)`, which
 * returns an unsubscribe. The one real consumer is GuildNavbar, which creates
 * a `scrollY` motion value and threads it to GuildHeader + ChannelListContent;
 * those components subscribe with `.on('change')` and update their own state
 * in a rAF-throttled callback. `.get()` reads the current value synchronously.
 *
 * Built on eventemitter3 (already a dependency) for the change notifications.
 */

import {useMemo} from 'react';
import EventEmitter from 'eventemitter3';

import type {MotionValue} from '../types';

class MotionValueImpl<T> implements MotionValue<T> {
	private value: T;
	private emitter = new EventEmitter();
	private lastSetAt = 0;
	private lastVelocity = 0;

	constructor(initial: T) {
		this.value = initial;
	}

	get(): T {
		return this.value;
	}

	set(next: T): void {
		if (next === this.value) return;
		const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
		const dt = Math.max(now - this.lastSetAt, 1);
		this.lastVelocity = ((next as unknown as number) - (this.value as unknown as number)) / (dt / 1000);
		this.value = next;
		this.lastSetAt = now;
		this.emitter.emit('change', next);
	}

	on(_event: 'change', callback: (latest: T) => void): () => void {
		this.emitter.on('change', callback);
		return () => this.emitter.off('change', callback);
	}

	getVelocity(): number {
		return this.lastVelocity;
	}

	destroy(): void {
		this.emitter.removeAllListeners();
	}
}

export function useMotionValue<T = number>(initial: T): MotionValue<T> {
	return useMemo(() => new MotionValueImpl<T>(initial), []);
}
