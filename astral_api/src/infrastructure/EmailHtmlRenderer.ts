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

import type {EmailTemplateKey} from './email_i18n';

type AccentTone = 'indigo' | 'cyan' | 'emerald' | 'amber' | 'rose';
type EmailBrand = 'astral' | 'music';

interface EmailVisualPreset {
	label: string;
	kicker: string;
	tone: AccentTone;
	ctaLabel?: string;
}

interface EmailSection {
	title?: string;
	html: string;
}

export interface EmailHtmlRenderInput {
	templateKey: EmailTemplateKey;
	subject: string;
	textBody: string;
	appBaseUrl: string;
	marketingBaseUrl: string;
	brand?: EmailBrand;
}

interface EmailBrandingPreset {
	productName: string;
	mailLabel: string;
	defaultCtaLabel: string;
	footerPrimaryLabel: string;
	footerPrimaryPath: string;
	footerReason: string;
}

const VISUAL_PRESETS: Record<EmailTemplateKey, EmailVisualPreset> = {
	passwordReset: {
		label: 'Account Recovery',
		kicker: 'Secure access to your Astral account',
		tone: 'indigo',
		ctaLabel: 'Reset Password',
	},
	emailVerification: {
		label: 'Verification',
		kicker: 'Confirm your email and finish setup',
		tone: 'cyan',
		ctaLabel: 'Verify Email',
	},
	emailChangeOriginal: {
		label: 'Email Change',
		kicker: 'Confirm a sensitive account change',
		tone: 'amber',
	},
	emailChangeNew: {
		label: 'Email Change',
		kicker: 'Verify your new address',
		tone: 'cyan',
	},
	emailChangeRevert: {
		label: 'Security Alert',
		kicker: 'Undo an unexpected email change',
		tone: 'rose',
		ctaLabel: 'Secure Account',
	},
	passkeyMigrationNotice: {
		label: 'Passkeys',
		kicker: 'Move your sign-in setup to the new domain',
		tone: 'indigo',
		ctaLabel: 'Open Security Settings',
	},
	passkeyResetNotice: {
		label: 'Passkeys',
		kicker: 'Refresh your security setup',
		tone: 'amber',
		ctaLabel: 'Open Security Settings',
	},
	ipAuthorization: {
		label: 'Security Check',
		kicker: 'Review a login from a new location',
		tone: 'rose',
		ctaLabel: 'Authorize Login',
	},
	accountDisabledSuspicious: {
		label: 'Account Protection',
		kicker: 'Suspicious activity was detected',
		tone: 'rose',
		ctaLabel: 'Reset Password',
	},
	accountTempBanned: {
		label: 'Safety Action',
		kicker: 'Your account access is temporarily limited',
		tone: 'amber',
	},
	accountScheduledDeletion: {
		label: 'Safety Action',
		kicker: 'Your account is scheduled for deletion',
		tone: 'rose',
	},
	selfDeletionScheduled: {
		label: 'Account Lifecycle',
		kicker: 'Your self-serve deletion request is active',
		tone: 'amber',
		ctaLabel: 'Open Astral',
	},
	inactivityWarning: {
		label: 'Account Lifecycle',
		kicker: 'Keep your account active before cleanup',
		tone: 'amber',
		ctaLabel: 'Log In',
	},
	harvestCompleted: {
		label: 'Data Export',
		kicker: 'Your archive is ready to download',
		tone: 'emerald',
		ctaLabel: 'Download Export',
	},
	unbanNotification: {
		label: 'Safety Update',
		kicker: 'Access to your account has been restored',
		tone: 'emerald',
		ctaLabel: 'Open Astral',
	},
	scheduledDeletionNotification: {
		label: 'Safety Update',
		kicker: 'A severe moderation action was issued',
		tone: 'rose',
	},
	giftChargebackNotification: {
		label: 'Billing Update',
		kicker: 'A redeemed gift was revoked after a dispute',
		tone: 'amber',
	},
	reportResolved: {
		label: 'Safety Update',
		kicker: 'Your report has been reviewed',
		tone: 'cyan',
	},
	dsaReportVerification: {
		label: 'Verification Code',
		kicker: 'Confirm a Digital Services Act submission',
		tone: 'indigo',
	},
	registrationApproved: {
		label: 'Welcome',
		kicker: 'Your Astral account is ready',
		tone: 'emerald',
		ctaLabel: 'Open Astral',
	},
};

const TONE_STYLES: Record<
	AccentTone,
	{
		accent: string;
		glow: string;
		tint: string;
		pillBg: string;
		pillBorder: string;
	}
