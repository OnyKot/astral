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

import type {AuthService} from '~/auth/AuthService';
import type {AttachmentID, ChannelID, GuildID, ReportID, UserID} from '~/BrandedTypes';
import type {IChannelRepository} from '~/channel/IChannelRepository';
import type {IGuildRepository} from '~/guild/IGuildRepository';
import type {GuildService} from '~/guild/services/GuildService';
import type {IDiscriminatorService} from '~/infrastructure/DiscriminatorService';
import type {EntityAssetService} from '~/infrastructure/EntityAssetService';
import type {IAssetDeletionQueue} from '~/infrastructure/IAssetDeletionQueue';
import type {ICacheService} from '~/infrastructure/ICacheService';
import type {IEmailService} from '~/infrastructure/IEmailService';
import type {IGatewayService} from '~/infrastructure/IGatewayService';
import type {IMediaService} from '~/infrastructure/IMediaService';
import type {IStorageService} from '~/infrastructure/IStorageService';
import type {PendingJoinInviteStore} from '~/infrastructure/PendingJoinInviteStore';
import type {RedisBulkMessageDeletionQueueService} from '~/infrastructure/RedisBulkMessageDeletionQueueService';
import type {SnowflakeService} from '~/infrastructure/SnowflakeService';
import type {UserCacheService} from '~/infrastructure/UserCacheService';
import {SnowflakeReservationRepository} from '~/instance/SnowflakeReservationRepository';
import type {InviteRepository} from '~/invite/InviteRepository';
import type {InviteService} from '~/invite/InviteService';
import type {RequestCache} from '~/middleware/RequestCacheMiddleware';
import type {BotMfaMirrorService} from '~/oauth/BotMfaMirrorService';
import type {ReportService} from '~/report/ReportService';
import type {IUserRepository} from '~/user/IUserRepository';
import type {UserContactChangeLogService} from '~/user/services/UserContactChangeLogService';
import type {VoiceRepository} from '~/voice/VoiceRepository';
import type {IWorkerService} from '~/worker/IWorkerService';
import {getGuildSearchService, getMessageSearchService, getReportSearchService, getUserSearchService} from '~/Meilisearch';
import {ReportStatus} from '~/report/IReportRepository';
import type {
	BulkAddGuildMembersRequest,
	BulkSendEmailBroadcastRequest,
	BulkScheduleUserDeletionRequest,
	BulkUpdateGuildFeaturesRequest,
	BulkUpdateUserFlagsRequest,
	CancelBulkMessageDeletionRequest,
	ChangeDobRequest,
	ChangeEmailRequest,
	ChangeUsernameRequest,
	ClearGuildFieldsRequest,
	ClearUserFieldsRequest,
	CreateVoiceRegionRequest,
	CreateVoiceServerRequest,
	DeleteAllUserMessagesRequest,
	DeleteMessageRequest,
	DeleteVoiceRegionRequest,
	DeleteVoiceServerRequest,
	DisableForSuspiciousActivityRequest,
	DisableMfaRequest,
	ForceAddUserToGuildRequest,
	GetVoiceRegionRequest,
	GetVoiceServerRequest,
	ListAuditLogsRequest,
	ListGuildEmojisResponse,
	ListGuildMembersRequest,
	ListGuildStickersResponse,
	ListUserChangeLogRequest,
	ListUserGuildsRequest,
	ListVoiceRegionsRequest,
	ListVoiceServersRequest,
	LookupGuildRequest,
	LookupMessageByAttachmentRequest,
	LookupMessageRequest,
	LookupUserRequest,
	MessageShredRequest,
	PurgeGuildAssetsRequest,
	PurgeGuildAssetsResponse,
	SearchReportsRequest,
	SendPasswordResetRequest,
	SendPasskeyMigrationEmailRequest,
	SetUserAclsRequest,
	SetUserBotStatusRequest,
	SetUserSystemStatusRequest,
	TempBanUserRequest,
	TerminateSessionsRequest,
	TransferGuildOwnershipRequest,
	UnlinkPhoneRequest,
	UpdateGuildNameRequest,
	UpdateGuildSettingsRequest,
	UpdateGuildVanityRequest,
	UpdateSuspiciousActivityFlagsRequest,
	UpdateVoiceRegionRequest,
	UpdateVoiceServerRequest,
	VerifyUserEmailRequest,
	ResetPasskeysRequest,
} from './AdminModel';
import type {IAdminRepository} from './IAdminRepository';
import {AdminAssetPurgeService} from './services/AdminAssetPurgeService';
import {AdminAuditService} from './services/AdminAuditService';
import {AdminBulkEmailService} from './services/AdminBulkEmailService';
import {AdminCodeGenerationService} from './services/AdminCodeGenerationService';
import {AdminGuildService} from './services/AdminGuildService';
import {AdminMessageDeletionService} from './services/AdminMessageDeletionService';
import {AdminMessageService} from './services/AdminMessageService';
import {AdminMessageShredService} from './services/AdminMessageShredService';
import {AdminReportService} from './services/AdminReportService';
import {AdminSearchService} from './services/AdminSearchService';
import {AdminSnowflakeReservationService} from './services/AdminSnowflakeReservationService';
import {AdminUserService} from './services/AdminUserService';
import {AdminVoiceService} from './services/AdminVoiceService';

