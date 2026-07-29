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

import astral_admin/components/layout
import astral_admin/components/ui
import astral_admin/web.{type Context, href}
import gleam/option.{type Option, None, Some}
import lustre/attribute as a
import lustre/element
import lustre/element/html as h
import wisp.{type Response}

pub fn view(ctx: Context, error: Option(String)) -> Response {
  let html =
    h.html([a.attribute("lang", "en")], [
      layout.build_head("Admin Login", ctx),
      h.body(
        [
          a.class(
            "min-h-screen bg-zinc-50 flex items-center justify-center p-4",
          ),
        ],
        [
          h.div([a.class("w-full max-w-sm")], [
            h.div(
              [
                a.class(
                  "bg-white border border-zinc-200 rounded-xl p-8 space-y-6 shadow-sm",
                ),
              ],
              [
                h.div([a.class("flex flex-col items-center gap-3 mb-2")], [
                  h.div(
                    [
                      a.class(
                        "w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center text-white text-sm font-bold",
                      ),
                    ],
                    [
                      element.text("A"),
                    ],
                  ),
                  h.h1(
                    [
                      a.class(
                        "text-lg font-semibold text-zinc-900 tracking-tight",
                      ),
                    ],
                    [
                      element.text("Admin Login"),
                    ],
                  ),
                ]),
                case error {
                  Some(msg) ->
                    h.div(
                      [
                        a.class(
                          "bg-red-50 border border-red-200/60 text-red-600 px-3 py-2 rounded-lg text-sm",
                        ),
                      ],
                      [element.text(msg)],
                    )
                  None -> element.none()
                },
                h.a([href(ctx, "/auth/start")], [
                  ui.button(
                    "Sign in with Astral",
                    "button",
                    ui.Primary,
                    ui.Medium,
                    ui.Full,
                    [],
                  ),
                ]),
              ],
            ),
          ]),
        ],
      ),
      element.none(),
    ])

  wisp.html_response(element.to_document_string(html), 200)
}
