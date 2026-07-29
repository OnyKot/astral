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

import astral_admin/web.{type Context}
import gleam/list
import gleam/option.{type Option}
import gleam/string
import gleam/uri
import lustre/attribute as a
import lustre/element
import lustre/element/html as h
import wisp.{type Request, type Response}

pub type Flash {
  Flash(message: String, flash_type: FlashType)
}

pub type FlashType {
  Success
  Error
  Info
  Warning
}

pub fn flash_type_to_string(flash_type: FlashType) -> String {
  case flash_type {
    Success -> "success"
    Error -> "error"
    Info -> "info"
    Warning -> "warning"
  }
}

pub fn parse_flash_type(type_str: String) -> FlashType {
  case type_str {
    "success" -> Success
    "error" -> Error
    "warning" -> Warning
    "info" | _ -> Info
  }
}

fn flash_classes(flash_type: FlashType) -> String {
  case flash_type {
    Success ->
      "bg-emerald-50 border border-emerald-200/60 rounded-xl px-4 py-3 text-emerald-800 text-sm"
    Error ->
      "bg-red-50 border border-red-200/60 rounded-xl px-4 py-3 text-red-700 text-sm"
    Warning ->
      "bg-amber-50 border border-amber-200/60 rounded-xl px-4 py-3 text-amber-800 text-sm"
    Info ->
      "bg-sky-50 border border-sky-200/60 rounded-xl px-4 py-3 text-sky-800 text-sm"
  }
}

pub fn flash_view(
  message: Option(String),
  flash_type: Option(FlashType),
) -> element.Element(t) {
  case message {
    option.Some(msg) -> {
      let type_ = option.unwrap(flash_type, Info)
      h.div([a.class(flash_classes(type_))], [element.text(msg)])
    }
    option.None -> element.none()
  }
}

pub fn redirect_url(
  path: String,
  message: String,
  flash_type: FlashType,
) -> String {
  let encoded_message = uri.percent_encode(message)
  let type_param = flash_type_to_string(flash_type)

  case string.contains(path, "?") {
    True -> path <> "&flash=" <> encoded_message <> "&flash_type=" <> type_param
    False ->
      path <> "?flash=" <> encoded_message <> "&flash_type=" <> type_param
  }
}

pub fn redirect_with_success(
  ctx: Context,
  path: String,
  message: String,
) -> Response {
  wisp.redirect(web.prepend_base_path(ctx, redirect_url(path, message, Success)))
}

pub fn redirect_with_error(
  ctx: Context,
  path: String,
  message: String,
) -> Response {
  wisp.redirect(web.prepend_base_path(ctx, redirect_url(path, message, Error)))
}

pub fn redirect_with_info(
  ctx: Context,
  path: String,
  message: String,
) -> Response {
  wisp.redirect(web.prepend_base_path(ctx, redirect_url(path, message, Info)))
}

pub fn redirect_with_warning(
  ctx: Context,
  path: String,
  message: String,
) -> Response {
  wisp.redirect(web.prepend_base_path(ctx, redirect_url(path, message, Warning)))
}

pub fn from_request(req: Request) -> Option(Flash) {
  let query = wisp.get_query(req)

  let flash_msg = list.key_find(query, "flash") |> option.from_result
  let flash_type_str = list.key_find(query, "flash_type") |> option.from_result

  case flash_msg {
    option.Some(msg) -> {
      let type_ = case flash_type_str {
        option.Some(type_str) -> parse_flash_type(type_str)
        option.None -> Info
      }
      option.Some(Flash(msg, type_))
    }
    option.None -> option.None
  }
}

pub fn view(flash: Option(Flash)) -> element.Element(t) {
  case flash {
    option.Some(Flash(msg, type_)) ->
      h.div([a.class(flash_classes(type_))], [element.text(msg)])
    option.None -> element.none()
  }
}
