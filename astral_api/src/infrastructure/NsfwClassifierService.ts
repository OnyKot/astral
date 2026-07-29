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

export interface NsfwClassification {
	/** True if the image is likely NSFW */
	nsfw: boolean;
	/** True if the image likely contains CSAM (child sexual abuse material) */
	csam: boolean;
	/** Probability 0-1 for each category */
	scores: {
		drawing: number;
		hentai: number;
		neutral: number;
		porn: number;
		sexy: number;
	};
}

const NSFW_THRESHOLD = 0.7;
const CSAM_HENTAI_THRESHOLD = 0.85;

let model: import('nsfwjs').NSFWJS | null = null;
let modelLoading: Promise<import('nsfwjs').NSFWJS> | null = null;

async function getModel(): Promise<import('nsfwjs').NSFWJS> {
	if (model) return model;
	if (modelLoading) return modelLoading;

	modelLoading = (async () => {
		// Lazy import to avoid loading TF at startup
		const nsfwjs = await import('nsfwjs');
		await import('@tensorflow/tfjs-node'); // registers TF Node.js backend
		// Use the MobileNetV2 model — fast and accurate
		const loaded = await nsfwjs.load('https://nsfwjs.com/quant_nsfw_mobilenet/', {size: 224});
		model = loaded;
		Logger.info('[NsfwClassifier] Model loaded');
		return loaded;
	})();

	return modelLoading;
}

/**
 * Classify an image buffer for NSFW content.
 * Uses nsfwjs (TensorFlow.js) — runs locally, no external API calls.
 *
 * Returns null if classification fails (non-fatal — don't block upload on error).
 */
export async function classifyImage(imageBuffer: Buffer): Promise<NsfwClassification | null> {
	try {
		const tf = await import('@tensorflow/tfjs-node');
		const nsfwModel = await getModel();

		// Decode image to tensor
		const tensor = tf.node.decodeImage(imageBuffer, 3) as import('@tensorflow/tfjs-node').Tensor3D;

		const predictions = await nsfwModel.classify(tensor as unknown as HTMLImageElement);
		tensor.dispose();

		const scores = {
			drawing: 0,
			hentai: 0,
			neutral: 0,
			porn: 0,
			sexy: 0,
		};

		for (const p of predictions) {
			const key = p.className.toLowerCase() as keyof typeof scores;
			if (key in scores) scores[key] = p.probability;
		}

		const nsfw = scores.porn >= NSFW_THRESHOLD || scores.sexy >= NSFW_THRESHOLD;
		// Hentai at very high confidence may indicate CSAM — flag for human review
		const csam = scores.hentai >= CSAM_HENTAI_THRESHOLD || scores.porn >= 0.95;

		return {nsfw, csam, scores};
	} catch (error) {
		Logger.warn({error}, '[NsfwClassifier] Classification failed');
		return null;
	}
}

/**
 * Warm up the model on startup so first classification is fast.
 */
export async function warmUpNsfwModel(): Promise<void> {
	try {
		await getModel();
	} catch (error) {
		Logger.warn({error}, '[NsfwClassifier] Model warm-up failed — will retry on first use');
	}
}