interface ForceAddUserToGuildParams {
	data: ForceAddUserToGuildRequest;
	requestCache: RequestCache;
}

interface LookupAttachmentParams {
	channelId: ChannelID;
	attachmentId: AttachmentID;
	filename: string;
}

interface PlatformOverviewStats {
	total_users: number;
	total_guilds: number;
	total_messages: number;
	total_reports: number;
	resolved_reports: number;
	messages_with_files: number;
	active_sessions: number;
	active_guilds: number;
}

export class AdminService {
	private readonly auditService: AdminAuditService;
	private readonly userService: AdminUserService;
	private readonly guildServiceAggregate: AdminGuildService;
	private readonly messageService: AdminMessageService;
	private readonly messageShredService: AdminMessageShredService;
	private readonly messageDeletionService: AdminMessageDeletionService;
	private readonly reportServiceAggregate: AdminReportService;
	private readonly voiceService: AdminVoiceService;
	private readonly searchService: AdminSearchService;
	private readonly codeGenerationService: AdminCodeGenerationService;
	private readonly bulkEmailService: AdminBulkEmailService;
	private readonly assetPurgeService: AdminAssetPurgeService;
	private readonly snowflakeReservationService: AdminSnowflakeReservationService;

	constructor(
		private readonly userRepository: IUserRepository,
		private readonly guildRepository: IGuildRepository,
		private readonly channelRepository: IChannelRepository,
		private readonly adminRepository: IAdminRepository,
		private readonly inviteRepository: InviteRepository,
		private readonly inviteService: InviteService,
		private readonly pendingJoinInviteStore: PendingJoinInviteStore,
		private readonly discriminatorService: IDiscriminatorService,
		private readonly snowflakeService: SnowflakeService,
		private readonly guildService: GuildService,
		private readonly authService: AuthService,
		private readonly gatewayService: IGatewayService,
		private readonly userCacheService: UserCacheService,
		private readonly entityAssetService: EntityAssetService,
		private readonly assetDeletionQueue: IAssetDeletionQueue,
		private readonly emailService: IEmailService,
		private readonly mediaService: IMediaService,
		private readonly storageService: IStorageService,
		private readonly reportService: ReportService,
		private readonly workerService: IWorkerService,
		private readonly cacheService: ICacheService,
		private readonly voiceRepository: VoiceRepository,
		private readonly botMfaMirrorService: BotMfaMirrorService,
		private readonly contactChangeLogService: UserContactChangeLogService,
		private readonly bulkMessageDeletionQueue: RedisBulkMessageDeletionQueueService,
	) {
		this.auditService = new AdminAuditService(this.adminRepository, this.snowflakeService);
		this.userService = new AdminUserService({
			userRepository: this.userRepository,
			guildRepository: this.guildRepository,
			discriminatorService: this.discriminatorService,
			authService: this.authService,
			emailService: this.emailService,
			entityAssetService: this.entityAssetService,
			auditService: this.auditService,
			gatewayService: this.gatewayService,
			userCacheService: this.userCacheService,
			adminRepository: this.adminRepository,
			botMfaMirrorService: this.botMfaMirrorService,
			inviteService: this.inviteService,
			pendingJoinInviteStore: this.pendingJoinInviteStore,
			contactChangeLogService: this.contactChangeLogService,
			bulkMessageDeletionQueue: this.bulkMessageDeletionQueue,
			cacheService: this.cacheService,
		});
		this.guildServiceAggregate = new AdminGuildService({
			guildRepository: this.guildRepository,
			userRepository: this.userRepository,
			channelRepository: this.channelRepository,
			inviteRepository: this.inviteRepository,
			guildService: this.guildService,
			gatewayService: this.gatewayService,
			entityAssetService: this.entityAssetService,
			auditService: this.auditService,
		});
		this.assetPurgeService = new AdminAssetPurgeService({
			guildRepository: this.guildRepository,
			gatewayService: this.gatewayService,
			assetDeletionQueue: this.assetDeletionQueue,
			auditService: this.auditService,
		});
		this.messageService = new AdminMessageService({
			channelRepository: this.channelRepository,
			userCacheService: this.userCacheService,
			mediaService: this.mediaService,
			gatewayService: this.gatewayService,
			auditService: this.auditService,
		});
		this.messageShredService = new AdminMessageShredService({
			workerService: this.workerService,
			cacheService: this.cacheService,
			snowflakeService: this.snowflakeService,
			auditService: this.auditService,
		});
		this.messageDeletionService = new AdminMessageDeletionService({
			channelRepository: this.channelRepository,
			messageShredService: this.messageShredService,
			auditService: this.auditService,
		});
		this.reportServiceAggregate = new AdminReportService({
			reportService: this.reportService,
			userRepository: this.userRepository,
			emailService: this.emailService,
			storageService: this.storageService,
			auditService: this.auditService,
			userCacheService: this.userCacheService,
		});
		this.voiceService = new AdminVoiceService({
			voiceRepository: this.voiceRepository,
			cacheService: this.cacheService,
			auditService: this.auditService,
		});
		this.searchService = new AdminSearchService({
			guildRepository: this.guildRepository,
			userRepository: this.userRepository,
			workerService: this.workerService,
			cacheService: this.cacheService,
			snowflakeService: this.snowflakeService,
			auditService: this.auditService,
		});

		this.snowflakeReservationService = new AdminSnowflakeReservationService({
			repository: new SnowflakeReservationRepository(),
			cacheService: this.cacheService,
			auditService: this.auditService,
		});
		this.codeGenerationService = new AdminCodeGenerationService(this.userRepository);
		this.bulkEmailService = new AdminBulkEmailService({
			userRepository: this.userRepository,
			emailService: this.emailService,
			auditService: this.auditService,
		});
	}

