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
  type ApiError, NetworkError, NotFound, ServerError, Unauthorized,
}
import astral_admin/web.{type Context, type Session}
import gleam/dynamic/decode
import gleam/http
import gleam/http/request
import gleam/httpc
import gleam/json

pub type PlatformOverview {
  PlatformOverview(
    total_users: Int,
    total_guilds: Int,
    total_messages: Int,
    total_reports: Int,
    resolved_reports: Int,
    messages_with_files: Int,
    active_sessions: Int,
    active_guilds: Int,
  )
}

pub fn get_platform_overview(
  ctx: Context,
  session: Session,
) -> Result(PlatformOverview, ApiError) {
  let url = ctx.api_endpoint <> "/admin/metrics/platform-overview"

  let assert Ok(req) = request.to(url)
  let req =
    req
    |> request.set_method(http.Get)
    |> request.set_header("authorization", "Bearer " <> session.access_token)

  case httpc.send(req) {
    Ok(resp) if resp.status == 200 -> {
      let decoder = {
        use total_users <- decode.field("total_users", decode.int)
        use total_guilds <- decode.field("total_guilds", decode.int)
        use total_messages <- decode.field("total_messages", decode.int)
        use total_reports <- decode.field("total_reports", decode.int)
        use resolved_reports <- decode.field("resolved_reports", decode.int)
        use messages_with_files <- decode.field(
          "messages_with_files",
          decode.int,
        )
        use active_sessions <- decode.field("active_sessions", decode.int)
        use active_guilds <- decode.field("active_guilds", decode.int)
        decode.success(PlatformOverview(
          total_users: total_users,
          total_guilds: total_guilds,
          total_messages: total_messages,
          total_reports: total_reports,
          resolved_reports: resolved_reports,
          messages_with_files: messages_with_files,
          active_sessions: active_sessions,
          active_guilds: active_guilds,
        ))
      }

      case json.parse(resp.body, decoder) {
        Ok(result) -> Ok(result)
        Error(_) -> Error(ServerError)
      }
    }
    Ok(resp) if resp.status == 401 -> Error(Unauthorized)
    Ok(resp) if resp.status == 404 -> Error(NotFound)
    Ok(_resp) -> Error(ServerError)
    Error(_) -> Error(NetworkError)
  }
}
