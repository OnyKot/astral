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

/*
 * Discord-compatible message components (action rows + buttons + selects).
 * Mirrors the backend ComponentTypes.ts but as plain TS interfaces — the
 * client doesn't need to validate the structure; the API already did
 * that on the way in. We do enforce the types when rendering so a
 * malformed payload from a buggy bot just doesn't render that node.
 */

export const COMPONENT_TYPE_ACTION_ROW = 1;
export const COMPONENT_TYPE_BUTTON = 2;
export const COMPONENT_TYPE_STRING_SELECT = 3;

export const BUTTON_STYLE_PRIMARY = 1;
export const BUTTON_STYLE_SECONDARY = 2;
export const BUTTON_STYLE_SUCCESS = 3;
export const BUTTON_STYLE_DANGER = 4;
export const BUTTON_STYLE_LINK = 5;

export type ButtonStyle = 1 | 2 | 3 | 4 | 5;

export interface ButtonEmoji {
	id?: string | null;
	name?: string | null;
	animated?: boolean | null;
}

export interface ButtonComponent {
	type: 2;
	style: ButtonStyle;
	label?: string | null;
	emoji?: ButtonEmoji | null;
	custom_id?: string | null;
	url?: string | null;
	disabled?: boolean;
}

export interface SelectOption {
	label: string;
	value: string;
	description?: string | null;
	emoji?: ButtonEmoji | null;
	default?: boolean;
}

export interface StringSelectComponent {
	type: 3;
	custom_id: string;
	options: ReadonlyArray<SelectOption>;
	placeholder?: string | null;
	min_values?: number;
	max_values?: number;
	disabled?: boolean;
}

export type RowChildComponent = ButtonComponent | StringSelectComponent;

export interface MessageActionRow {
	type: 1;
	components: ReadonlyArray<RowChildComponent>;
}

export type MessageComponents = ReadonlyArray<MessageActionRow>;