	async lookupUser(data: LookupUserRequest) {
		return this.userService.lookupUser(data);
	}

	async listSnowflakeReservations() {
		return this.snowflakeReservationService.listReservations();
	}

	async setSnowflakeReservation(
		data: {email: string; snowflake: string},
		adminUserId: UserID,
		auditLogReason: string | null,
	) {
		return this.snowflakeReservationService.setReservation(data, adminUserId, auditLogReason);
	}

	async deleteSnowflakeReservation(data: {email: string}, adminUserId: UserID, auditLogReason: string | null) {
		return this.snowflakeReservationService.deleteReservation(data, adminUserId, auditLogReason);
	}

	async updateUserFlags(args: {
		userId: UserID;
		data: {addFlags: Array<bigint>; removeFlags: Array<bigint>};
		adminUserId: UserID;
		auditLogReason: string | null;
	}) {
		return this.userService.updateUserFlags(args);
	}

	async disableMfa(data: DisableMfaRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.disableMfa(data, adminUserId, auditLogReason);
	}

	async clearUserFields(data: ClearUserFieldsRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.clearUserFields(data, adminUserId, auditLogReason);
	}

	async setUserBotStatus(data: SetUserBotStatusRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.setUserBotStatus(data, adminUserId, auditLogReason);
	}

	async setUserSystemStatus(data: SetUserSystemStatusRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.setUserSystemStatus(data, adminUserId, auditLogReason);
	}

	async verifyUserEmail(data: VerifyUserEmailRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.verifyUserEmail(data, adminUserId, auditLogReason);
	}

