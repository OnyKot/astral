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

import type {GuildID, UserID} from '~/BrandedTypes';
import {GuildFeatures, Permissions} from '~/Constants';
import type {
	GuildDiscoveryApplicationRow,
	GuildDiscoveryApplicationStatus,
} from '~/database/types/GuildTypes';
import {InputValidationError, MissingPermissionsError, UnknownGuildError} from '~/Errors';
import {mapGuildToGuildResponse} from '~/guild/GuildModel';
import type {IGatewayService} from '~/infrastructure/IGatewayService';
import {Guild} from '~/Models';
import type {IGuildRepository} from '../IGuildRepository';
import type {GuildDiscoveryApplicationRepository} from '../repositories/GuildDiscoveryApplicationRepository';
import {GUILD_DISCOVERY_CATEGORY_IDS, type GuildDiscoveryCategoryId} from './data/GuildOperationsService';

export interface DiscoveryApplicationResponse {
	guild_id: string;
	status: GuildDiscoveryApplicationStatus;
	submitted_by: string;
	submitted_at: string;
	reviewed_by: string | null;
	reviewed_at: string | null;
	review_note: string | null;
	category: GuildDiscoveryCategoryId | null;
	description: string | null;
	tags: Array<string>;
}

const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 32;

function isValidCategory(value: string): value is GuildDiscoveryCategoryId {
	return (GUILD_DISCOVERY_CATEGORY_IDS as ReadonlyArray<string>).includes(value);
}

function rowToResponse(row: GuildDiscoveryApplicationRow): DiscoveryApplicationResponse {
	return {
		guild_id: row.guild_id.toString(),
		status: row.status,
		submitted_by: row.submitted_by.toString(),
		submitted_at: row.submitted_at.toISOString(),
		reviewed_by: row.reviewed_by ? row.reviewed_by.toString() : null,
		reviewed_at: row.reviewed_at ? row.reviewed_at.toISOString() : null,
		review_note: row.review_note ?? null,
		category: row.category && isValidCategory(row.category) ? row.category : null,
		description: row.description ?? null,
		tags: row.tags ? Array.from(row.tags) : [],
	};
}

export class GuildDiscoveryService {
	constructor(
		private readonly guildRepository: IGuildRepository,
		private readonly applicationRepository: GuildDiscoveryApplicationRepository,
		private readonly gatewayService: IGatewayService,
	) {}

	async getApplication(params: {userId: UserID; guildId: GuildID}): Promise<DiscoveryApplicationResponse | null> {
		const {userId, guildId} = params;
		await this.requireOwnerOrManageGuild(userId, guildId);

		const row = await this.applicationRepository.findByGuildId(guildId);
		return row ? rowToResponse(row) : null;
	}

	async submitApplication(params: {
		userId: UserID;
		guildId: GuildID;
		category: string;
		description: string;
		tags: Array<string>;
	}): Promise<DiscoveryApplicationResponse> {
		const {userId, guildId} = params;
		await this.requireOwnerOrManageGuild(userId, guildId);

		const category = params.category.trim();
		if (!isValidCategory(category) || category === 'all') {
			throw InputValidationError.create('category', 'Invalid discovery category');
		}

		const description = params.description.trim();
		if (description.length === 0 || description.length > MAX_DESCRIPTION_LENGTH) {
			throw InputValidationError.create(
				'description',
				`Description must be 1-${MAX_DESCRIPTION_LENGTH} characters`,
			);
		}

		const tags = this.normalizeTags(params.tags);

		const guild = await this.guildRepository.findUnique(guildId);
		if (!guild) {
			throw new UnknownGuildError();
		}

		// If the guild was previously approved and is reapplying, drop the
		// approval flag — admins must re-review the new submission.
		if (guild.features.has(GuildFeatures.DISCOVERY_APPROVED)) {
			await this.applyFeatureChange(guild, (set) => {
				set.delete(GuildFeatures.DISCOVERY_APPROVED);
			});
		}

		const row: GuildDiscoveryApplicationRow = {
			guild_id: guildId,
			status: 'pending',
			submitted_by: userId,
			submitted_at: new Date(),
			reviewed_by: null,
			reviewed_at: null,
			review_note: null,
			category,
			description,
			tags: new Set(tags),
		};

		await this.applicationRepository.upsert(row);
		return rowToResponse(row);
	}

	async withdrawApplication(params: {userId: UserID; guildId: GuildID}): Promise<void> {
		const {userId, guildId} = params;
		await this.requireOwnerOrManageGuild(userId, guildId);

		const existing = await this.applicationRepository.findByGuildId(guildId);
		if (!existing) {
			return;
		}

		await this.applicationRepository.setStatus({
			guildId,
			status: 'withdrawn',
			reviewerId: null,
			reviewedAt: null,
			reviewNote: null,
		});

		const guild = await this.guildRepository.findUnique(guildId);
		if (guild?.features.has(GuildFeatures.DISCOVERY_APPROVED)) {
			await this.applyFeatureChange(guild, (set) => {
				set.delete(GuildFeatures.DISCOVERY_APPROVED);
			});
		}
	}

