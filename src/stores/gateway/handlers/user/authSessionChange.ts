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

import AuthSessionStore from '~/stores/AuthSessionStore';
import AuthenticationStore from '~/stores/AuthenticationStore';
import type {GatewayHandlerContext} from '../index';

interface AuthSessionChangePayload {
	old_auth_session_id_hash?: string | null;
	new_token?: string;
	new_auth_session_id_hash?: string | null;
}

export function handleAuthSessionChange(data: AuthSessionChangePayload, context: GatewayHandlerContext): void {
	const currentHash = AuthSessionStore.authSessionIdHash;
	if (data.old_auth_session_id_hash && currentHash && data.old_auth_session_id_hash !== currentHash) {
		return;
	}

	if (data.new_token) {
		context.socket?.setToken(data.new_token);
		AuthenticationStore.handleAuthSessionChange({token: data.new_token});
	}

	if (data.new_auth_session_id_hash) {
		AuthSessionStore.handleAuthSessionChange(data.new_auth_session_id_hash);
	}
}