	async sendPasswordReset(data: SendPasswordResetRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.sendPasswordReset(data, adminUserId, auditLogReason);
	}

	async sendPasskeyMigrationEmail(
		data: SendPasskeyMigrationEmailRequest,
		adminUserId: UserID,
		auditLogReason: string | null,
	) {
		return this.userService.sendPasskeyMigrationEmail(data, adminUserId, auditLogReason);
	}

	async resetPasskeys(data: ResetPasskeysRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.resetPasskeys(data, adminUserId, auditLogReason);
	}

	async changeUsername(data: ChangeUsernameRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.changeUsername(data, adminUserId, auditLogReason);
	}

	async changeEmail(data: ChangeEmailRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.changeEmail(data, adminUserId, auditLogReason);
	}

	async terminateSessions(data: TerminateSessionsRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.terminateSessions(data, adminUserId, auditLogReason);
	}

	async tempBanUser(data: TempBanUserRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.tempBanUser(data, adminUserId, auditLogReason);
	}

	async unbanUser(data: {user_id: bigint}, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.unbanUser(data, adminUserId, auditLogReason);
	}

	async scheduleAccountDeletion(
		data:
			| BulkScheduleUserDeletionRequest
			| {user_id: bigint; reason_code: number; public_reason?: string | null; days_until_deletion: number},
		adminUserId: UserID,
		auditLogReason: string | null,
	) {
		if ('user_ids' in data) {
			return this.userService.bulkScheduleUserDeletion(data, adminUserId, auditLogReason);
		}
		return this.userService.scheduleAccountDeletion(
			{
				user_id: data.user_id,
				reason_code: data.reason_code,
				public_reason: data.public_reason ?? undefined,
				days_until_deletion: data.days_until_deletion,
			},
			adminUserId,
			auditLogReason,
		);
	}

	async cancelAccountDeletion(data: {user_id: bigint}, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.cancelAccountDeletion(data, adminUserId, auditLogReason);
	}

	async cancelBulkMessageDeletion(
		data: CancelBulkMessageDeletionRequest,
		adminUserId: UserID,
		auditLogReason: string | null,
	) {
		return this.userService.cancelBulkMessageDeletion(data, adminUserId, auditLogReason);
	}

	async banIp(data: {ip: string}, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.banIp(data, adminUserId, auditLogReason);
	}

	async unbanIp(data: {ip: string}, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.unbanIp(data, adminUserId, auditLogReason);
	}

	async checkIpBan(data: {ip: string}) {
		return this.userService.checkIpBan(data);
	}

	async banEmail(data: {email: string}, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.banEmail(data, adminUserId, auditLogReason);
	}

	async unbanEmail(data: {email: string}, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.unbanEmail(data, adminUserId, auditLogReason);
	}

	async checkEmailBan(data: {email: string}) {
		return this.userService.checkEmailBan(data);
	}

	async banPhone(data: {phone: string}, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.banPhone(data, adminUserId, auditLogReason);
	}

	async unbanPhone(data: {phone: string}, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.unbanPhone(data, adminUserId, auditLogReason);
	}

	async checkPhoneBan(data: {phone: string}) {
		return this.userService.checkPhoneBan(data);
	}

	async setUserAcls(data: SetUserAclsRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.setUserAcls(data, adminUserId, auditLogReason);
	}

	async unlinkPhone(data: UnlinkPhoneRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.unlinkPhone(data, adminUserId, auditLogReason);
	}

	async changeDob(data: ChangeDobRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.changeDob(data, adminUserId, auditLogReason);
	}

	async updateSuspiciousActivityFlags(
		data: UpdateSuspiciousActivityFlagsRequest,
		adminUserId: UserID,
		auditLogReason: string | null,
	) {
		return this.userService.updateSuspiciousActivityFlags(data, adminUserId, auditLogReason);
	}

	async disableForSuspiciousActivity(
		data: DisableForSuspiciousActivityRequest,
		adminUserId: UserID,
		auditLogReason: string | null,
	) {
		return this.userService.disableForSuspiciousActivity(data, adminUserId, auditLogReason);
	}

	async bulkUpdateUserFlags(data: BulkUpdateUserFlagsRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.bulkUpdateUserFlags(data, adminUserId, auditLogReason);
	}

