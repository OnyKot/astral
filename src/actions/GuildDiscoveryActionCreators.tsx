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

import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import {APIErrorCodes} from '~/Constants';
import {FeatureTemporarilyDisabledModal} from '~/components/alerts/FeatureTemporarilyDisabledModal';
import {GenericErrorModal} from '~/components/alerts/GenericErrorModal';
import {GuildAtCapacityModal} from '~/components/alerts/GuildAtCapacityModal';
import {MaxGuildsModal} from '~/components/alerts/MaxGuildsModal';
import {UserBannedFromGuildModal} from '~/components/alerts/UserBannedFromGuildModal';
import {UserIpBannedFromGuildModal} from '~/components/alerts/UserIpBannedFromGuildModal';
import {Endpoints} from '~/Endpoints';
import http, {HttpError} from '~/lib/HttpClient';
import {Logger} from '~/lib/Logger';
import type {Guild} from '~/records/GuildRecord';

const logger = new Logger('GuildDiscovery');

const extractErrorCode = (error: unknown): string | undefined => {
	if (error instanceof HttpError) {
		const body = error.body;
		if (body && typeof body === 'object' && 'code' in body) {
			const {code} = body as {code?: unknown};
			return typeof code === 'string' ? code : undefined;
		}
	}
	return undefined;
};

const showUnavailableModal = (i18n: I18n): void => {
	ModalActionCreators.push(
		modal(() => (
			<GenericErrorModal
				title={i18n._(msg`Community unavailable`)}
				message={i18n._(msg`This community is not available in Discovery right now.`)}
			/>
		)),
	);
};

const handleDiscoveryJoinError = (error: unknown, i18n: I18n): void => {
	const httpError = error instanceof HttpError ? error : null;
	const errorCode = extractErrorCode(error);
	logger.error({error, errorCode}, 'Failed to join discovery guild');

	if (errorCode === APIErrorCodes.FEATURE_TEMPORARILY_DISABLED) {
		ModalActionCreators.push(modal(() => <FeatureTemporarilyDisabledModal />));
	} else if (errorCode === APIErrorCodes.MAX_GUILD_MEMBERS) {
		ModalActionCreators.push(modal(() => <GuildAtCapacityModal />));
	} else if (errorCode === APIErrorCodes.MAX_GUILDS) {
		ModalActionCreators.push(modal(() => <MaxGuildsModal />));
	} else if (errorCode === APIErrorCodes.USER_BANNED_FROM_GUILD) {
		ModalActionCreators.push(modal(() => <UserBannedFromGuildModal />));
	} else if (errorCode === APIErrorCodes.USER_IP_BANNED_FROM_GUILD) {
		ModalActionCreators.push(modal(() => <UserIpBannedFromGuildModal />));
	} else if (errorCode === APIErrorCodes.GUILD_DISALLOWS_UNCLAIMED_ACCOUNTS) {
		ModalActionCreators.push(
			modal(() => (
				<GenericErrorModal
					title={i18n._(msg`Cannot Join Community`)}
					message={i18n._(
						msg`This community requires you to verify your account before joining. Please set an email and password for your account.`,
					)}
				/>
			)),
		);
	} else if (errorCode === APIErrorCodes.UNCLAIMED_ACCOUNT_RESTRICTED) {
		ModalActionCreators.push(
			modal(() => (
				<GenericErrorModal
					title={i18n._(msg`Account Verification Required`)}
					message={i18n._(
						msg`Please verify your account by setting an email and password before joining communities.`,
					)}
				/>
			)),
		);
	} else if (
		httpError?.status === 404 ||
		errorCode === APIErrorCodes.UNKNOWN_GUILD ||
		errorCode === APIErrorCodes.MISSING_ACCESS ||
		errorCode === APIErrorCodes.INVITES_DISABLED
	) {
		showUnavailableModal(i18n);
	} else {
		ModalActionCreators.push(
			modal(() => (
				<GenericErrorModal
					title={i18n._(msg`Cannot Join Community`)}
					message={i18n._(msg`Something went wrong while joining this community. Please try again.`)}
				/>
			)),
		);
	}
};

