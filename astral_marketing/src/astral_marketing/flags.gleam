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

import astral_marketing/locale.{type Locale}
import astral_marketing/web.{type Context}
import gleam/list
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html

pub fn flag_svg(
  locale: Locale,
  ctx: Context,
  attributes: List(attribute.Attribute(a)),
) -> Element(a) {
  let flag_code = locale.get_flag_code(locale)

  html.img(
    [
      // Use public twemoji CDN for reliable flags
      attribute.src(
        "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/"
        <> flag_code
        <> ".svg",
      ),
      attribute.alt("Flag"),
      attribute.attribute("loading", "lazy"),
    ]
    |> list.append(attributes),
  )
}
