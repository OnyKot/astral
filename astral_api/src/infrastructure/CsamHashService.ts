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

import {Logger} from '~/Logger';
import {Config} from '~/Config';

export interface CsamHashResult {
	/** True if the content matches a known CSAM hash */
	isMatch: boolean;
	/** Hash that matched, if any */
	matchedHash?: string;
	/** Confidence score 0-1 */
	confidence: number;
}

/**
 * CSAM hash matching service using Microsoft PhotoDNA Cloud Service.
 *
 * PhotoDNA computes a perceptual hash of images and compares against
 * a database of known CSAM maintained by NCMEC. Free for qualifying services.
 *
 * Apply at: https://www.microsoft.com/en-us/photodna
 *
 * When PhotoDNA is not configured, falls back to local SHA-256 blocklist
 * (useful for testing or before PhotoDNA approval).
 */
export class CsamHashService {
	private readonly endpoint = 'https://api.microsoftphotodna.com/images/evaluate';
	private readonly subscriptionKey: string | null;

	// Local SHA-256 blocklist for known test hashes (populated from NCMEC reports)
	private readonly localBlocklist = new Set<string>();

	constructor(subscriptionKey?: string) {
		this.subscriptionKey = subscriptionKey ?? null;
	}

	get isEnabled(): boolean {
		return this.subscriptionKey !== null;
	}

	/**
	 * Check an image buffer against PhotoDNA cloud service.
	 * Falls back to local blocklist if PhotoDNA is not configured.
	 */
	async checkImage(imageBuffer: Buffer, mimeType: string): Promise<CsamHashResult> {
		// Try PhotoDNA first if configured
		if (this.subscriptionKey) {
			return this.checkWithPhotoDna(imageBuffer, mimeType);
		}

		// Fallback: local SHA-256 blocklist
		return this.checkLocalBlocklist(imageBuffer);
	}

	private async checkWithPhotoDna(imageBuffer: Buffer, mimeType: string): Promise<CsamHashResult> {
		try {
			const response = await fetch(this.endpoint, {
				method: 'POST',
				headers: {
					'Ocp-Apim-Subscription-Key': this.subscriptionKey!,
					'Content-Type': mimeType,
				},
				body: imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength) as ArrayBuffer,
				signal: AbortSignal.timeout(10_000),
			});

			if (!response.ok) {
				Logger.warn({status: response.status}, '[CsamHash] PhotoDNA API error');
				return {isMatch: false, confidence: 0};
			}

			const result = await response.json() as {
				IsMatch: boolean;
				MatchConfidence?: number;
				HashId?: string;
			};

			return {
				isMatch: result.IsMatch,
				confidence: result.MatchConfidence ?? (result.IsMatch ? 1.0 : 0.0),
				matchedHash: result.HashId,
			};
		} catch (error) {
			Logger.warn({error}, '[CsamHash] PhotoDNA check failed');
			return {isMatch: false, confidence: 0};
		}
	}

	private async checkLocalBlocklist(imageBuffer: Buffer): Promise<CsamHashResult> {
		const crypto = await import('node:crypto');
		const sha256 = crypto.createHash('sha256').update(imageBuffer).digest('hex');
		const isMatch = this.localBlocklist.has(sha256);
		return {isMatch, confidence: isMatch ? 1.0 : 0.0, matchedHash: isMatch ? sha256 : undefined};
	}

	/**
	 * Add a hash to the local blocklist (e.g. from NCMEC reports).
	 */
	addToLocalBlocklist(sha256Hash: string): void {
		this.localBlocklist.add(sha256Hash.toLowerCase());
	}

	/**
	 * Report confirmed CSAM to NCMEC CyberTipline.
	 * This is legally required in the US when CSAM is discovered.
	 *
	 * API docs: https://www.missingkids.org/gethelpnow/cybertipline
	 */
	async reportToNcmec(params: {
		userId: string;
		fileUrl: string;
		ipAddress?: string;
		reportedAt: Date;
	}): Promise<boolean> {
		const ncmecKey = Config.ncmec?.apiKey;
		if (!ncmecKey) {
			Logger.error({params}, '[CsamHash] NCMEC key not configured — CSAM detected but cannot report!');
			return false;
		}

		try {
			// NCMEC CyberTipline API
			const response = await fetch('https://report.cybertip.org/api/v1/reports', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${ncmecKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					reporterName: 'Astral',
					incidentDateTime: params.reportedAt.toISOString(),
					userId: params.userId,
					fileUrl: params.fileUrl,
					ipAddress: params.ipAddress,
					contentType: 'CSAM',
				}),
				signal: AbortSignal.timeout(15_000),
			});

			if (response.ok) {
				Logger.info({userId: params.userId}, '[CsamHash] NCMEC report submitted');
				return true;
			}

			Logger.error({status: response.status}, '[CsamHash] NCMEC report failed');
			return false;
		} catch (error) {
			Logger.error({error}, '[CsamHash] NCMEC report error');
			return false;
		}
	}
}

export const csamHashService = new CsamHashService(
	process.env.PHOTODNA_SUBSCRIPTION_KEY
);
