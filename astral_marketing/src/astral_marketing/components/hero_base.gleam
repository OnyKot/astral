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

import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html

pub type HeroConfig(a) {
  HeroConfig(
    icon: Element(a),
    title: String,
    description: String,
    extra_content: Element(a),
    custom_padding: String,
  )
}

pub fn default_padding() -> String {
  "marketing-shell marketing-hero-stage text-white"
}

pub fn render(config: HeroConfig(a)) -> Element(a) {
  html.section([attribute.class(config.custom_padding)], [
    html.div([attribute.class("mx-auto w-full max-w-6xl")], [
      html.div(
        [
          attribute.class(
            "motion-reveal relative text-center",
          ),
        ],
        [
          html.div([attribute.class("mb-7 flex justify-center")], [
            html.div(
              [
                attribute.class(
                  "hero-icon-shell inline-flex h-16 w-16 items-center justify-center md:h-20 md:w-20",
                ),
              ],
              [config.icon],
            ),
          ]),
          html.h1(
            [
              attribute.class("marketing-title hero-title mb-4 md:mb-5"),
            ],
            [html.text(config.title)],
          ),
          html.p(
            [
              attribute.class("marketing-subtitle mx-auto max-w-3xl"),
            ],
            [html.text(config.description)],
          ),
          html.div([attribute.class("mt-8")], [config.extra_content]),
        ],
      ),
    ]),
  ])
}