export interface GuildDiscoveryItem {
	id: string;
	name: string;
	icon: string | null;
	banner: string | null;
	splash: string | null;
	vanity_url_code: string | null;
	tags?: Array<string>;
	features: Array<string>;
	member_count: number;
	presence_count: number;
	trending_score: number;
	is_member: boolean;
}

export interface GuildDiscoveryCategory {
	id: string;
	label: string;
	description: string;
	count: number;
}

export interface GuildDiscoveryResponse {
	guilds: Array<GuildDiscoveryItem>;
	total: number;
	taxonomy: Array<GuildDiscoveryCategory>;
}

export interface DiscoveryJoinRequestResponse {
	guild_id: string;
	user_id: string;
	status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
	requested_at: string;
	message: string | null;
	reviewed_by: string | null;
	reviewed_at: string | null;
	review_note: string | null;
}

export type DiscoveryJoinResult =
	| {kind: 'joined'; guild: Guild}
	| {kind: 'requested'; request: DiscoveryJoinRequestResponse};

export interface GuildDiscoveryQuery {
	q?: string;
	limit?: number;
	offset?: number;
	sort_by?: 'relevance' | 'member_count' | 'created_at' | 'trending';
	sort_order?: 'asc' | 'desc';
	category?: string;
}

export const fetchGuildDiscovery = async (query: GuildDiscoveryQuery = {}): Promise<GuildDiscoveryResponse> => {
	const params = new URLSearchParams();
	if (query.q && query.q.trim().length > 0) {
		params.set('q', query.q.trim());
	}
	if (typeof query.limit === 'number') {
		params.set('limit', query.limit.toString());
	}
	if (typeof query.offset === 'number') {
		params.set('offset', query.offset.toString());
	}
	if (query.sort_by) {
		params.set('sort_by', query.sort_by);
	}
	if (query.sort_order) {
		params.set('sort_order', query.sort_order);
	}
	if (query.category) {
		params.set('category', query.category);
	}

	const queryString = params.toString();
	const url = queryString.length > 0 ? `${Endpoints.GUILD_DISCOVERY}?${queryString}` : Endpoints.GUILD_DISCOVERY;

	try {
		const response = await http.get<GuildDiscoveryResponse>(url);
		return response.body;
	} catch (error) {
		logger.error({query, error}, 'Failed to fetch discovery guilds');
		throw error;
	}
};

export const requestDiscoveryJoin = async (
	guildId: string,
	message: string | null = null,
): Promise<DiscoveryJoinRequestResponse> => {
	const body = message && message.trim().length > 0 ? {message} : {};
	const response = await http.post<DiscoveryJoinRequestResponse>(Endpoints.DISCOVERY_GUILD_JOIN_REQUEST(guildId), body);
	return response.body;
};

export const joinDiscoveryGuild = async (guildId: string, i18n: I18n): Promise<DiscoveryJoinResult> => {
	try {
		logger.debug(`Joining discovery guild ${guildId}`);
		const response = await http.post<Guild>(Endpoints.DISCOVERY_GUILD_JOIN(guildId), {});
		return {kind: 'joined', guild: response.body};
	} catch (error) {
		if (extractErrorCode(error) === APIErrorCodes.INVITES_DISABLED) {
			try {
				const request = await requestDiscoveryJoin(guildId);
				ToastActionCreators.createToast({
					type: 'success',
					children: i18n._(msg`Join request sent`),
				});
				return {kind: 'requested', request};
			} catch (requestError) {
				handleDiscoveryJoinError(requestError, i18n);
				throw requestError;
			}
		}

		handleDiscoveryJoinError(error, i18n);
		throw error;
	}
};
