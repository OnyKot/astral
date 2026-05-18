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

import astral_marketing/icons
import astral_marketing/web.{type Context}
import gleam/list
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html

pub fn render(
  _ctx: Context,
  icon: String,
  title: String,
  description: String,
  features: List(String),
  theme: String,
) -> Element(a) {
  let card_bg = case theme {
    "light" -> "bg-gradient-to-b from-white/8 to-white/4"
    "dark" -> "bg-gradient-to-b from-white/10 to-white/5"
    _ -> "bg-gradient-to-b from-white/10 to-white/5"
  }

  let text_color = case theme {
    "light" -> "text-zinc-100"
    "dark" -> "text-zinc-100"
    _ -> "text-zinc-100"
  }

  let description_color = case theme {
    "light" -> "text-zinc-300"
    "dark" -> "text-zinc-300"
    _ -> "text-zinc-300"
  }

  html.div(
    [
      attribute.class(
        "group relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 "
        <> card_bg
        <> " p-8 md:p-10 shadow-[0_24px_60px_rgba(0,0,0,0.45)] transition-transform duration-300 hover:-translate-y-1",
      ),
    ],
    [
      html.div(
        [
          attribute.class(
            "pointer-events-none absolute -top-16 right-0 h-32 w-32 rounded-full bg-indigo-500/20 blur-3xl opacity-70",
          ),
        ],
        [],
      ),
      html.div([attribute.class("mb-6")], [
        html.div(
          [
            attribute.class(
              "inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-2xl border border-white/15 bg-gradient-to-br from-white/20 to-white/5 shadow-lg mb-5",
            ),
          ],
          [
            case icon {
              "chats" ->
                icons.chats([
                  attribute.class("h-8 w-8 md:h-10 md:w-10 text-indigo-300"),
                ])
              "microphone" ->
                icons.microphone([
                  attribute.class("h-8 w-8 md:h-10 md:w-10 text-indigo-300"),
                ])
              "palette" ->
                icons.palette([
                  attribute.class("h-8 w-8 md:h-10 md:w-10 text-indigo-300"),
                ])
              "magnifying-glass" ->
                icons.magnifying_glass([
                  attribute.class("h-8 w-8 md:h-10 md:w-10 text-indigo-300"),
                ])
              "devices" ->
                icons.devices([
                  attribute.class("h-8 w-8 md:h-10 md:w-10 text-indigo-300"),
                ])
              "gear" ->
                icons.gear([
                  attribute.class("h-8 w-8 md:h-10 md:w-10 text-indigo-300"),
                ])
              "heart" ->
                icons.heart([
                  attribute.class("h-8 w-8 md:h-10 md:w-10 text-indigo-300"),
                ])
              "lightning" ->
                icons.lightning([
                  attribute.class("h-8 w-8 md:h-10 md:w-10 text-indigo-300"),
                ])
              "globe" ->
                icons.globe([
                  attribute.class("h-8 w-8 md:h-10 md:w-10 text-indigo-300"),
                ])
              "server" ->
                icons.globe([
                  attribute.class("h-8 w-8 md:h-10 md:w-10 text-indigo-300"),
                ])
              "shopping-cart" ->
                icons.shopping_cart([
                  attribute.class("h-8 w-8 md:h-10 md:w-10 text-indigo-300"),
                ])
              "newspaper" ->
                icons.newspaper([
                  attribute.class("h-8 w-8 md:h-10 md:w-10 text-indigo-300"),
                ])
              "brain" ->
                icons.brain([
                  attribute.class("h-8 w-8 md:h-10 md:w-10 text-indigo-300"),
                ])
              _ -> html.div([], [])
            },
          ],
        ),
        html.h3([attribute.class("title " <> text_color <> " mb-3")], [
          html.text(title),
        ]),
        html.p([attribute.class("body-lg " <> description_color)], [
          html.text(description),
        ]),
      ]),
      html.div([attribute.class("flex-1 mt-2")], [
        html.ul(
          [attribute.class("space-y-3")],
          features
            |> list.map(fn(feature) {
              html.li([attribute.class("flex items-start gap-3")], [
                html.span(
                  [
                    attribute.class(
                      "mt-[.7em] h-1.5 w-1.5 rounded-full bg-gradient-to-r from-indigo-400 to-cyan-300 shrink-0",
                    ),
                  ],
                  [],
                ),
                html.span([attribute.class("body-lg " <> text_color)], [
                  html.text(feature),
                ]),
              ])
            }),
        ),
      ]),
    ],
  )
}
