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

import astral_admin/web
import gleam/dynamic/decode
import gleam/http
import gleam/http/request
import gleam/httpc
import gleam/json
import gleam/option

pub type UserLookupResult {
  UserLookupResult(
    id: String,
    username: String,
    discriminator: Int,
    global_name: option.Option(String),
    bot: Bool,
    system: Bool,
    flags: String,
    avatar: option.Option(String),
    banner: option.Option(String),
    bio: option.Option(String),
    pronouns: option.Option(String),
    accent_color: option.Option(Int),
    email: option.Option(String),
    email_verified: Bool,
    email_bounced: Bool,
    phone: option.Option(String),
    date_of_birth: option.Option(String),
    locale: option.Option(String),
    premium_type: option.Option(Int),
    premium_since: option.Option(String),
    premium_until: option.Option(String),
    suspicious_activity_flags: Int,
    temp_banned_until: option.Option(String),
    pending_deletion_at: option.Option(String),
    pending_bulk_message_deletion_at: option.Option(String),
    deletion_reason_code: option.Option(Int),
    deletion_public_reason: option.Option(String),
    acls: List(String),
    has_totp: Bool,
    authenticator_types: List(Int),
    last_active_at: option.Option(String),
    last_active_ip: option.Option(String),
    last_active_ip_reverse: option.Option(String),
    last_active_location: option.Option(String),
  )
}

pub type ApiError {
  Unauthorized
  Forbidden(message: String)
  NotFound
  ServerError
  NetworkError
}