	async bulkScheduleUserDeletion(
		data: BulkScheduleUserDeletionRequest,
		adminUserId: UserID,
		auditLogReason: string | null,
	) {
		return this.userService.bulkScheduleUserDeletion(data, adminUserId, auditLogReason);
	}

	async bulkSendEmailBroadcast(
		data: BulkSendEmailBroadcastRequest,
		adminUserId: UserID,
		auditLogReason: string | null,
	) {
		return this.bulkEmailService.sendEmailBroadcast(data, adminUserId, auditLogReason);
	}

	async listUserSessions(userId: bigint, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.listUserSessions(userId, adminUserId, auditLogReason);
	}

	async listUserChangeLog(data: ListUserChangeLogRequest) {
		return this.userService.listUserChangeLog(data);
	}

	async listPendingVerifications(limit: number = 100) {
		return this.userService.listPendingVerifications(limit);
	}

	async approveRegistration(userId: UserID, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.approveRegistration(userId, adminUserId, auditLogReason);
	}

	async rejectRegistration(userId: UserID, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.rejectRegistration(userId, adminUserId, auditLogReason);
	}

	async bulkApproveRegistrations(userIds: Array<UserID>, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.bulkApproveRegistrations(userIds, adminUserId, auditLogReason);
	}

	async bulkRejectRegistrations(userIds: Array<UserID>, adminUserId: UserID, auditLogReason: string | null) {
		return this.userService.bulkRejectRegistrations(userIds, adminUserId, auditLogReason);
	}

	async updateGuildFeatures(args: {
		guildId: GuildID;
		addFeatures: Array<string>;
		removeFeatures: Array<string>;
		adminUserId: UserID;
		auditLogReason: string | null;
	}) {
		return this.guildServiceAggregate.updateGuildFeatures(args);
	}

	async forceAddUserToGuild({
		data,
		requestCache,
		adminUserId,
		auditLogReason,
	}: ForceAddUserToGuildParams & {adminUserId: UserID; auditLogReason: string | null}) {
		return this.guildServiceAggregate.forceAddUserToGuild({data, requestCache, adminUserId, auditLogReason});
	}

	async lookupGuild(data: LookupGuildRequest) {
		return this.guildServiceAggregate.lookupGuild(data);
	}

	async listUserGuilds(data: ListUserGuildsRequest) {
		return this.guildServiceAggregate.listUserGuilds(data);
	}

	async listGuildMembers(data: ListGuildMembersRequest) {
		return this.guildServiceAggregate.listGuildMembers(data);
	}

	async listGuildEmojis(guildId: GuildID): Promise<ListGuildEmojisResponse> {
		return this.guildServiceAggregate.listGuildEmojis(guildId);
	}

	async listGuildStickers(guildId: GuildID): Promise<ListGuildStickersResponse> {
		return this.guildServiceAggregate.listGuildStickers(guildId);
	}

	async purgeGuildAssets(
		data: PurgeGuildAssetsRequest,
		adminUserId: UserID,
		auditLogReason: string | null,
	): Promise<PurgeGuildAssetsResponse> {
		return this.assetPurgeService.purgeGuildAssets({
			ids: data.ids,
			adminUserId,
			auditLogReason,
		});
	}

	async clearGuildFields(data: ClearGuildFieldsRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.guildServiceAggregate.clearGuildFields(data, adminUserId, auditLogReason);
	}

	async updateGuildName(data: UpdateGuildNameRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.guildServiceAggregate.updateGuildName(data, adminUserId, auditLogReason);
	}

	async updateGuildSettings(data: UpdateGuildSettingsRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.guildServiceAggregate.updateGuildSettings(data, adminUserId, auditLogReason);
	}

	async updateGuildVanity(data: UpdateGuildVanityRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.guildServiceAggregate.updateGuildVanity(data, adminUserId, auditLogReason);
	}

	async transferGuildOwnership(
		data: TransferGuildOwnershipRequest,
		adminUserId: UserID,
		auditLogReason: string | null,
	) {
		return this.guildServiceAggregate.transferGuildOwnership(data, adminUserId, auditLogReason);
	}

	async bulkUpdateGuildFeatures(
		data: BulkUpdateGuildFeaturesRequest,
		adminUserId: UserID,
		auditLogReason: string | null,
	) {
		return this.guildServiceAggregate.bulkUpdateGuildFeatures(data, adminUserId, auditLogReason);
	}

