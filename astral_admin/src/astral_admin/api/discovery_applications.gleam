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

import astral_admin/api/common.{
  type ApiError, Forbidden, NetworkError, NotFound, ServerError, Unauthorized,
  admin_post_simple,
}
import astral_admin/web.{type Context, type Session}
import gleam/dynamic/decode
import gleam/http
import gleam/http/request
import gleam/httpc
import gleam/json
import gleam/option

pub type DiscoveryApplication {
  DiscoveryApplication(
    guild_id: String,
    status: String,
    submitted_by: String,
    submitted_at: String,
    reviewed_by: option.Option(String),
    reviewed_at: option.Option(String),
    review_note: option.Option(String),
    category: option.Option(String),
    description: option.Option(String),
    tags: List(String),
  )
}

pub type DiscoveryApplicationsResponse {
  DiscoveryApplicationsResponse(applications: List(DiscoveryApplication))
}

fn application_decoder() {
  use guild_id <- decode.field("guild_id", decode.string)
  use status <- decode.field("status", decode.string)
  use submitted_by <- decode.field("submitted_by", decode.string)
  use submitted_at <- decode.field("submitted_at", decode.string)
  use reviewed_by <- decode.optional_field(
    "reviewed_by",
    option.None,
    decode.optional(decode.string),
  )
  use reviewed_at <- decode.optional_field(
    "reviewed_at",
    option.None,
    decode.optional(decode.string),
  )
  use review_note <- decode.optional_field(
    "review_note",
    option.None,
    decode.optional(decode.string),
  )
  use category <- decode.optional_field(
    "category",
    option.None,
    decode.optional(decode.string),
  )
  use description <- decode.optional_field(
    "description",
    option.None,
    decode.optional(decode.string),
  )
  use tags <- decode.optional_field("tags", [], decode.list(decode.string))
  decode.success(DiscoveryApplication(
    guild_id: guild_id,
    status: status,
    submitted_by: submitted_by,
    submitted_at: submitted_at,
    reviewed_by: reviewed_by,
    reviewed_at: reviewed_at,
    review_note: review_note,
    category: category,
    description: description,
    tags: tags,
  ))
}

pub fn list_applications(
  ctx: Context,
  session: Session,
  status: option.Option(String),
) -> Result(DiscoveryApplicationsResponse, ApiError) {
  let base = ctx.api_endpoint <> "/admin/guilds/discovery/applications"
  let url = case status {
    option.Some(s) -> base <> "?status=" <> s
    option.None -> base
  }

  let assert Ok(req) = request.to(url)
  let req =
    req
    |> request.set_method(http.Get)
    |> request.set_header("authorization", "Bearer " <> session.access_token)

  case httpc.send(req) {
    Ok(resp) if resp.status == 200 -> {
      let decoder = {
        use applications <- decode.field(
          "applications",
          decode.list(application_decoder()),
        )
        decode.success(DiscoveryApplicationsResponse(applications: applications))
      }
      case json.parse(resp.body, decoder) {
        Ok(response) -> Ok(response)
        Error(_) -> Error(ServerError)
      }
    }
    Ok(resp) if resp.status == 401 -> Error(Unauthorized)
    Ok(resp) if resp.status == 403 -> {
      let message_decoder = {
        use message <- decode.field("message", decode.string)
        decode.success(message)
      }
      let message = case json.parse(resp.body, message_decoder) {
        Ok(msg) -> msg
        Error(_) -> "Access denied"
      }
      Error(Forbidden(message))
    }
    Ok(resp) if resp.status == 404 -> Error(NotFound)
    Ok(_resp) -> Error(ServerError)
    Error(_) -> Error(NetworkError)
  }
}

pub fn approve_application(
  ctx: Context,
  session: Session,
  guild_id: String,
  review_note: option.Option(String),
) -> Result(Nil, ApiError) {
  let note_field = case review_note {
    option.Some(note) -> [#("review_note", json.string(note))]
    option.None -> []
  }
  admin_post_simple(
    ctx,
    session,
    "/admin/guilds/discovery/applications/approve",
    [#("guild_id", json.string(guild_id)), ..note_field],
  )
}

pub fn reject_application(
  ctx: Context,
  session: Session,
  guild_id: String,
  review_note: option.Option(String),
) -> Result(Nil, ApiError) {
  let note_field = case review_note {
    option.Some(note) -> [#("review_note", json.string(note))]
    option.None -> []
  }
  admin_post_simple(
    ctx,
    session,
    "/admin/guilds/discovery/applications/reject",
    [#("guild_id", json.string(guild_id)), ..note_field],
  )
}
