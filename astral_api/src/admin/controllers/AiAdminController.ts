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
import type {HonoApp, HonoEnv} from '~/App';
import {Config} from '~/Config';
import {AdminACLs} from '~/Constants';
import {GrokService} from '~/infrastructure/GrokService';
import {requireAdminACL} from '~/middleware/AdminMiddleware';
import {RateLimitMiddleware} from '~/middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '~/RateLimitConfig';

export const AiAdminController = (app: HonoApp) => {
	const readObjectBody = async (ctx: Context<HonoEnv>): Promise<Record<string, unknown>> => {
		const body = await ctx.req.json().catch(() => null);
		return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
	};

	app.get(
		'/admin/ai/stats',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_LOOKUP),
		requireAdminACL(AdminACLs.METRICS_VIEW),
		async (ctx) => {
			const grokService = ctx.get('grokService');
			const stats =
				grokService instanceof GrokService
					? grokService.getStats()
					: {enabled: false, model: 'unknown'};

			return ctx.json({
				config: {
					enabled: Config.grok.enabled,
					moderation_enabled: Config.grok.moderationEnabled,
					search_enhancement_enabled: Config.grok.searchEnhancementEnabled,
					model: Config.grok.model,
					base_url: Config.grok.apiUrl,
				},
				runtime: stats,
			});
		},
	);

	app.post(
		'/admin/ai/test',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_LOOKUP),
		requireAdminACL(AdminACLs.METRICS_VIEW),
		async (ctx) => {
			const body = await readObjectBody(ctx);
			const text = typeof body.text === 'string' ? body.text.slice(0, 500) : '';
			if (!text) return ctx.json({error: 'text required'}, 400);

			const grokService = ctx.get('grokService');
			if (!grokService.isEnabled()) {
				return ctx.json({error: 'Grok is disabled'}, 503);
			}

			try {
				const result = await grokService.moderateContent(text);
				return ctx.json({moderation: result});
			} catch (err) {
				return ctx.json({error: (err as Error).message}, 500);
			}
		},
	);

	// AI analysis of a user profile — fetches all available data server-side
	// and asks Grok to summarize the user's behavior, risk signals, account
	// health. Uses real data: profile, relationships, reports, guilds.
	app.post(
		'/admin/ai/analyze-user',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_LOOKUP),
		requireAdminACL(AdminACLs.USER_LOOKUP),
		async (ctx) => {
			const body = await readObjectBody(ctx);
			const userId = typeof body.user_id === 'string' ? body.user_id : null;
			if (!userId) return ctx.json({error: 'user_id required'}, 400);

			const grokService = ctx.get('grokService');
			if (!grokService.isEnabled()) {
				return ctx.json({error: 'Grok is disabled'}, 503);
			}

			const adminService = ctx.get('adminService');

			// Fetch full user profile via admin lookup (takes string query)
			let user;
			try {
				const result = await adminService.lookupUser({query: userId});
				user = result?.user;
			} catch (err) {
				return ctx.json({error: 'User lookup failed', detail: (err as Error).message}, 500);
			}
			if (!user) return ctx.json({error: 'User not found'}, 404);

			// Derive account age from snowflake (Astral epoch = Discord epoch 2015-01-01)
			const DISCORD_EPOCH = 1420070400000;
			const snowflake = BigInt(userId);
			const createdAtMs = Number((snowflake >> 22n) + BigInt(DISCORD_EPOCH));
			const createdAt = new Date(createdAtMs).toISOString();
			const ageMs = Date.now() - createdAtMs;
			const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));

			// Fetch recent reports filed AGAINST this user
			let reportsSection = '\nНет жалоб на этого пользователя.';
			try {
				const reports = await adminService.searchReports({
					reported_user_id: BigInt(userId),
					limit: 20,
					offset: 0,
					sort_by: 'reportedAt',
					sort_order: 'desc',
				});
				if (reports.reports.length > 0) {
					const statusCounts: Record<string, number> = {};
					for (const r of reports.reports) {
						const s = r.status || 'unknown';
						statusCounts[s] = (statusCounts[s] ?? 0) + 1;
					}
					const statusLine = Object.entries(statusCounts)
						.map(([k, v]) => `${k}: ${v}`)
						.join(', ');
					const recent = reports.reports
						.slice(0, 10)
						.map(
							(r) =>
								`- [${r.report_type || 'N/A'}] status=${r.status} info="${(r.additional_info || '').slice(0, 120)}" (${r.report_id})`,
						)
						.join('\n');
					reportsSection = `\nЖалоб на пользователя: ${reports.total} (${statusLine}).\nПоследние ${Math.min(reports.reports.length, 10)}:\n${recent}`;
				}
			} catch {}

			const bio = user.bio ? String(user.bio).slice(0, 500) : '(пусто)';
			const globalName = user.global_name ?? user.username ?? 'unknown';
			const flags = typeof user.flags === 'number' ? user.flags : 0;
			const susFlags = typeof user.suspicious_activity_flags === 'number' ? user.suspicious_activity_flags : 0;
			const emailVerified = user.email_verified ? 'да' : 'нет';
			const hasTotp = user.has_totp ? 'да' : 'нет';
			const premium = user.premium_type ? `тип ${user.premium_type}` : 'нет';
			const tempBanned = user.temp_banned_until ? `ДО ${user.temp_banned_until}` : 'нет';
			const pendingDeletion = user.pending_deletion_at ? `удаление запланировано ${user.pending_deletion_at}` : 'нет';
			const lastActive = user.last_active_at ?? 'неизвестно';
			const lastIp = user.last_active_ip ?? 'неизвестно';
			const lastLocation = user.last_active_location ?? 'неизвестно';

			const prompt = `Ты — помощник админа Astral для модерации. Проанализируй профиль пользователя ниже и дай краткое, профессиональное заключение на русском.

ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ:
- Username: ${user.username}
- Display name: ${globalName}
- User ID: ${userId}
- Аккаунт создан: ${createdAt} (возраст: ${ageDays} дней)
- Последняя активность: ${lastActive}
- Последний IP: ${lastIp}
- Последняя локация: ${lastLocation}
- Bot: ${user.bot ? 'да' : 'нет'}
- System: ${user.system ? 'да' : 'нет'}
- Флаги: ${flags}
- Suspicious activity flags: ${susFlags}
- Email подтверждён: ${emailVerified}
- 2FA (TOTP): ${hasTotp}
- Премиум: ${premium}
- Временный бан: ${tempBanned}
- Ожидает удаления: ${pendingDeletion}
- Bio: ${bio}
${reportsSection}

Дай структурированный ответ максимум 300 слов:

1. **Аккаунт** — возраст, активность, подтверждённость, 2FA
2. **Сигналы риска** — если есть: подозрительные флаги, жалобы, статус, банhistorical
3. **Рекомендация** — OK / наблюдать / действовать (бан/шрот/ручная проверка)

Будь фактичен. Если данных мало — так и скажи. Не выдумывай.`;

			try {
				const result = await grokService.chat(
					[{role: 'user', content: prompt}],
					{temperature: 0.3, maxTokens: 1000},
				);
				return ctx.json({
					analysis: result.content,
					tokens: result.usage.totalTokens,
					data_used: {
						account_age_days: ageDays,
						bio_length: bio.length,
						flags,
						suspicious_flags: susFlags,
					},
				});
			} catch (err) {
				return ctx.json({error: (err as Error).message}, 500);
			}
		},
	);
};
