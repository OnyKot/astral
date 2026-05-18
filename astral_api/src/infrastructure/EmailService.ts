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

import sgMail from '@sendgrid/mail';
import nodemailer, {type Transporter} from 'nodemailer';
import validator from 'validator';
import {Config} from '~/Config';
import type {AdminBroadcastEmailOptions, EmailLinkContext, IEmailService} from '~/infrastructure/IEmailService';
import {Logger} from '~/Logger';
import type {IUserRepository} from '~/user/IUserRepository';
import {EmailI18nService} from './EmailI18nService';
import {renderEmailHtml} from './EmailHtmlRenderer';
import type {EmailTemplateKey} from './email_i18n';

export class EmailService implements IEmailService {
	private readonly appBaseUrl: string;
	private readonly marketingBaseUrl: string;
	private readonly emailI18n: EmailI18nService;
	private readonly smtpTransporter?: Transporter;

	constructor(private readonly userRepository: IUserRepository) {
		this.appBaseUrl = Config.endpoints.webApp;
		this.marketingBaseUrl = Config.endpoints.marketing;
		this.emailI18n = new EmailI18nService();

		if (this.isSmtpConfigured()) {
			this.smtpTransporter = nodemailer.createTransport({
				host: Config.email.smtp!.host,
				port: Config.email.smtp!.port,
				secure: Config.email.smtp!.secure,
				auth: {
					user: Config.email.smtp!.user,
					pass: Config.email.smtp!.pass,
				},
			});
		}

		if (this.isSendGridConfigured()) {
			sgMail.setApiKey(Config.email.apiKey!);
		}
	}

	private isEmailEnabled(): boolean {
		const hasProvider = this.isSmtpConfigured() || this.isSendGridConfigured();
		if (!hasProvider) return false;

		// Fallback to raw env to avoid false negatives from malformed env parsing.
		const rawFlag = process.env.EMAIL_ENABLED?.trim().toLowerCase();
		const envEnabled = rawFlag === 'true' || rawFlag === '1';
		return Config.email.enabled || envEnabled;
	}

	private isSmtpConfigured(): boolean {
		return !!(Config.email.smtp && Config.email.fromEmail);
	}

	private isSendGridConfigured(): boolean {
		return !!(Config.email.apiKey && Config.email.fromEmail);
	}

	private normalizeRecipientEmail(email: string): string | null {
		const trimmed = email.trim();
		if (!trimmed || !validator.isEmail(trimmed, {allow_utf8_local_part: false})) {
			return null;
		}

		return trimmed;
	}

	private async resolveSendableRecipient(to: string): Promise<string | null> {
		const recipient = this.normalizeRecipientEmail(to);
		if (!recipient) {
			Logger.warn({email: to}, 'Refusing to send email to invalid recipient address');
			return null;
		}

		const user = await this.userRepository.findByEmail(recipient.toLowerCase());
		if (user?.emailBounced) {
			Logger.warn(
				{email: recipient, userId: user.id},
				'Refusing to send email to bounced address - email marked as hard bounced',
			);
			return null;
		}

		return recipient;
	}

	private normalizeBaseUrl(value: string): string {
		return value.replace(/\/+$/, '');
	}

	private resolveEmailLinkContext(context?: EmailLinkContext): Required<EmailLinkContext> {
		return {
			appBaseUrl: this.normalizeBaseUrl(context?.appBaseUrl || this.appBaseUrl),
			brand: context?.brand === 'music' ? 'music' : 'astral',
		};
	}

	private getBrandedSubject(subject: string, context?: EmailLinkContext): string {
		const resolvedContext = this.resolveEmailLinkContext(context);
		if (resolvedContext.brand === 'music' && !subject.includes('AstraMusic')) {
			return `${subject} • AstraMusic`;
		}

		return subject;
	}

	private getFromName(context?: EmailLinkContext): string {
		const resolvedContext = this.resolveEmailLinkContext(context);
		return resolvedContext.brand === 'music' ? 'AstraMusic' : Config.email.fromName;
	}

