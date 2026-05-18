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

import RuntimeConfigStore from '~/stores/RuntimeConfigStore';
import * as CodeLinkUtils from '~/utils/CodeLinkUtils';

const GIFT_CONFIG: CodeLinkUtils.CodeLinkConfig = {
	get shortHost() {
		return RuntimeConfigStore.giftHost;
	},
	path: 'gift',
};

export function findGifts(content: string | null): Array<string> {
	return CodeLinkUtils.findCodes(content, GIFT_CONFIG);
}