	async bulkAddGuildMembers(data: BulkAddGuildMembersRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.guildServiceAggregate.bulkAddGuildMembers(data, adminUserId, auditLogReason);
	}

	async reloadGuild(guildId: bigint, adminUserId: UserID, auditLogReason: string | null) {
		return this.guildServiceAggregate.reloadGuild(guildId, adminUserId, auditLogReason);
	}

	async shutdownGuild(guildId: bigint, adminUserId: UserID, auditLogReason: string | null) {
		return this.guildServiceAggregate.shutdownGuild(guildId, adminUserId, auditLogReason);
	}

	async deleteGuild(guildId: bigint, adminUserId: UserID, auditLogReason: string | null) {
		return this.guildServiceAggregate.deleteGuild(guildId, adminUserId, auditLogReason);
	}

	async getGuildMemoryStats(limit: number) {
		return this.guildServiceAggregate.getGuildMemoryStats(limit);
	}

	async reloadAllGuilds(guildIds: Array<GuildID>) {
		return this.guildServiceAggregate.reloadAllGuilds(guildIds);
	}

	async getNodeStats() {
		return this.guildServiceAggregate.getNodeStats();
	}

	async lookupAttachment(params: LookupAttachmentParams) {
		return this.messageService.lookupAttachment(params);
	}

	async lookupMessage(data: LookupMessageRequest) {
		return this.messageService.lookupMessage(data);
	}

	async lookupMessageByAttachment(data: LookupMessageByAttachmentRequest) {
		return this.messageService.lookupMessageByAttachment(data);
	}

	async deleteMessage(data: DeleteMessageRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.messageService.deleteMessage(data, adminUserId, auditLogReason);
	}

	async deleteAllUserMessages(data: DeleteAllUserMessagesRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.messageDeletionService.deleteAllUserMessages(data, adminUserId, auditLogReason);
	}

	async queueMessageShred(data: MessageShredRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.messageShredService.queueMessageShred(data, adminUserId, auditLogReason);
	}

	async getMessageShredStatus(jobId: string) {
		return this.messageShredService.getMessageShredStatus(jobId);
	}

	async listAuditLogs(data: ListAuditLogsRequest) {
		return this.auditService.listAuditLogs(data);
	}

	async searchAuditLogs(data: {
		query?: string;
		adminUserId?: bigint;
		targetType?: string;
		targetId?: bigint;
		action?: string;
		sortBy?: 'createdAt' | 'relevance';
		sortOrder?: 'asc' | 'desc';
		limit?: number;
		offset?: number;
	}) {
		return this.auditService.searchAuditLogs(data);
	}

	async listReports(status: number, limit?: number, offset?: number) {
		return this.reportServiceAggregate.listReports(status, limit, offset);
	}

	async getReport(reportId: ReportID) {
		return this.reportServiceAggregate.getReport(reportId);
	}

	async resolveReport(
		reportId: ReportID,
		adminUserId: UserID,
		publicComment: string | null,
		auditLogReason: string | null,
	) {
		return this.reportServiceAggregate.resolveReport(reportId, adminUserId, publicComment, auditLogReason);
	}

	async searchReports(data: SearchReportsRequest) {
		return this.reportServiceAggregate.searchReports(data);
	}

	async searchGuilds(data: {query?: string; limit: number; offset: number}) {
		return this.searchService.searchGuilds(data);
	}

	async searchUsers(data: {
		query?: string;
		email_verified?: boolean;
		has_premium?: boolean;
		is_bot?: boolean;
		limit: number;
		offset: number;
	}) {
		return this.searchService.searchUsers(data);
	}

	async refreshSearchIndex(
		data: {
			index_type: 'guilds' | 'users' | 'reports' | 'audit_logs' | 'channel_messages' | 'favorite_memes';
			guild_id?: bigint;
			user_id?: bigint;
		},
		adminUserId: UserID,
		auditLogReason: string | null,
	) {
		return this.searchService.refreshSearchIndex(data, adminUserId, auditLogReason);
	}

	async getIndexRefreshStatus(jobId: string) {
		return this.searchService.getIndexRefreshStatus(jobId);
	}