> = {
	indigo: {
		accent: '#7c83ff',
		glow: '#4f46e5',
		tint: '#151a38',
		pillBg: 'rgba(124,131,255,0.16)',
		pillBorder: 'rgba(124,131,255,0.35)',
	},
	cyan: {
		accent: '#4fdcff',
		glow: '#0891b2',
		tint: '#0d2230',
		pillBg: 'rgba(79,220,255,0.14)',
		pillBorder: 'rgba(79,220,255,0.32)',
	},
	emerald: {
		accent: '#3ddc97',
		glow: '#0f9f6e',
		tint: '#0f241e',
		pillBg: 'rgba(61,220,151,0.14)',
		pillBorder: 'rgba(61,220,151,0.32)',
	},
	amber: {
		accent: '#f5b84f',
		glow: '#d97706',
		tint: '#2b1e0f',
		pillBg: 'rgba(245,184,79,0.14)',
		pillBorder: 'rgba(245,184,79,0.32)',
	},
	rose: {
		accent: '#ff7aa2',
		glow: '#e11d48',
		tint: '#2c111b',
		pillBg: 'rgba(255,122,162,0.14)',
		pillBorder: 'rgba(255,122,162,0.32)',
	},
};

const BRANDING_PRESETS: Record<EmailBrand, EmailBrandingPreset> = {
	astral: {
		productName: 'Astral',
		mailLabel: 'Astral System Mail',
		defaultCtaLabel: 'Open Astral',
		footerPrimaryLabel: 'Open Astral',
		footerPrimaryPath: '/channels/@me',
		footerReason:
			'You are receiving this email because it is related to your Astral account or a request made from this address.',
	},
	music: {
		productName: 'AstraMusic',
		mailLabel: 'AstraMusic Mail',
		defaultCtaLabel: 'Open AstraMusic',
		footerPrimaryLabel: 'Open AstraMusic',
		footerPrimaryPath: '/home',
		footerReason:
			'You are receiving this email because it is related to your Astra account used in AstraMusic or a request made from this address.',
	},
};