pub fn admin_post_simple(
  ctx: web.Context,
  session: web.Session,
  path: String,
  fields: List(#(String, json.Json)),
) -> Result(Nil, ApiError) {
  admin_post_with_audit(ctx, session, path, fields, option.None)
}

pub fn admin_post_with_audit(
  ctx: web.Context,
  session: web.Session,
  path: String,
  fields: List(#(String, json.Json)),
  audit_log_reason: option.Option(String),
) -> Result(Nil, ApiError) {
  let url = ctx.api_endpoint <> path
  let body = json.object(fields) |> json.to_string

  let assert Ok(req) = request.to(url)
  let req =
    req
    |> request.set_method(http.Post)
    |> request.set_header("authorization", "Bearer " <> session.access_token)
    |> request.set_header("content-type", "application/json")
    |> request.set_body(body)

  let req = case audit_log_reason {
    option.Some(reason) -> request.set_header(req, "x-audit-log-reason", reason)
    option.None -> req
  }

  case httpc.send(req) {
    Ok(resp) if resp.status == 200 -> Ok(Nil)
    Ok(resp) if resp.status == 204 -> Ok(Nil)
    Ok(resp) if resp.status == 401 -> Error(Unauthorized)
    Ok(resp) if resp.status == 403 -> {
      let message_decoder = {
        use message <- decode.field("message", decode.string)
        decode.success(message)
      }
      let message = case json.parse(resp.body, message_decoder) {
        Ok(msg) -> msg
        Error(_) ->
          "Missing required permissions. Contact an administrator to request access."
      }
      Error(Forbidden(message))
    }
    Ok(resp) if resp.status == 404 -> Error(NotFound)
    Ok(_resp) -> Error(ServerError)
    Error(_) -> Error(NetworkError)
  }
}

pub fn user_lookup_decoder() {
  use id <- decode.field("id", decode.string)
  use username <- decode.field("username", decode.string)
  use discriminator <- decode.optional_field("discriminator", 0, decode.int)
  use global_name <- decode.optional_field(
    "global_name",
    option.None,
    decode.optional(decode.string),
  )
  use bot <- decode.optional_field("bot", False, decode.bool)
  use system <- decode.optional_field("system", False, decode.bool)
  use flags <- decode.optional_field("flags", "0", decode.string)
  use avatar <- decode.optional_field(
    "avatar",
    option.None,
    decode.optional(decode.string),
  )
  use banner <- decode.optional_field(
    "banner",
    option.None,
    decode.optional(decode.string),
  )
  use bio <- decode.optional_field(
    "bio",
    option.None,
    decode.optional(decode.string),
  )
  use pronouns <- decode.optional_field(
    "pronouns",
    option.None,
    decode.optional(decode.string),
  )
  use accent_color <- decode.optional_field(
    "accent_color",
    option.None,
    decode.optional(decode.int),
  )
  use email <- decode.optional_field(
    "email",
    option.None,
    decode.optional(decode.string),
  )
  use email_verified <- decode.optional_field(
    "email_verified",
    False,
    decode.bool,
  )
  use email_bounced <- decode.optional_field(
    "email_bounced",
    False,
    decode.bool,
  )
  use phone <- decode.optional_field(
    "phone",
    option.None,
    decode.optional(decode.string),
  )
  use date_of_birth <- decode.optional_field(
    "date_of_birth",
    option.None,
    decode.optional(decode.string),
  )
  use locale <- decode.optional_field(
    "locale",
    option.None,
    decode.optional(decode.string),
  )
  use premium_type <- decode.optional_field(
    "premium_type",
    option.None,
    decode.optional(decode.int),
  )
  use premium_since <- decode.optional_field(
    "premium_since",
    option.None,
    decode.optional(decode.string),
  )
  use premium_until <- decode.optional_field(
    "premium_until",
    option.None,
    decode.optional(decode.string),
  )
  use suspicious_activity_flags <- decode.optional_field(
    "suspicious_activity_flags",
    0,
    decode.int,
  )
  use temp_banned_until <- decode.optional_field(
    "temp_banned_until",
    option.None,
    decode.optional(decode.string),
  )
  use pending_deletion_at <- decode.optional_field(
    "pending_deletion_at",
    option.None,
    decode.optional(decode.string),
  )
  use pending_bulk_message_deletion_at <- decode.optional_field(
    "pending_bulk_message_deletion_at",
    option.None,
    decode.optional(decode.string),
  )
  use deletion_reason_code <- decode.optional_field(
    "deletion_reason_code",
    option.None,
    decode.optional(decode.int),
  )
  use deletion_public_reason <- decode.optional_field(
    "deletion_public_reason",
    option.None,
    decode.optional(decode.string),
  )
  use acls <- decode.optional_field("acls", [], decode.list(decode.string))
  use has_totp <- decode.optional_field("has_totp", False, decode.bool)
  use authenticator_types <- decode.optional_field(
    "authenticator_types",
    [],
    decode.list(decode.int),
  )
  use last_active_at <- decode.optional_field(
    "last_active_at",
    option.None,
    decode.optional(decode.string),
  )
  use last_active_ip <- decode.optional_field(
    "last_active_ip",
    option.None,
    decode.optional(decode.string),
  )
  use last_active_ip_reverse <- decode.optional_field(
    "last_active_ip_reverse",
    option.None,
    decode.optional(decode.string),
  )
  use last_active_location <- decode.optional_field(
    "last_active_location",
    option.None,
    decode.optional(decode.string),
  )
  decode.success(UserLookupResult(
    id: id,
    username: username,
    discriminator: discriminator,
    global_name: global_name,
    bot: bot,
    system: system,
    flags: flags,
    avatar: avatar,
    banner: banner,
    bio: bio,
    pronouns: pronouns,
    accent_color: accent_color,
    email: email,
    email_verified: email_verified,
    email_bounced: email_bounced,
    phone: phone,
    date_of_birth: date_of_birth,
    locale: locale,
    premium_type: premium_type,
    premium_since: premium_since,
    premium_until: premium_until,
    suspicious_activity_flags: suspicious_activity_flags,
    temp_banned_until: temp_banned_until,
    pending_deletion_at: pending_deletion_at,
    pending_bulk_message_deletion_at: pending_bulk_message_deletion_at,
    deletion_reason_code: deletion_reason_code,
    deletion_public_reason: deletion_public_reason,
    acls: acls,
    has_totp: has_totp,
    authenticator_types: authenticator_types,
    last_active_at: last_active_at,
    last_active_ip: last_active_ip,
    last_active_ip_reverse: last_active_ip_reverse,
    last_active_location: last_active_location,
  ))
}
