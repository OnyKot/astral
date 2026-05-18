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

import {Config} from '~/Config';
import {Logger} from '~/Logger';
import {VisionarySlotRepository} from '~/user/repositories/VisionarySlotRepository';

export class VisionarySlotInitializer {
	async initialize(): Promise<void> {
		if (!Config.stripe.enabled && !Config.wata.enabled) {
			return;
		}

		try {
			const repository = new VisionarySlotRepository();
			const existingSlots = await repository.listVisionarySlots();
			const targetSlotCount = Config.instance.visionarySlotCount;

			if (existingSlots.length === 0) {
				Logger.info(`[VisionarySlotInitializer] Creating ${targetSlotCount} visionary slots...`);
				await repository.expandVisionarySlots(targetSlotCount);
				Logger.info(`[VisionarySlotInitializer] Successfully created ${targetSlotCount} visionary slots`);
			} else {
				Logger.info(`[VisionarySlotInitializer] Found ${existingSlots.length} existing slots, skipping initialization`);
			}
		} catch (error) {
			Logger.error({error}, '[VisionarySlotInitializer] Failed to create visionary slots');
		}
	}
}