	private async sendEmailWithTemplate(
		email: string,
		templateKey: EmailTemplateKey,
		subject: string,
		body: string,
		logContext: string,
		context?: EmailLinkContext,
	): Promise<boolean> {
		const brandedSubject = this.getBrandedSubject(subject, context);
		if (!this.isEmailEnabled()) {
			Logger.info(
				{logContext},
				`Email service disabled. Would have sent:\nTo: ${email}\nSubject: ${brandedSubject}\n\n${body}`,
			);
			return true;
		}
		return await this.sendEmail(email, templateKey, brandedSubject, body, context);
	}

	async sendAdminBroadcastEmail(
		email: string,
		username: string,
		subject: string,
		body: string,
		_locale: string | null = null,
		options: AdminBroadcastEmailOptions = {},
	): Promise<boolean> {
		if (!this.isEmailEnabled()) {
			Logger.info(
				{logContext: 'admin broadcast'},
				`Email service disabled. Would have sent:\nTo: ${email}\nSubject: ${subject}\n\n${body}`,
			);
			return true;
		}

		return this.sendCustomEmail(
			email,
			subject,
			body,
			this.renderAdminBroadcastHtml(username, subject, body),
			this.buildAdminBroadcastHeaders(options),
		);
	}

	async sendPasswordResetEmail(
		email: string,
		username: string,
		resetToken: string,
		locale: string | null = null,
		context?: EmailLinkContext,
	): Promise<boolean> {
		const resolvedContext = this.resolveEmailLinkContext(context);
		const resetUrl = `${resolvedContext.appBaseUrl}/reset#token=${resetToken}`;
		const template = this.emailI18n.getTemplate('passwordReset', locale, {
			username,
			resetUrl,
		});
		return this.sendEmailWithTemplate(email, 'passwordReset', template.subject, template.body, 'password reset', context);
	}

	async sendEmailVerification(
		email: string,
		username: string,
		verificationToken: string,
		locale: string | null = null,
		context?: EmailLinkContext,
	): Promise<boolean> {
		const resolvedContext = this.resolveEmailLinkContext(context);
		const verifyUrl = `${resolvedContext.appBaseUrl}/verify#token=${verificationToken}`;
		const template = this.emailI18n.getTemplate('emailVerification', locale, {
			username,
			verifyUrl,
		});
		return this.sendEmailWithTemplate(email, 'emailVerification', template.subject, template.body, 'verification', context);
	}

	async sendIpAuthorizationEmail(
		email: string,
		username: string,
		authorizationToken: string,
		ipAddress: string,
		location: string,
		locale: string | null = null,
		context?: EmailLinkContext,
	): Promise<boolean> {
		const resolvedContext = this.resolveEmailLinkContext(context);
		const authUrl = `${resolvedContext.appBaseUrl}/authorize-ip#token=${authorizationToken}`;
		const template = this.emailI18n.getTemplate('ipAuthorization', locale, {
			username,
			authUrl,
			ipAddress,
			location,
		});
		return this.sendEmailWithTemplate(email, 'ipAuthorization', template.subject, template.body, 'ip authorization', context);
	}

	async sendAccountDisabledForSuspiciousActivityEmail(
		email: string,
		username: string,
		reason: string | null,
		locale: string | null = null,
	): Promise<boolean> {
		const forgotUrl = `${this.appBaseUrl}/forgot`;
		const template = this.emailI18n.getTemplate('accountDisabledSuspicious', locale, {
			username,
			reason,
			forgotUrl,
		});
		return this.sendEmailWithTemplate(
			email,
			'accountDisabledSuspicious',
			template.subject,
			template.body,
			'account disabled suspicious',
		);
	}

	async sendAccountTempBannedEmail(
		email: string,
		username: string,
		reason: string | null,
		durationHours: number,
		bannedUntil: Date,
		locale: string | null = null,
	): Promise<boolean> {
		const termsUrl = `${this.marketingBaseUrl}/terms`;
		const guidelinesUrl = `${this.marketingBaseUrl}/guidelines`;
		const template = this.emailI18n.getTemplate('accountTempBanned', locale, {
			username,
			reason,
			durationHours,
			bannedUntil,
			termsUrl,
			guidelinesUrl,
		});
		return this.sendEmailWithTemplate(email, 'accountTempBanned', template.subject, template.body, 'account temp banned');
	}

