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
 * Discord-style Message Components.
 *
 * A component tree on a message is always rooted in `Array<MessageActionRow>`
 * (component_type=1). Each row contains up to 5 children:
 *   - Button (type=2)
 *   - StringSelect (type=3) — full-width, exclusive in its row
 *   - TextInput (type=4) — modals only, never on messages
 *   - User/Role/Mentionable/Channel selects (types 5-8) — same constraints
 *
 * For an MVP we accept Button + StringSelect on messages. Other types
 * are passed through opaquely (the renderer can grow to support them
 * without a schema bump).
 *
 * Limits mirror Discord's:
 *   - max 5 action rows per message
 *   - max 5 buttons per action row
 *   - 1 select menu per action row (then no buttons in that row)
 *   - custom_id 1..100 chars
 *   - label 1..80 chars
 */

import {z} from '~/Schema';

export const MAX_ACTION_ROWS = 5;
export const MAX_BUTTONS_PER_ROW = 5;

export const BUTTON_STYLES = [1, 2, 3, 4, 5] as const; // primary, secondary, success, danger, link

const ButtonEmoji = z
	.object({
		id: z.string().nullish(),
		name: z.string().nullish(),
		animated: z.boolean().nullish(),
	})
	.refine((val) => val.id != null || val.name != null, {
		message: 'Button emoji requires id or name',
	});

const ButtonComponent = z
	.object({
		type: z.literal(2),
		style: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
		label: z.string().min(1).max(80).nullish(),
		emoji: ButtonEmoji.nullish(),
		/*
		 * custom_id is required for styles 1-4 (interactive). For style 5
		 * (link) you set `url` instead. We validate this with a refine
		 * at the row level so the error message points at the offending
		 * button instead of a generic union failure.
		 */
		custom_id: z.string().min(1).max(100).nullish(),
		url: z.string().url().nullish(),
		disabled: z.boolean().optional(),
	})
	.refine(
		(val) => {
			if (val.style === 5) return val.url != null && val.custom_id == null;
			return val.custom_id != null && val.url == null;
		},
		{
			message: 'Button must have custom_id (interactive) or url (link), not both',
		},
	);

const SelectOption = z.object({
	label: z.string().min(1).max(100),
	value: z.string().min(1).max(100),
	description: z.string().max(100).nullish(),
	emoji: ButtonEmoji.nullish(),
	default: z.boolean().optional(),
});

const StringSelectComponent = z.object({
	type: z.literal(3),
	custom_id: z.string().min(1).max(100),
	options: z.array(SelectOption).min(1).max(25),
	placeholder: z.string().max(150).nullish(),
	min_values: z.number().int().min(0).max(25).optional(),
	max_values: z.number().int().min(1).max(25).optional(),
	disabled: z.boolean().optional(),
});

const RowChild = z.union([ButtonComponent, StringSelectComponent]);

export const MessageActionRowSchema = z
	.object({
		type: z.literal(1),
		components: z.array(RowChild).min(1).max(MAX_BUTTONS_PER_ROW),
	})
	.refine(
		(row) => {
			// A row containing a select menu may not contain anything else.
			const hasSelect = row.components.some((c) => c.type === 3);
			if (hasSelect && row.components.length !== 1) return false;
			return true;
		},
		{
			message: 'A row containing a select menu cannot contain other components',
		},
	);

export const MessageComponentsSchema = z.array(MessageActionRowSchema).max(MAX_ACTION_ROWS);

export type MessageComponentButton = z.infer<typeof ButtonComponent>;
export type MessageComponentSelect = z.infer<typeof StringSelectComponent>;
export type MessageComponentRowChild = z.infer<typeof RowChild>;
export type MessageActionRow = z.infer<typeof MessageActionRowSchema>;
export type MessageComponents = z.infer<typeof MessageComponentsSchema>;

/*
 * Persistence helpers. We store the components blob as a JSON string
 * in Cassandra (`text` column) so the schema is forwards-compatible.
 */

export function serializeComponents(components: MessageComponents | null | undefined): string | null {
	if (!components || components.length === 0) return null;
	try {
		return JSON.stringify(components);
	} catch {
		return null;
	}
}

export function parseComponents(raw: string | null | undefined): MessageComponents | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		const result = MessageComponentsSchema.safeParse(parsed);
		if (result.success) return result.data;
		return null;
	} catch {
		return null;
	}
}

/*
 * Find a component by custom_id within a components tree. Used by the
 * interaction click endpoint to validate that the custom_id the client
 * sent actually exists on the message it claims to be clicking from.
 */
export function findComponentByCustomId(
	components: MessageComponents | null | undefined,
	customId: string,
): MessageComponentRowChild | null {
	if (!components) return null;
	for (const row of components) {
		for (const child of row.components) {
			if (child.type === 2) {
				if (child.custom_id === customId) return child;
			} else if (child.type === 3) {
				if (child.custom_id === customId) return child;
			}
		}
	}
	return null;
}
