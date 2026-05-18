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

export function AstralDocsBrand() {
	return (
		<span className="astral-docs-brand" aria-label="Astral API Docs">
			<span className="astral-docs-brand__logo" aria-hidden>
				<span className="astral-docs-brand__logo-glow" />
				<span className="astral-docs-brand__logo-letter">A</span>
			</span>
			<span className="astral-docs-brand__copy">
				<span className="astral-docs-brand__name">Astral</span>
				<span className="astral-docs-brand__label">API Docs</span>
			</span>
		</span>
	);
}