	// --- Admin operations -------------------------------------------------

	async listApplications(status?: GuildDiscoveryApplicationStatus): Promise<Array<DiscoveryApplicationResponse>> {
		const rows = status
			? await this.applicationRepository.listByStatus(status)
			: await this.applicationRepository.listAll();
		// Newest first (Cassandra returns whatever order; SAI does not guarantee).
		rows.sort((a, b) => b.submitted_at.getTime() - a.submitted_at.getTime());
		return rows.map(rowToResponse);
	}

	async getApplicationAsAdmin(guildId: GuildID): Promise<DiscoveryApplicationResponse | null> {
		const row = await this.applicationRepository.findByGuildId(guildId);
		return row ? rowToResponse(row) : null;
	}

	async approveApplication(params: {
		adminId: UserID;
		guildId: GuildID;
		reviewNote: string | null;
	}): Promise<DiscoveryApplicationResponse | null> {
		const {adminId, guildId, reviewNote} = params;

		const existing = await this.applicationRepository.findByGuildId(guildId);
		if (!existing) {
			return null;
		}

		const guild = await this.guildRepository.findUnique(guildId);
		if (!guild) {
			throw new UnknownGuildError();
		}

		const reviewedAt = new Date();
		await this.applicationRepository.setStatus({
			guildId,
			status: 'approved',
			reviewerId: adminId,
			reviewedAt,
			reviewNote,
		});

		if (!guild.features.has(GuildFeatures.DISCOVERY_APPROVED)) {
			await this.applyFeatureChange(guild, (set) => {
				set.add(GuildFeatures.DISCOVERY_APPROVED);
				set.delete(GuildFeatures.DISCOVERY_DISABLED);
			});
		}

		return {
			...rowToResponse(existing),
			status: 'approved',
			reviewed_by: adminId.toString(),
			reviewed_at: reviewedAt.toISOString(),
			review_note: reviewNote,
		};
	}

	async rejectApplication(params: {
		adminId: UserID;
		guildId: GuildID;
		reviewNote: string | null;
	}): Promise<DiscoveryApplicationResponse | null> {
		const {adminId, guildId, reviewNote} = params;

		const existing = await this.applicationRepository.findByGuildId(guildId);
		if (!existing) {
			return null;
		}

		const reviewedAt = new Date();
		await this.applicationRepository.setStatus({
			guildId,
			status: 'rejected',
			reviewerId: adminId,
			reviewedAt,
			reviewNote,
		});

		const guild = await this.guildRepository.findUnique(guildId);
		if (guild?.features.has(GuildFeatures.DISCOVERY_APPROVED)) {
			await this.applyFeatureChange(guild, (set) => {
				set.delete(GuildFeatures.DISCOVERY_APPROVED);
			});
		}

		return {
			...rowToResponse(existing),
			status: 'rejected',
			reviewed_by: adminId.toString(),
			reviewed_at: reviewedAt.toISOString(),
			review_note: reviewNote,
		};
	}

	// --- internals --------------------------------------------------------

	private async requireOwnerOrManageGuild(userId: UserID, guildId: GuildID): Promise<void> {
		const guild = await this.guildRepository.findUnique(guildId);
		if (!guild) {
			throw new UnknownGuildError();
		}
		if (guild.ownerId === userId) {
			return;
		}
		const hasPermission = await this.gatewayService.checkPermission({
			guildId,
			userId,
			permission: Permissions.MANAGE_GUILD,
		});
		if (!hasPermission) {
			throw new MissingPermissionsError();
		}
	}

	/*
	 * Writes a feature flag mutation directly to the guild row, bypassing
	 * GuildDataService.updateGuild — that path filters out features that are
	 * not on the owner-toggleable allowlist, and DISCOVERY_APPROVED is
	 * intentionally admin-only. We persist via guildRepository.upsert and
	 * fan out a GUILD_UPDATE event so connected clients see the new flag.
	 */
	private async applyFeatureChange(guild: Guild, mutate: (features: Set<string>) => void): Promise<void> {
		const featuresSet = new Set(guild.features);
		mutate(featuresSet);

		const row = guild.toRow();
		const updatedRow = {
			...row,
			features: featuresSet.size > 0 ? featuresSet : null,
		};

		const updatedGuild = await this.guildRepository.upsert(updatedRow);
		await this.gatewayService.dispatchGuild({
			guildId: guild.id,
			event: 'GUILD_UPDATE',
			data: mapGuildToGuildResponse(updatedGuild),
		});
	}

	private normalizeTags(tags: Array<string>): Array<string> {
		const seen = new Set<string>();
		const out: Array<string> = [];
		for (const raw of tags) {
			const tag = raw.trim().toLowerCase();
			if (tag.length === 0 || tag.length > MAX_TAG_LENGTH) continue;
			if (seen.has(tag)) continue;
			seen.add(tag);
			out.push(tag);
			if (out.length >= MAX_TAGS) break;
		}
		return out;
	}
}