export function renderEmailHtml(input: EmailHtmlRenderInput): string {
	const preset = VISUAL_PRESETS[input.templateKey];
	const tone = TONE_STYLES[preset.tone];
	const branding = BRANDING_PRESETS[input.brand ?? 'astral'];
	const parsed = parseTextBody(input.textBody);
	const primaryUrl = parsed.primaryUrl;
	const ctaLabel = primaryUrl ? preset.ctaLabel ?? branding.defaultCtaLabel : undefined;
	const contentHtml = parsed.sections.map((section) => renderSection(section)).join('');
	const footerLinks = buildFooterLinks(input.appBaseUrl, input.marketingBaseUrl, branding);

	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<meta name="color-scheme" content="dark" />
		<meta name="supported-color-schemes" content="dark" />
		<title>${escapeHtml(input.subject)}</title>
	</head>
	<body style="margin:0;padding:0;background-color:#09090b;font-family:Inter,Segoe UI,Arial,sans-serif;color:#f4f4f5;">
		<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:
			radial-gradient(circle at top left, rgba(79,70,229,0.28), transparent 35%),
			radial-gradient(circle at top right, rgba(34,211,238,0.18), transparent 32%),
			linear-gradient(180deg, #0b1021 0%, #09090b 58%, #050507 100%);
			background-color:#09090b;">
			<tr>
				<td align="center" style="padding:32px 16px;">
					<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;">
						<tr>
							<td style="padding-bottom:18px;">
								<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
									<tr>
										<td align="left">
											<table role="presentation" cellspacing="0" cellpadding="0" border="0">
												<tr>
													<td style="width:52px;height:52px;border-radius:18px;background:linear-gradient(135deg, ${tone.glow} 0%, ${tone.accent} 100%);text-align:center;font-size:28px;font-weight:800;color:#ffffff;">
														A
													</td>
													<td style="padding-left:14px;">
														<div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#a1a1aa;">${escapeHtml(branding.productName)}</div>
														<div style="font-size:20px;line-height:1.2;font-weight:800;color:#ffffff;">${escapeHtml(preset.label)}</div>
													</td>
												</tr>
											</table>
										</td>
										<td align="right" valign="top">
											<span style="display:inline-block;padding:8px 12px;border-radius:999px;background:${tone.pillBg};border:1px solid ${tone.pillBorder};font-size:12px;font-weight:700;letter-spacing:0.04em;color:${tone.accent};">
												${escapeHtml(preset.kicker)}
											</span>
										</td>
									</tr>
								</table>
							</td>
						</tr>
						<tr>
							<td style="border:1px solid rgba(255,255,255,0.10);border-radius:30px;background:linear-gradient(180deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.04) 100%);box-shadow:0 28px 70px rgba(0,0,0,0.40);overflow:hidden;">
								<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
									<tr>
										<td style="padding:34px 34px 20px 34px;background:
											radial-gradient(circle at 15% 0%, rgba(79,70,229,0.22), transparent 32%),
											radial-gradient(circle at 100% 0%, rgba(34,211,238,0.18), transparent 28%),
											linear-gradient(180deg, rgba(16,23,48,0.96) 0%, rgba(11,11,18,0.96) 100%);">
											<div style="font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:${tone.accent};font-weight:700;">${escapeHtml(branding.mailLabel)}</div>
											<h1 style="margin:12px 0 0 0;font-size:34px;line-height:1.08;font-weight:900;color:#ffffff;">${escapeHtml(input.subject)}</h1>
										</td>
									</tr>
									<tr>
										<td style="padding:0 34px 34px 34px;background-color:rgba(9,9,11,0.96);">
											<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:-16px;">
												<tr>
													<td style="padding:18px 20px;border:1px solid rgba(255,255,255,0.08);border-radius:22px;background:${tone.tint};box-shadow:inset 0 1px 0 rgba(255,255,255,0.05);font-size:15px;line-height:1.75;color:#d4d4d8;">
														${contentHtml}
													</td>
												</tr>
											</table>
											${ctaLabel && primaryUrl ? renderCta(primaryUrl, ctaLabel, tone.accent) : ''}
											<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;">
												<tr>
													<td style="padding:18px 20px;border-radius:20px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);">
														<div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#71717a;font-weight:700;">Helpful links</div>
														<div style="padding-top:10px;font-size:14px;line-height:1.9;color:#e4e4e7;">
															${footerLinks}
														</div>
													</td>
												</tr>
											</table>
											<p style="margin:20px 0 0 0;font-size:12px;line-height:1.7;color:#71717a;">
												${escapeHtml(branding.footerReason)}
											</p>
										</td>
									</tr>
								</table>
							</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>`;
}

function parseTextBody(textBody: string): {sections: Array<EmailSection>; primaryUrl?: string} {
	const paragraphs = textBody
		.replace(/\r\n/g, '\n')
		.trim()
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean);

	const sections: Array<EmailSection> = [];
	let primaryUrl: string | undefined;

	for (const paragraph of paragraphs) {
		if (isSignature(paragraph)) {
			continue;
		}

		if (isStandaloneUrl(paragraph)) {
			primaryUrl ??= paragraph;
			sections.push({
				title: 'Direct link',
				html: renderLinkCard(paragraph),
			});
			continue;
		}

		if (isVerificationCode(paragraph)) {
			sections.push({
				title: 'Verification code',
				html: `<div style="padding:18px 20px;border-radius:18px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);text-align:center;font-size:30px;line-height:1.2;font-weight:900;letter-spacing:0.22em;color:#ffffff;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;">${escapeHtml(paragraph)}</div>`,
			});
			continue;
		}

		if (isBulletList(paragraph)) {
			sections.push({html: renderBulletList(paragraph)});
			continue;
		}

		if (isNumberedList(paragraph)) {
			sections.push({html: renderNumberedList(paragraph)});
			continue;
		}

		if (isKeyValueBlock(paragraph)) {
			sections.push({html: renderKeyValueBlock(paragraph)});
			continue;
		}

		sections.push(renderTextSection(paragraph));
	}

	return {sections, primaryUrl};
}

function renderTextSection(paragraph: string): EmailSection {
	const lines = paragraph.split('\n').map((line) => line.trim()).filter(Boolean);
	if (lines.length > 1 && lines[0].endsWith(':')) {
		return {
			title: lines[0].slice(0, -1),
			html: `<p style="margin:0;color:#d4d4d8;">${linkifyAndEscape(lines.slice(1).join('\n'))}</p>`,
		};
	}

	return {
		html: `<p style="margin:0;color:#d4d4d8;">${linkifyAndEscape(lines.join('\n'))}</p>`,
	};
}

function renderSection(section: EmailSection): string {
	return `<div style="margin-top:16px;">
		${section.title ? `<div style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8b8b98;font-weight:700;">${escapeHtml(section.title)}</div>` : ''}
		${section.html}
	</div>`;
}

function renderCta(url: string, label: string, accent: string): string {
	const safeUrl = escapeAttribute(url);
	return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:26px;">
		<tr>
			<td>
				<a href="${safeUrl}" style="display:inline-block;padding:15px 22px;border-radius:16px;background:linear-gradient(135deg, ${accent} 0%, #ffffff 180%);color:#09090b;text-decoration:none;font-size:15px;font-weight:800;letter-spacing:0.02em;">
					${escapeHtml(label)}
				</a>
			</td>
		</tr>
	</table>`;
}

function renderLinkCard(url: string): string {
	const safeUrl = escapeAttribute(url);
	return `<div style="padding:14px 16px;border-radius:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);word-break:break-word;">
		<a href="${safeUrl}" style="color:#f4f4f5;text-decoration:none;">${escapeHtml(url)}</a>
	</div>`;
}

function renderBulletList(paragraph: string): string {
	const items = paragraph
		.split('\n')
		.map((line) => line.replace(/^-\s*/, '').trim())
		.filter(Boolean)
		.map((item) => `<li style="margin:0 0 8px 0;">${linkifyAndEscape(item)}</li>`)
		.join('');

	return `<ul style="margin:0;padding:0 0 0 18px;color:#d4d4d8;">${items}</ul>`;
}

function renderNumberedList(paragraph: string): string {
	const items = paragraph
		.split('\n')
		.map((line) => line.replace(/^\d+\.\s*/, '').trim())
		.filter(Boolean)
		.map((item) => `<li style="margin:0 0 8px 0;">${linkifyAndEscape(item)}</li>`)
		.join('');

	return `<ol style="margin:0;padding:0 0 0 20px;color:#d4d4d8;">${items}</ol>`;
}

function renderKeyValueBlock(paragraph: string): string {
	const rows = paragraph
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [key, ...rest] = line.split(':');
			const value = rest.join(':').trim();
			return `<tr>
				<td style="padding:0 0 8px 0;font-size:13px;color:#8b8b98;font-weight:700;vertical-align:top;">${escapeHtml(key)}:</td>
				<td style="padding:0 0 8px 14px;font-size:14px;color:#f4f4f5;vertical-align:top;">${linkifyAndEscape(value)}</td>
			</tr>`;
		})
		.join('');

	return `<table role="presentation" cellspacing="0" cellpadding="0" border="0">${rows}</table>`;
}