	async sendAccountScheduledForDeletionEmail(
		email: string,
		username: string,
		reason: string | null,
		deletionDate: Date,
		locale: string | null = null,
	): Promise<boolean> {
		const termsUrl = `${this.marketingBaseUrl}/terms`;
		const guidelinesUrl = `${this.marketingBaseUrl}/guidelines`;
		const template = this.emailI18n.getTemplate('accountScheduledDeletion', locale, {
			username,
			reason,
			deletionDate,
			termsUrl,
			guidelinesUrl,
		});
		return this.sendEmailWithTemplate(
			email,
			'accountScheduledDeletion',
			template.subject,
			template.body,
			'account scheduled deletion',
		);
	}

	async sendSelfDeletionScheduledEmail(
		email: string,
		username: string,
		deletionDate: Date,
		locale: string | null = null,
	): Promise<boolean> {
		const template = this.emailI18n.getTemplate('selfDeletionScheduled', locale, {
			username,
			deletionDate,
		});
		return this.sendEmailWithTemplate(email, 'selfDeletionScheduled', template.subject, template.body, 'self deletion');
	}

	async sendUnbanNotification(
		email: string,
		username: string,
		reason: string,
		locale: string | null = null,
	): Promise<boolean> {
		const template = this.emailI18n.getTemplate('unbanNotification', locale, {
			username,
			reason,
		});
		return this.sendEmailWithTemplate(email, 'unbanNotification', template.subject, template.body, 'unban notification');
	}

	async sendScheduledDeletionNotification(
		email: string,
		username: string,
		deletionDate: Date,
		reason: string,
		locale: string | null = null,
	): Promise<boolean> {
		const template = this.emailI18n.getTemplate('scheduledDeletionNotification', locale, {
			username,
			deletionDate,
			reason,
		});
		return this.sendEmailWithTemplate(
			email,
			'scheduledDeletionNotification',
			template.subject,
			template.body,
			'scheduled deletion notification',
		);
	}

	async sendInactivityWarningEmail(
		email: string,
		username: string,
		deletionDate: Date,
		lastActiveDate: Date,
		locale: string | null = null,
	): Promise<boolean> {
		const loginUrl = `${this.appBaseUrl}/login`;
		const template = this.emailI18n.getTemplate('inactivityWarning', locale, {
			username,
			deletionDate,
			lastActiveDate,
			loginUrl,
		});
		return this.sendEmailWithTemplate(email, 'inactivityWarning', template.subject, template.body, 'inactivity warning');
	}

	async sendHarvestCompletedEmail(
		email: string,
		username: string,
		downloadUrl: string,
		totalMessages: number,
		fileSize: number,
		expiresAt: Date,
		locale: string | null = null,
	): Promise<boolean> {
		const fileSizeMB = Number.parseFloat((fileSize / 1024 / 1024).toFixed(2));
		const template = this.emailI18n.getTemplate('harvestCompleted', locale, {
			username,
			downloadUrl,
			totalMessages,
			fileSizeMB,
			expiresAt,
		});
		return this.sendEmailWithTemplate(email, 'harvestCompleted', template.subject, template.body, 'harvest completed');
	}

	async sendGiftChargebackNotification(
		email: string,
		username: string,
		locale: string | null = null,
	): Promise<boolean> {
		const template = this.emailI18n.getTemplate('giftChargebackNotification', locale, {
			username,
		});
		return this.sendEmailWithTemplate(
			email,
			'giftChargebackNotification',
			template.subject,
			template.body,
			'gift chargeback notification',
		);
	}

	async sendReportResolvedEmail(
		email: string,
		username: string,
		reportId: string,
		publicComment: string,
		locale: string | null = null,
	): Promise<boolean> {
		const template = this.emailI18n.getTemplate('reportResolved', locale, {
			username,
			reportId,
			publicComment,
		});
		return this.sendEmailWithTemplate(email, 'reportResolved', template.subject, template.body, 'report resolved');
	}

	async sendDsaReportVerificationCode(
		email: string,
		code: string,
		expiresAt: Date,
		locale: string | null = null,
	): Promise<boolean> {
		const template = this.emailI18n.getTemplate('dsaReportVerification', locale, {
			code,
			expiresAt,
		});
		return this.sendEmailWithTemplate(
			email,
			'dsaReportVerification',
			template.subject,
			template.body,
			'dsa report verification',
		);
	}

