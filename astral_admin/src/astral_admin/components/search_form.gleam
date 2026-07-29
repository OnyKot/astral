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

import astral_admin/components/ui
import astral_admin/web.{type Context, href}
import gleam/list
import gleam/option.{type Option}
import lustre/attribute as a
import lustre/element
import lustre/element/html as h

pub fn search_form(
  ctx: Context,
  query: Option(String),
  placeholder: String,
  help_text: Option(String),
  clear_url: String,
  additional_filters: List(element.Element(a)),
) -> element.Element(a) {
  ui.card(ui.PaddingSmall, [
    h.form([a.method("get"), a.class("flex flex-col gap-4")], [
      case list.is_empty(additional_filters) {
        True ->
          h.div([a.class("flex gap-2")], [
            h.input([
              a.type_("text"),
              a.name("q"),
              a.value(option.unwrap(query, "")),
              a.placeholder(placeholder),
              a.class(
                "flex-1 min-w-0 px-3.5 py-2.5 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 placeholder:text-zinc-500",
              ),
              a.attribute("autocomplete", "off"),
            ]),
            ui.button_primary("Search", "submit", []),
            h.a(
              [
                href(ctx, clear_url),
                a.class(
                  "px-4 py-2.5 bg-zinc-950 text-zinc-300 border border-zinc-700 rounded-lg text-sm font-medium hover:bg-zinc-900 hover:border-zinc-600 hover:text-zinc-100 transition-colors",
                ),
              ],
              [element.text("Clear")],
            ),
          ])
        False ->
          h.div([a.class("flex flex-col gap-4")], [
            h.div([a.class("flex gap-2")], [
              h.input([
                a.type_("text"),
                a.name("q"),
                a.value(option.unwrap(query, "")),
                a.placeholder(placeholder),
                a.class(
                  "flex-1 min-w-0 px-3.5 py-2.5 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 placeholder:text-zinc-500",
                ),
                a.attribute("autocomplete", "off"),
              ]),
            ]),
            h.div(
              [a.class("grid grid-cols-1 md:grid-cols-4 gap-4")],
              additional_filters,
            ),
            h.div([a.class("flex gap-2")], [
              ui.button_primary("Search", "submit", []),
              h.a(
                [
                  href(ctx, clear_url),
                  a.class(
                    "px-4 py-2.5 bg-zinc-950 text-zinc-300 border border-zinc-700 rounded-lg text-sm font-medium hover:bg-zinc-900 hover:border-zinc-600 hover:text-zinc-100 transition-colors",
                  ),
                ],
                [element.text("Clear")],
              ),
            ]),
          ])
      },
      case help_text {
        option.Some(text) ->
          h.p([a.class("text-xs text-zinc-400")], [element.text(text)])
        option.None -> element.none()
      },
    ]),
  ])
}
