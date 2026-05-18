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
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html

pub fn render(icon: String, color: String, label: String) -> Element(a) {
  let bg_class = case color {
    "blue" -> "bg-gradient-to-br from-blue-400 to-blue-600"
    "purple" -> "bg-gradient-to-br from-purple-400 to-purple-600"
    "green" -> "bg-gradient-to-br from-emerald-400 to-emerald-600"
    "orange" -> "bg-gradient-to-br from-orange-400 to-orange-600"
    "red" -> "bg-gradient-to-br from-rose-400 to-rose-600"
    _ -> "bg-gradient-to-br from-gray-400 to-gray-600"
  }

  let icon_element = case icon {
    "game-controller" -> icons.game_controller
    "video-camera" -> icons.video_camera
    "graduation-cap" -> icons.graduation_cap
    "users-three" -> icons.users_three
    "code" -> icons.code_icon
    _ -> fn(_) { html.div([], []) }
  }

  html.div(
    [
      attribute.class(
        "group relative flex flex-col items-center justify-between rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-4 sm:p-5 md:p-6 shadow-[0_18px_40px_rgba(0,0,0,0.35)] transition-transform duration-300 hover:-translate-y-1",
      ),
    ],
    [
      html.div(
        [
          attribute.class(
            "flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg "
            <> bg_class,
          ),
        ],
        [
          icon_element([
            attribute.class("h-8 w-8 text-white flex-shrink-0"),
          ]),
        ],
      ),
      html.p(
        [
          attribute.class(
            "subtitle mt-4 text-sm sm:text-base text-white font-semibold text-center",
          ),
        ],
        [html.text(label)],
      ),
    ],
  )
}
