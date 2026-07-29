//// Copyright (C) 2026 Astral Contributors
////
//// This file is part of Astral.
////
//// Astral is free software: you can redistribute it and/or modify
//// it under the terms of the GNU Affero General Public License as published by
//// the Free Software Foundation, either version 3 of the License, or
//// (at your option) any later version.
////
//// Astral is distributed in the hope that it will be useful,
//// but WITHOUT ANY WARRANTY; without even the implied warranty of
//// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
//// GNU Affero General Public License for more details.
////
//// You should have received a copy of the GNU Affero General Public License
//// along with Astral. If not, see <https://www.gnu.org/licenses/>.

import astral_admin/web.{type Context, href}
import gleam/int
import lustre/attribute as a
import lustre/element
import lustre/element/html as h

pub fn pagination(
  ctx: Context,
  total: Int,
  limit: Int,
  current_page: Int,
  build_url_fn: fn(Int) -> String,
) -> element.Element(a) {
  let total_pages = { total + limit - 1 } / limit
  let has_previous = current_page > 0
  let has_next = current_page < total_pages - 1

  h.div([a.class("mt-6 flex justify-center gap-3 items-center")], [
    case has_previous {
      True -> {
        let prev_url = build_url_fn(current_page - 1)

        h.a(
          [
            href(ctx, prev_url),
            a.class(
              "px-4 py-2.5 bg-zinc-950 text-zinc-300 border border-zinc-700 rounded-lg text-sm font-medium hover:bg-zinc-900 hover:border-zinc-600 hover:text-zinc-100 transition-colors",
            ),
          ],
          [element.text("< Previous")],
        )
      }
      False ->
        h.div(
          [
            a.class(
              "px-4 py-2.5 bg-zinc-950/70 text-zinc-600 border border-zinc-800 rounded-lg text-sm font-medium cursor-not-allowed",
            ),
          ],
          [element.text("< Previous")],
        )
    },
    h.span([a.class("text-sm text-zinc-500 tabular-nums")], [
      element.text(
        "Page "
        <> int.to_string(current_page + 1)
        <> " of "
        <> int.to_string(total_pages),
      ),
    ]),
    case has_next {
      True -> {
        let next_url = build_url_fn(current_page + 1)

        h.a(
          [
            href(ctx, next_url),
            a.class(
              "px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors no-underline shadow-sm",
            ),
          ],
          [element.text("Next >")],
        )
      }
      False ->
        h.div(
          [
            a.class(
              "px-4 py-2.5 bg-zinc-950/70 text-zinc-600 border border-zinc-800 rounded-lg text-sm font-medium cursor-not-allowed",
            ),
          ],
          [element.text("Next >")],
        )
    },
  ])
}
