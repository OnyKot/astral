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
import gleam/bit_array
import gleam/crypto
import gleam/uri

pub fn authorize_url(ctx: Context, state: String) -> String {
  let authorize_path =
    "/oauth2/authorize?response_type=code&client_id="
    <> uri.percent_encode(ctx.oauth_client_id)
    <> "&redirect_uri="
    <> uri.percent_encode(ctx.oauth_redirect_uri)
    <> "&scope="
    <> uri.percent_encode("identify email")
    <> "&state="
    <> uri.percent_encode(state)

  ctx.web_app_endpoint
  <> "/login?redirect_to="
  <> uri.percent_encode(authorize_path)
}

pub fn base64_encode_string(value: String) -> String {
  value
  |> bit_array.from_string
  |> bit_array.base64_encode(True)
}

pub fn generate_state() -> String {
  crypto.strong_random_bytes(32)
  |> bit_array.base64_url_encode(False)
}
