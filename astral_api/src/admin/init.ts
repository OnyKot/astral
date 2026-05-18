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

import {createUserID} from '~/BrandedTypes';
import {Config} from '~/Config';
import {AdminACLs} from '~/Constants';
import {Logger} from '~/Logger';
import {UserRepository} from '~/user/UserRepository';

const DEFAULT_BOOTSTRAP_ACLS = [AdminACLs.WILDCARD];

function hasBootstrapTargets(): boolean {
	return Config.adminBootstrap.userIds.length > 0 || Config.adminBootstrap.emails.length > 0;
}

function getBootstrapAcls(): Array<string> {
	if (Config.adminBootstrap.acls.length > 0) {
		return Array.from(new Set(Config.adminBootstrap.acls));
	}

	return DEFAULT_BOOTSTRAP_ACLS;
}

export async function initializeAdminBootstrap(): Promise<void> {
	if (!hasBootstrapTargets()) {
		return;
	}

	try {
		const userRepository = new UserRepository();
		const bootstrapAcls = getBootstrapAcls();
		const targetUserIds = new Set<string>();

		for (const configuredUserId of Config.adminBootstrap.userIds) {
			try {
				targetUserIds.add(createUserID(BigInt(configuredUserId)).toString());
			} catch (error) {
				Logger.warn({configuredUserId, error}, 'Skipping invalid ADMIN_BOOTSTRAP_USER_IDS entry');
			}
		}

		for (const email of Config.adminBootstrap.emails) {
			const user = await userRepository.findByEmail(email);
			if (!user) {
				Logger.warn({email}, 'Configured ADMIN_BOOTSTRAP_EMAILS entry did not match any user');
				continue;
			}
			if (!user.emailVerified) {
				Logger.warn({email, userId: user.id.toString()}, 'Skipping unverified ADMIN_BOOTSTRAP_EMAILS user');
				continue;
			}

			targetUserIds.add(user.id.toString());
		}

		if (targetUserIds.size === 0) {
			Logger.warn('Admin bootstrap configured, but no target users were found');
			return;
		}

		for (const userIdString of targetUserIds) {
			const userId = createUserID(BigInt(userIdString));
			const user = await userRepository.findUnique(userId);
			if (!user) {
				Logger.warn({userId: userIdString}, 'Configured bootstrap admin user was not found');
				continue;
			}

			const mergedAcls = new Set<string>([...user.acls, ...bootstrapAcls]);
			const isChanged =
				mergedAcls.size !== user.acls.size || bootstrapAcls.some((acl) => !user.acls.has(acl));

			if (!isChanged) {
				Logger.info({userId: user.id.toString()}, 'Bootstrap admin ACLs already present');
				continue;
			}

			await userRepository.patchUpsert(user.id, {acls: mergedAcls}, user.toRow());
			Logger.info({userId: user.id.toString(), acls: Array.from(mergedAcls)}, 'Bootstrapped admin ACLs');
		}
	} catch (error) {
		Logger.error({error}, 'Failed to bootstrap admin ACLs');
	}
}
