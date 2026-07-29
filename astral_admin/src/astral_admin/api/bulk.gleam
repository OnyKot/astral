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
}
import astral_admin/web
import gleam/dynamic/decode
import gleam/http
import gleam/http/request
import gleam/httpc
import gleam/json
import gleam/list
import gleam/option

pub type BulkOperationError {
  BulkOperationError(id: String, error: String)
}

pub type BulkOperationResponse {
  BulkOperationResponse(
    successful: List(String),
    failed: List(BulkOperationError),
    successful_count: Int,
    failed_count: Int,
  )
}

pub fn bulk_update_user_flags(
  ctx: web.Context,
  session: web.Session,
  user_ids: List(String),
  add_flags: List(String),
  remove_flags: List(String),
  audit_log_reason: option.Option(String),
) -> Result(BulkOperationResponse, ApiError) {
  let url = ctx.api_endpoint <> "/admin/users/bulk-update-flags"
  let body =
    json.object([
      #("user_ids", json.array(user_ids, json.string)),
      #("add_flags", json.array(add_flags, json.string)),
      #("remove_flags", json.array(remove_flags, json.string)),
    ])
    |> json.to_string

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
    Ok(resp) if resp.status == 200 -> {
      let error_decoder = {
        use id <- decode.field("id", decode.string)
        use error <- decode.field("error", decode.string)
        decode.success(BulkOperationError(id: id, error: error))
      }

      let decoder = {
        use successful <- decode.field("successful", decode.list(decode.string))
        use failed <- decode.field("failed", decode.list(error_decoder))
        use successful_count <- decode.optional_field(
          "successful_count",
          list.length(successful),
          decode.int,
        )
        use failed_count <- decode.optional_field(
          "failed_count",
          list.length(failed),
          decode.int,
        )
        decode.success(BulkOperationResponse(
          successful: successful,
          failed: failed,
          successful_count: successful_count,
          failed_count: failed_count,
        ))
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

pub fn bulk_update_guild_features(
  ctx: web.Context,
  session: web.Session,
  guild_ids: List(String),
  add_features: List(String),
  remove_features: List(String),
  audit_log_reason: option.Option(String),
) -> Result(BulkOperationResponse, ApiError) {
  let url = ctx.api_endpoint <> "/admin/guilds/bulk-update-features"
  let body =
    json.object([
      #("guild_ids", json.array(guild_ids, json.string)),
      #("add_features", json.array(add_features, json.string)),
      #("remove_features", json.array(remove_features, json.string)),
    ])
    |> json.to_string

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
    Ok(resp) if resp.status == 200 -> {
      let error_decoder = {
        use id <- decode.field("id", decode.string)
        use error <- decode.field("error", decode.string)
        decode.success(BulkOperationError(id: id, error: error))
      }

      let decoder = {
        use successful <- decode.field("successful", decode.list(decode.string))
        use failed <- decode.field("failed", decode.list(error_decoder))
        use successful_count <- decode.optional_field(
          "successful_count",
          list.length(successful),
          decode.int,
        )
        use failed_count <- decode.optional_field(
          "failed_count",
          list.length(failed),
          decode.int,
        )
        decode.success(BulkOperationResponse(
          successful: successful,
          failed: failed,
          successful_count: successful_count,
          failed_count: failed_count,
        ))
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

pub fn bulk_add_guild_members(
  ctx: web.Context,
  session: web.Session,
  guild_id: String,
  user_ids: List(String),
  audit_log_reason: option.Option(String),
) -> Result(BulkOperationResponse, ApiError) {
  let url = ctx.api_endpoint <> "/admin/bulk/add-guild-members"
  let body =
    json.object([
      #("guild_id", json.string(guild_id)),
      #("user_ids", json.array(user_ids, json.string)),
    ])
    |> json.to_string

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
    Ok(resp) if resp.status == 200 -> {
      let error_decoder = {
        use id <- decode.field("id", decode.string)
        use error <- decode.field("error", decode.string)
        decode.success(BulkOperationError(id: id, error: error))
      }

      let decoder = {
        use successful <- decode.field("successful", decode.list(decode.string))
        use failed <- decode.field("failed", decode.list(error_decoder))
        use successful_count <- decode.optional_field(
          "successful_count",
          list.length(successful),
          decode.int,
        )
        use failed_count <- decode.optional_field(
          "failed_count",
          list.length(failed),
          decode.int,
        )
        decode.success(BulkOperationResponse(
          successful: successful,
          failed: failed,
          successful_count: successful_count,
          failed_count: failed_count,
        ))
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

pub fn bulk_schedule_user_deletion(
  ctx: web.Context,
  session: web.Session,
  user_ids: List(String),
  reason_code: Int,
  public_reason: option.Option(String),
  days_until_deletion: Int,
  audit_log_reason: option.Option(String),
) -> Result(BulkOperationResponse, ApiError) {
  let url = ctx.api_endpoint <> "/admin/bulk/schedule-user-deletion"
  let fields = [
    #("user_ids", json.array(user_ids, json.string)),
    #("reason_code", json.int(reason_code)),
    #("days_until_deletion", json.int(days_until_deletion)),
  ]
  let fields = case public_reason {
    option.Some(r) -> [#("public_reason", json.string(r)), ..fields]
    option.None -> fields
  }
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
    Ok(resp) if resp.status == 200 -> {
      let error_decoder = {
        use id <- decode.field("id", decode.string)
        use error <- decode.field("error", decode.string)
        decode.success(BulkOperationError(id: id, error: error))
      }

      let decoder = {
        use successful <- decode.field("successful", decode.list(decode.string))
        use failed <- decode.field("failed", decode.list(error_decoder))
        use successful_count <- decode.optional_field(
          "successful_count",
          list.length(successful),
          decode.int,
        )
        use failed_count <- decode.optional_field(
          "failed_count",
          list.length(failed),
          decode.int,
        )
        decode.success(BulkOperationResponse(
          successful: successful,
          failed: failed,
          successful_count: successful_count,
          failed_count: failed_count,
        ))
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

pub fn bulk_send_email_broadcast(
  ctx: web.Context,
  session: web.Session,
  subject: String,
  message_body: String,
  broadcast_key: option.Option(String),
  category: option.Option(String),
  attach_tracking_headers: Bool,
  audit_log_reason: option.Option(String),
) -> Result(BulkOperationResponse, ApiError) {
  let url = ctx.api_endpoint <> "/admin/bulk/send-email-broadcast"
  let body_fields = [
    #("subject", json.string(subject)),
    #("body", json.string(message_body)),
    #("attach_tracking_headers", json.bool(attach_tracking_headers)),
  ]
  let body_fields = case broadcast_key {
    option.Some(key) -> [#("broadcast_key", json.string(key)), ..body_fields]
    option.None -> body_fields
  }
  let body_fields = case category {
    option.Some(value) -> [#("category", json.string(value)), ..body_fields]
    option.None -> body_fields
  }
  let body = json.object(body_fields) |> json.to_string

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
    Ok(resp) if resp.status == 200 -> {
      let error_decoder = {
        use id <- decode.field("id", decode.string)
        use error <- decode.field("error", decode.string)
        decode.success(BulkOperationError(id: id, error: error))
      }

      let decoder = {
        use successful <- decode.field("successful", decode.list(decode.string))
        use failed <- decode.field("failed", decode.list(error_decoder))
        use successful_count <- decode.optional_field(
          "successful_count",
          list.length(successful),
          decode.int,
        )
        use failed_count <- decode.optional_field(
          "failed_count",
          list.length(failed),
          decode.int,
        )
        decode.success(BulkOperationResponse(
          successful: successful,
          failed: failed,
          successful_count: successful_count,
          failed_count: failed_count,
        ))
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
