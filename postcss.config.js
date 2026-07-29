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

import autoprefixer from 'autoprefixer';
import postcssDiscardComments from 'postcss-discard-comments';
import postcssPresetEnv from 'postcss-preset-env';

export default {
	plugins: [
		postcssDiscardComments({
			removeAll: true,
		}),
		postcssPresetEnv({
			stage: 3,
			features: {
				'nesting-rules': true,
				/*
				 * Disabled deliberately. This feature emits a duplicate
				 * declaration next to every `var()` usage with the fallback
				 * value substituted, e.g.
				 *
				 *   right: calc(16px + 0.125rem);                        <- generated
				 *   right: calc(var(--chat-horizontal-padding) + 0.125rem);
				 *
				 * Two costs, no benefit:
				 *
				 * 1. It duplicates a large share of a ~2 MB stylesheet for
				 *    browsers that cannot run this app anyway — CSS custom
				 *    properties ship since Chrome 49 / Safari 9.1, while the app
				 *    needs React 19, ES modules and WASM.
				 * 2. Substituting a numeric fallback can produce a fully
				 *    evaluable math expression, e.g.
				 *    `opacity: clamp(0, calc(0 * 1.4), 1)` from
				 *    src/styles/Message.module.css. lightningcss panics on that
				 *    ("unreachable code" in values/percentage.rs), which used to
				 *    make CSS minification impossible for the whole bundle.
				 *
				 * See docs/PERFORMANCE_AUDIT_2026-07-26.md.
				 */
				'custom-properties': false,
				'custom-media-queries': true,
			},
			browsers: 'last 10 years, > 0.5%, not dead',
		}),
		autoprefixer({
			flexbox: 'no-2009',
			grid: 'no-autoplace',
		}),
	],
};
