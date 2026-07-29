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

import type {UserID} from '~/BrandedTypes';
import {AccessDeniedError} from '~/Errors';

/**
 * Hardcoded list of root operator user ids that the admin panel must never
 * be able to ban, suspend, delete, change credentials of, or otherwise
 * mutate. Even an admin holding the WILDCARD ('*') ACL goes through this
 * gate.
 *
 * Why hardcoded and not stored in DB:
 *   * if an attacker compromises an admin account they could otherwise
 *     remove the protection flag from the DB and then ban the root;
 *   * if Cassandra goes funny, the protection still holds;
 *   * the cost of "to add or remove a root, you must redeploy the api"
 *     is intentional — it should never be frequent and should always
 *     leave a git audit trail.
 *
 * The protection covers admin-panel mutations only. The protected user
 * can still self-delete, self-ban, change their own profile, etc. via
 * normal user APIs.
 */
export const PROTECTED_ROOT_USER_IDS: ReadonlySet<string> = new Set([
	// Ice#101 (abloko362@gmail.com) — instance founder.
	'1474497271369379840',
]);

export function isProtectedRootUser(userId: UserID | string | bigint): boolean {
	const asString = typeof userId === 'string' ? userId : userId.toString();
	return PROTECTED_ROOT_USER_IDS.has(asString);
}

/**
 * Throw AccessDeniedError if the given user is a protected root operator.
 * Call this in any admin service method that mutates a target user
 * (ban, delete, terminate sessions, change profile, change email, etc.).
 *
 * The error message is intentionally vague — we don't want to leak the
 * exact list of root operators to a curious admin probing the admin panel.
 */
export function assertNotProtectedTarget(targetUserId: UserID | string | bigint): void {
	if (isProtectedRootUser(targetUserId)) {
		throw new AccessDeniedError('Operation not permitted on this account.');
	}
}

/** Same idea but for bulk operations: filters protected ids out and
 *  returns the safe-to-mutate subset plus the list of skipped ids. */
export function partitionOutProtected<T extends UserID | string | bigint>(
	ids: ReadonlyArray<T>,
): {allowed: Array<T>; skipped: Array<T>} {
	const allowed: Array<T> = [];
	const skipped: Array<T> = [];
	for (const id of ids) {
		if (isProtectedRootUser(id)) skipped.push(id);
		else allowed.push(id);
	}
	return {allowed, skipped};
}