	async sendRegistrationApprovedEmail(email: string, username: string, locale: string | null = null): Promise<boolean> {
		const channelsUrl = `${this.appBaseUrl}/channels/@me`;
		const template = this.emailI18n.getTemplate('registrationApproved', locale, {
			username,
			channelsUrl,
		});
		return this.sendEmailWithTemplate(
			email,
			'registrationApproved',
			template.subject,
			template.body,
			'registration approved',
		);
	}

	async sendEmailChangeOriginal(
		email: string,
		username: string,
		code: string,
		locale: string | null = null,
	): Promise<boolean> {
		const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
		const template = this.emailI18n.getTemplate('emailChangeOriginal', locale, {
			username,
			code,
			expiresAt,
		});
		return this.sendEmailWithTemplate(
			email,
			'emailChangeOriginal',
			template.subject,
			template.body,
			'email change original',
		);
	}

	async sendEmailChangeNew(
		email: string,
		username: string,
		code: string,
		locale: string | null = null,
	): Promise<boolean> {
		const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
		const template = this.emailI18n.getTemplate('emailChangeNew', locale, {
			username,
			code,
			expiresAt,
		});
		return this.sendEmailWithTemplate(email, 'emailChangeNew', template.subject, template.body, 'email change new');
	}

	async sendEmailChangeRevert(
		email: string,
		username: string,
		newEmail: string,
		token: string,
		locale: string | null = null,
	): Promise<boolean> {
		const revertUrl = `${this.appBaseUrl}/wasntme#token=${token}`;
		const template = this.emailI18n.getTemplate('emailChangeRevert', locale, {
			username,
			revertUrl,
			newEmail,
		});
		return this.sendEmailWithTemplate(email, 'emailChangeRevert', template.subject, template.body, 'email change revert');
	}

	async sendPasskeyMigrationNotice(
		email: string,
		username: string,
		locale: string | null = null,
	): Promise<boolean> {
		const loginUrl = `${this.appBaseUrl}/login`;
		const securityUrl = `${this.appBaseUrl}/channels/@me`;
		const template = this.emailI18n.getTemplate('passkeyMigrationNotice', locale, {
			username,
			loginUrl,
			securityUrl,
			legacyDomain: 'asrtal.ru',
			newDomain: 'astraof.com',
		});
		return this.sendEmailWithTemplate(
			email,
			'passkeyMigrationNotice',
			template.subject,
			template.body,
			'passkey migration notice',
		);
	}

	async sendPasskeyResetNotice(email: string, username: string, locale: string | null = null): Promise<boolean> {
		const loginUrl = `${this.appBaseUrl}/login`;
		const securityUrl = `${this.appBaseUrl}/channels/@me`;
		const forgotUrl = `${this.appBaseUrl}/forgot`;
		const template = this.emailI18n.getTemplate('passkeyResetNotice', locale, {
			username,
			loginUrl,
			securityUrl,
			forgotUrl,
			newDomain: 'astraof.com',
		});
		return this.sendEmailWithTemplate(
			email,
			'passkeyResetNotice',
			template.subject,
			template.body,
			'passkey reset notice',
		);
	}

	private async sendEmail(
		to: string,
		templateKey: EmailTemplateKey,
		subject: string,
		textBody: string,
		context?: EmailLinkContext,
	): Promise<boolean> {
		if (!this.isEmailEnabled()) return false;

		const recipient = await this.resolveSendableRecipient(to);
		if (!recipient) {
			return false;
		}

		try {
			const resolvedContext = this.resolveEmailLinkContext(context);
			const fromName = this.getFromName(resolvedContext);
			const htmlBody = renderEmailHtml({
				templateKey,
				subject,
				textBody,
				appBaseUrl: resolvedContext.appBaseUrl,
				marketingBaseUrl: this.marketingBaseUrl,
				brand: resolvedContext.brand,
			});

			const msg: sgMail.MailDataRequired = {
				to: recipient,
				from: {
					email: Config.email.fromEmail,
					name: fromName,
				},
				subject,
				text: textBody,
				html: htmlBody,
				trackingSettings: {
					clickTracking: {
						enable: false,
						enableText: false,
					},
				},
			};
			if (this.smtpTransporter) {
				await this.smtpTransporter.sendMail({
					to: recipient,
					from: {
						address: Config.email.fromEmail,
						name: fromName,
					},
					subject,
					text: textBody,
					html: htmlBody,
				});
				Logger.debug({to: recipient}, 'Email sent successfully via SMTP');
				return true;
			}

			if (this.isSendGridConfigured()) {
				await sgMail.send(msg);
				Logger.debug({to: recipient}, 'Email sent successfully via SendGrid');
				return true;
			}

			Logger.warn({to: recipient}, 'Email enabled but no SMTP or SendGrid provider configured');
			return false;
		} catch (error) {
			Logger.error({error, to: recipient}, 'Error sending email');
			return false;
		}
	}

