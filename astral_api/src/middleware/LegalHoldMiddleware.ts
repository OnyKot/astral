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

import {createMiddleware} from 'hono/factory';
import type {HonoEnv} from '~/App';
import {APIErrorCodes} from '~/Constants';
import {Config} from '~/Config';
import {Logger} from '~/Logger';
import {AstralAPIError} from '~/errors/AstralAPIError';
import {extractClientIp, lookupGeoip} from '~/utils/IpUtils';
import {prefersHtml, type LegalHoldAction, resolveLegalHoldDecision, shouldBypassLegalHold} from './LegalHoldRules';

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function renderRegionUnavailablePage({
	requestId,
	message,
	details,
	supportUrl,
}: {
	requestId: string;
	message: string;
	details: string;
	supportUrl?: string | null;
}): string {
	const supportLink = supportUrl
		? `<p><a href="${escapeHtml(supportUrl)}">Contact support</a></p>`
		: '<p>Please contact support if you believe this is an error.</p>';

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Service unavailable in your region</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #081c2b;
      color: #f8fafc;
      font-family: Inter, system-ui, sans-serif;
      padding: 24px;
    }
    main {
      width: min(100%, 560px);
      background: rgba(8, 12, 20, 0.8);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 18px;
      padding: 32px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
    }
    h1 { margin: 0 0 12px; font-size: 32px; line-height: 1.05; }
    p { margin: 0 0 12px; color: #cbd5e1; line-height: 1.6; }
    .meta {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid rgba(148, 163, 184, 0.18);
      font-size: 14px;
      color: #94a3b8;
    }
    a { color: #f8fafc; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(message)}</h1>
    <p>${escapeHtml(details)}</p>
    ${supportLink}
    <div class="meta">Request ID: ${escapeHtml(requestId)}</div>
  </main>
</body>
</html>`;
}

export function createLegalHoldErrorResponse({
	request,
	requestId,
	action,
	ruleId,
	reason,
	countryCode,
}: {
	request: Request;
	requestId: string;
	action: Extract<LegalHoldAction, 'challenge' | 'block'>;
	ruleId: string;
	reason: string;
	countryCode: string | null;
}): Response {
	const isBlock = action === 'block';
	const status = isBlock ? 451 : 403;
	const code = isBlock ? APIErrorCodes.SERVICE_UNAVAILABLE_IN_REGION : APIErrorCodes.LEGAL_HOLD_CHALLENGE_REQUIRED;
	const message = isBlock
		? 'This service is temporarily unavailable in your region.'
		: 'Additional verification is required for access from your network.';
	const details = isBlock
		? 'If you believe this restriction is incorrect, contact support and include the request ID.'
		: 'Contact support and include the request ID if you need additional verification.';

	if (prefersHtml(request) && request.method === 'GET') {
		return new Response(
			renderRegionUnavailablePage({
				requestId,
				message,
				details,
				supportUrl: Config.legalHold.supportUrl,
			}),
			{
				status,
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					'X-Request-Id': requestId,
				},
			},
		);
	}

	return new AstralAPIError({
		code,
		message,
		status,
		data: {
			legal_hold: {
				action,
				country_code: countryCode,
				rule_id: ruleId,
				reason,
				request_id: requestId,
			},
		},
		headers: {
			'X-Request-Id': requestId,
		},
	}).getResponse();
}

export function createLegalHoldPreviewResponse(requestId: string): Response {
	return new Response(
		renderRegionUnavailablePage({
			requestId,
			message: 'This service is temporarily unavailable in your region.',
			details: 'This is a preview of the legal hold page. No restriction has been applied to your request.',
			supportUrl: Config.legalHold.supportUrl,
		}),
		{
			status: 200,
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'X-Request-Id': requestId,
			},
		},
	);
}

export const LegalHoldMiddleware = createMiddleware<HonoEnv>(async (ctx, next) => {
	const {legalHold} = Config;
	if (!legalHold.enabled) {
		await next();
		return;
	}

	const path = ctx.req.path;
	if (shouldBypassLegalHold(path, legalHold.exemptPaths)) {
		await next();
		return;
	}

	const requestId = ctx.get('requestId');
	const clientIp = extractClientIp(ctx.req.raw);
	const geo = clientIp ? await lookupGeoip(clientIp) : null;
	const decision = resolveLegalHoldDecision(
		geo?.countryCode ?? null,
		{
			allow: legalHold.allowCountries,
			warn: legalHold.warnCountries,
			challenge: legalHold.challengeCountries,
			block: legalHold.blockCountries,
		},
		legalHold.defaultAction,
	);

	if (decision.action === 'allow') {
		await next();
		return;
	}

	const logContext = {
		requestId,
		ip: clientIp,
		path,
		method: ctx.req.method,
		countryCode: decision.countryCode,
		ruleId: decision.ruleId,
		reason: decision.reason,
		action: decision.action,
		dryRun: legalHold.dryRun,
		policy: legalHold.policyName || undefined,
	};

	if (decision.action === 'warn') {
		Logger.warn(logContext, 'Legal hold rule matched in warn mode');
		ctx.header('X-Astral-Compliance-Notice', `${decision.ruleId}; action=warn`);
		await next();
		return;
	}

	if (legalHold.dryRun) {
		Logger.warn(logContext, 'Legal hold rule matched in dry-run mode');
		ctx.header('X-Astral-Compliance-Notice', `${decision.ruleId}; action=${decision.action}; dry-run=true`);
		await next();
		return;
	}

	Logger.warn(logContext, 'Legal hold rule blocked request');
	return createLegalHoldErrorResponse({
		request: ctx.req.raw,
		requestId,
		action: decision.action,
		ruleId: decision.ruleId,
		reason: decision.reason,
		countryCode: decision.countryCode,
	});
});
