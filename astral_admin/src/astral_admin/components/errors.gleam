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

import astral_admin/api/common
import astral_admin/web.{type Context, href}
import gleam/option
import lustre/attribute as a
import lustre/element
import lustre/element/html as h

pub fn error_view(error: common.ApiError) {
  h.div(
    [a.class("bg-red-50 border border-red-200/60 rounded-xl p-6 text-center")],
    [
      h.p([a.class("text-red-700 text-sm font-medium mb-2")], [
        element.text("Error"),
      ]),
      h.p([a.class("text-red-600 text-sm")], [
        element.text(case error {
          common.Unauthorized -> "Unauthorized"
          common.Forbidden(msg) -> "Forbidden - " <> msg
          common.NotFound -> "Not found"
          common.ServerError -> "Service temporarily unavailable"
          common.NetworkError -> "Connection issue"
        }),
      ]),
    ],
  )
}

pub fn api_error_view(
  ctx: Context,
  err: common.ApiError,
  back_url: option.Option(String),
  back_label: option.Option(String),
) {
  let #(title, message) = case err {
    common.Unauthorized -> #(
      "Authentication Required",
      "Your session has expired. Please log in again.",
    )
    common.Forbidden(msg) -> #("Permission Denied", msg)
    common.NotFound -> #("Not Found", "The requested resource was not found.")
    common.ServerError -> #(
      "Service Temporarily Unavailable",
      "The backend responded with an error. Please retry in a moment.",
    )
    common.NetworkError -> #(
      "Connection Issue",
      "Could not reach the backend API. Check connectivity and retry.",
    )
  }

  h.div([a.class("max-w-4xl mx-auto")], [
    h.div([a.class("bg-red-50 border border-red-200/60 rounded-xl p-8")], [
      h.div([a.class("flex items-start gap-4")], [
        h.div(
          [
            a.class(
              "flex-shrink-0 w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center",
            ),
          ],
          [
            h.span([a.class("text-red-500 text-base font-semibold")], [
              element.text("!"),
            ]),
          ],
        ),
        h.div([a.class("flex-1")], [
          h.h2([a.class("text-base font-semibold text-red-900 mb-2")], [
            element.text(title),
          ]),
          h.p([a.class("text-red-600 text-sm mb-6")], [element.text(message)]),
          case back_url {
            option.Some(url) ->
              h.a(
                [
                  href(ctx, url),
                  a.class(
                    "inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors shadow-sm",
                  ),
                ],
                [
                  h.span([a.class("text-lg")], [element.text("←")]),
                  element.text(option.unwrap(back_label, "Go Back")),
                ],
              )
            option.None -> element.none()
          },
        ]),
      ]),
    ]),
  ])
}