	private async sendCustomEmail(
		to: string,
		subject: string,
		textBody: string,
		htmlBody: string,
		headers: Record<string, string> = {},
	): Promise<boolean> {
		if (!this.isEmailEnabled()) return false;

		const recipient = await this.resolveSendableRecipient(to);
		if (!recipient) {
			return false;
		}

		try {
			const msg: sgMail.MailDataRequired = {
				to: recipient,
				from: {
					email: Config.email.fromEmail,
					name: Config.email.fromName,
				},
				subject,
				text: textBody,
				html: htmlBody,
				trackingSettings: {
					clickTracking: {
						enable: false,
						enableText: false,
					},
				},
				headers,
			};

			if (this.smtpTransporter) {
				await this.smtpTransporter.sendMail({
					to: recipient,
					from: {
						address: Config.email.fromEmail,
						name: Config.email.fromName,
					},
					subject,
					text: textBody,
					html: htmlBody,
					headers,
				});
				Logger.debug({to: recipient}, 'Custom email sent successfully via SMTP');
				return true;
			}

			if (this.isSendGridConfigured()) {
				await sgMail.send(msg);
				Logger.debug({to: recipient}, 'Custom email sent successfully via SendGrid');
				return true;
			}

			Logger.warn({to: recipient}, 'Email enabled but no SMTP or SendGrid provider configured');
			return false;
		} catch (error) {
			Logger.error({error, to: recipient}, 'Error sending custom email');
			return false;
		}
	}

	private buildAdminBroadcastHeaders(options: AdminBroadcastEmailOptions): Record<string, string> {
		if (options.attachTrackingHeaders === false) {
			return {};
		}

		const headers: Record<string, string> = {
			'X-Astral-Email-Type': 'admin_broadcast',
		};

		if (options.broadcastKey) {
			headers['X-Astral-Broadcast-Key'] = options.broadcastKey;
		}

		if (options.category) {
			headers['X-Astral-Broadcast-Category'] = options.category;
		}

		return headers;
	}

	private renderAdminBroadcastHtml(username: string, subject: string, body: string): string {
		const escapedSubject = this.escapeHtml(subject);
		const escapedUsername = this.escapeHtml(username);
		const bodyHtml = body
			.split(/\r?\n\r?\n/)
			.map((paragraph) => paragraph.trim())
			.filter((paragraph) => paragraph.length > 0)
			.map((paragraph) => `<p style="margin:0 0 16px 0;">${this.escapeHtml(paragraph).replace(/\r?\n/g, '<br />')}</p>`)
			.join('');

		return `<!doctype html>
<html lang="ru">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>${escapedSubject}</title>
	</head>
	<body style="margin:0;padding:24px;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#111827;">
		<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
			<tr>
				<td align="center">
					<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;">
						<tr>
							<td style="padding:28px 32px;background:linear-gradient(135deg,#5b6cff 0%,#7a5cff 100%);color:#ffffff;">
								<div style="font-size:28px;font-weight:700;line-height:1.2;">Astral</div>
								<div style="margin-top:8px;font-size:14px;line-height:1.5;color:rgba(255,255,255,0.88);">Системное уведомление платформы</div>
							</td>
						</tr>
						<tr>
							<td style="padding:32px;">
								<h1 style="margin:0 0 16px 0;font-size:28px;line-height:1.2;color:#111827;">${escapedSubject}</h1>
								<p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#374151;">Здравствуйте, ${escapedUsername}.</p>
								<div style="font-size:16px;line-height:1.7;color:#374151;">${bodyHtml}</div>
							</td>
						</tr>
						<tr>
							<td style="padding:24px 32px 32px 32px;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.6;color:#6b7280;">
								<div style="margin:0 0 8px 0;">Это письмо отправлено системой Astral.</div>
								<div style="margin:0;">https://astraof.com</div>
							</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>`;
	}

	private escapeHtml(value: string): string {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');
	}
}