function buildFooterLinks(appBaseUrl: string, marketingBaseUrl: string, branding: EmailBrandingPreset): string {
	const links = [
		{label: branding.footerPrimaryLabel, href: `${appBaseUrl}${branding.footerPrimaryPath}`},
		{label: 'Security', href: `${marketingBaseUrl}/security`},
		{label: 'Privacy', href: `${marketingBaseUrl}/privacy`},
		{label: 'Terms', href: `${marketingBaseUrl}/terms`},
	];

	return links
		.map(
			(link) =>
				`<a href="${escapeAttribute(link.href)}" style="display:inline-block;margin:0 14px 8px 0;color:#c7d2fe;text-decoration:none;">${escapeHtml(link.label)}</a>`,
		)
		.join('');
}

function isStandaloneUrl(paragraph: string): boolean {
	return /^https?:\/\/\S+$/i.test(paragraph);
}

function isSignature(paragraph: string): boolean {
	return /^-\s+.+$/m.test(paragraph) && !paragraph.includes('\n');
}

function isVerificationCode(paragraph: string): boolean {
	return /^[A-Z0-9-]{4,16}$/i.test(paragraph);
}

function isBulletList(paragraph: string): boolean {
	return paragraph.split('\n').every((line) => /^-\s+/.test(line.trim()));
}

function isNumberedList(paragraph: string): boolean {
	return paragraph.split('\n').every((line) => /^\d+\.\s+/.test(line.trim()));
}

function isKeyValueBlock(paragraph: string): boolean {
	const lines = paragraph.split('\n').map((line) => line.trim()).filter(Boolean);
	return lines.length > 1 && lines.every((line) => /^[^:]{2,40}:\s+.+$/.test(line));
}

function linkifyAndEscape(text: string): string {
	const escaped = escapeHtml(text).replaceAll('\n', '<br />');
	return escaped.replace(
		/(https?:\/\/[^\s<]+)/gi,
		(url) =>
			`<a href="${escapeAttribute(url)}" style="color:#c7d2fe;text-decoration:none;border-bottom:1px solid rgba(199,210,254,0.35);">${escapeHtml(url)}</a>`,
	);
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function escapeAttribute(value: string): string {
	return escapeHtml(value);
}
