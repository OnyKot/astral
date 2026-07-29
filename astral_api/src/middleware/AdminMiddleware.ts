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

import type {Context} from 'hono';
import {createMiddleware} from 'hono/factory';
import type {HonoEnv} from '~/App';
import {Config} from '~/Config';
import {AdminACLs} from '~/Constants';
import {MissingACLError, MissingPermissionsError, UnauthorizedError} from '~/Errors';
import {Logger} from '~/Logger';

/*
 * Which credentials may reach an admin route.
 *
 * An OAuth2 bearer token carries only the scopes the user consented to
 * (identify, email, guilds, ...) — none of which implies admin power — yet
 * nothing on the admin routes ever inspected them, so an `identify`-only
 * third-party app inherited every AdminACL of the authorizing user.
 *
 * Rejecting bearer outright is not an option: the first-party admin panel
 * (astral_admin) authenticates with exactly such a token, and it requests the
 * ordinary `identify email` scopes, so the scope set cannot tell it apart from
 * a third-party app. The application the token was issued to can. Hence:
 * session tokens, or a bearer belonging to the configured admin application.
 *
 * When `ASTRAL_ADMIN_APPLICATION_ID` is unset every bearer is refused, which
 * locks the admin panel out until it is configured. That is the deliberate
 * failure direction — the alternative silently restores the original hole.
 *
 * The cookie check is separate from the token type: the music session cookie is
 * resolved into a `session` token by UserMiddleware, and a cookie rides along
 * automatically — SameSite=Lax still sends it on a cross-site top-level GET.
 * Admin calls must carry their credential in the Authorization header, which no
 * other site can make a browser attach.
 */
const assertAdminCredential = (ctx: Context<HonoEnv>): void => {
	if (ctx.get('authViaCookie')) throw new UnauthorizedError();

	const tokenType = ctx.get('authTokenType');
	if (tokenType === 'session') return;

	if (tokenType === 'bearer') {
		const adminApplicationId = Config.auth.adminOAuthApplicationId;
		const tokenApplicationId = ctx.get('oauthBearerApplicationId');
		if (adminApplicationId && tokenApplicationId && tokenApplicationId.toString() === adminApplicationId) {
			return;
		}
	}

	throw new UnauthorizedError();
};

export const requireAdminACL = (requiredACL: string) =>
	createMiddleware<HonoEnv>(async (ctx, next) => {
		const adminUser = ctx.get('user');
		if (!adminUser) throw new UnauthorizedError();

		assertAdminCredential(ctx);

		Logger.debug(
			{
				adminUserId: adminUser.id.toString(),
				acls: Array.from(adminUser.acls),
				requiredACL,
			},
			'Checking admin ACL requirements',
		);
		if (!adminUser.acls.has(AdminACLs.AUTHENTICATE) && !adminUser.acls.has(AdminACLs.WILDCARD)) {
			throw new MissingPermissionsError();
		}

		if (!adminUser.acls.has(requiredACL) && !adminUser.acls.has(AdminACLs.WILDCARD)) {
			throw new MissingACLError(requiredACL);
		}

		ctx.set('adminUserId', adminUser.id);
		ctx.set('adminUserAcls', adminUser.acls);
		await next();
	});

export const requireAnyAdminACL = (requiredACLs: Array<string>) =>
	createMiddleware<HonoEnv>(async (ctx, next) => {
		const adminUser = ctx.get('user');
		if (!adminUser) throw new UnauthorizedError();

		assertAdminCredential(ctx);

		Logger.debug(
			{
				adminUserId: adminUser.id.toString(),
				acls: Array.from(adminUser.acls),
				requiredACLs,
			},
			'Checking admin ACL requirements (any)',
		);
		if (!adminUser.acls.has(AdminACLs.AUTHENTICATE) && !adminUser.acls.has(AdminACLs.WILDCARD)) {
			throw new MissingPermissionsError();
		}

		const hasAny = adminUser.acls.has(AdminACLs.WILDCARD) || requiredACLs.some((acl) => adminUser.acls.has(acl));

		if (!hasAny) {
			throw new MissingACLError(requiredACLs[0] ?? AdminACLs.AUTHENTICATE);
		}

		ctx.set('adminUserId', adminUser.id);
		ctx.set('adminUserAcls', adminUser.acls);
		await next();
	});