	private async getSafeTotal(
		load: () => Promise<{
			total: number;
		}>,
	): Promise<number> {
		try {
			const {total} = await load();
			return total;
		} catch {
			return 0;
		}
	}

	async getPlatformOverviewStats(): Promise<PlatformOverviewStats> {
		const userSearchService = getUserSearchService();
		const guildSearchService = getGuildSearchService();
		const messageSearchService = getMessageSearchService();
		const reportSearchService = getReportSearchService();

		const [
			nodeStats,
			totalUsers,
			totalGuilds,
			totalMessages,
			totalReports,
			resolvedReports,
			messagesWithFiles,
		] = await Promise.all([
			this.getNodeStats().catch(() => null),
			userSearchService
				? this.getSafeTotal(() => userSearchService.searchUsers('', {}, {limit: 1, offset: 0}))
				: Promise.resolve(0),
			guildSearchService
				? this.getSafeTotal(() => guildSearchService.searchGuilds('', {}, {limit: 1, offset: 0}))
				: Promise.resolve(0),
			messageSearchService
				? this.getSafeTotal(() => messageSearchService.searchMessages('', {}, {hitsPerPage: 1, page: 1}))
				: Promise.resolve(0),
			reportSearchService
				? this.getSafeTotal(() => reportSearchService.searchReports('', {}, {limit: 1, offset: 0}))
				: Promise.resolve(0),
			reportSearchService
				? this.getSafeTotal(() =>
						reportSearchService.searchReports(
							'',
							{status: ReportStatus.RESOLVED},
							{limit: 1, offset: 0},
						),
					)
				: Promise.resolve(0),
			messageSearchService
				? this.getSafeTotal(() =>
						messageSearchService.searchMessages('', {has: ['file']}, {hitsPerPage: 1, page: 1}),
					)
				: Promise.resolve(0),
		]);

		return {
			total_users: totalUsers,
			total_guilds: totalGuilds,
			total_messages: totalMessages,
			total_reports: totalReports,
			resolved_reports: resolvedReports,
			messages_with_files: messagesWithFiles,
			active_sessions: nodeStats?.sessions ?? 0,
			active_guilds: nodeStats?.guilds ?? 0,
		};
	}

	async listVoiceRegions(data: ListVoiceRegionsRequest, _adminUserId: UserID, _auditLogReason: string | null) {
		return this.voiceService.listVoiceRegions(data);
	}

	async getVoiceRegion(data: GetVoiceRegionRequest, _adminUserId: UserID, _auditLogReason: string | null) {
		return this.voiceService.getVoiceRegion(data);
	}

	async createVoiceRegion(data: CreateVoiceRegionRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.voiceService.createVoiceRegion(data, adminUserId, auditLogReason);
	}

	async updateVoiceRegion(data: UpdateVoiceRegionRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.voiceService.updateVoiceRegion(data, adminUserId, auditLogReason);
	}

	async deleteVoiceRegion(data: DeleteVoiceRegionRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.voiceService.deleteVoiceRegion(data, adminUserId, auditLogReason);
	}

	async listVoiceServers(data: ListVoiceServersRequest, _adminUserId: UserID, _auditLogReason: string | null) {
		return this.voiceService.listVoiceServers(data);
	}

	async getVoiceServer(data: GetVoiceServerRequest, _adminUserId: UserID, _auditLogReason: string | null) {
		return this.voiceService.getVoiceServer(data);
	}

	async createVoiceServer(data: CreateVoiceServerRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.voiceService.createVoiceServer(data, adminUserId, auditLogReason);
	}

	async updateVoiceServer(data: UpdateVoiceServerRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.voiceService.updateVoiceServer(data, adminUserId, auditLogReason);
	}

	async deleteVoiceServer(data: DeleteVoiceServerRequest, adminUserId: UserID, auditLogReason: string | null) {
		return this.voiceService.deleteVoiceServer(data, adminUserId, auditLogReason);
	}

	async generateBetaCodes(count: number) {
		return this.codeGenerationService.generateBetaCodes(count);
	}

	async generateGiftCodes(count: number, durationMonths: number) {
		return this.codeGenerationService.generateGiftCodes(count, durationMonths);
	}
}
