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

import astral_admin/acl
import astral_admin/api/archives
import astral_admin/api/common
import astral_admin/api/discovery_applications
import astral_admin/api/reports
import astral_admin/api/users
import astral_admin/api/verifications
import astral_admin/components/errors
import astral_admin/components/flash
import astral_admin/constants
import astral_admin/navigation
import astral_admin/oauth2
import astral_admin/pages/ai_page
import astral_admin/pages/archives_page
import astral_admin/pages/asset_purge_page
import astral_admin/pages/audit_logs_page
import astral_admin/pages/beta_codes_page
import astral_admin/pages/bulk_actions_page
import astral_admin/pages/dashboard_page
import astral_admin/pages/database_page
import astral_admin/pages/discovery_applications_page
import astral_admin/pages/email_bans_page
import astral_admin/pages/feature_flags_page
import astral_admin/pages/gateway_page
import astral_admin/pages/gift_codes_page
import astral_admin/pages/guild_detail_page
import astral_admin/pages/guilds_page
import astral_admin/pages/instance_config_page
import astral_admin/pages/ip_bans_page
import astral_admin/pages/jobs_page
import astral_admin/pages/login_page
import astral_admin/pages/messages_metrics_page
import astral_admin/pages/messages_page
import astral_admin/pages/metrics_page
import astral_admin/pages/oauth2_callback_page
import astral_admin/pages/ops_page
import astral_admin/pages/pending_verifications_page
import astral_admin/pages/phone_bans_page
import astral_admin/pages/report_detail_page
import astral_admin/pages/reports_page
import astral_admin/pages/search_index_page
import astral_admin/pages/storage_page
import astral_admin/pages/strange_place_page
import astral_admin/pages/user_detail_page
import astral_admin/pages/users_page
import astral_admin/pages/voice_regions_page
import astral_admin/pages/voice_servers_page
import astral_admin/session
import astral_admin/web.{type Context, prepend_base_path}
import gleam/http.{Get, Post}
import gleam/http/request
import gleam/httpc
import gleam/int
import gleam/json
import gleam/list
import gleam/option
import gleam/result
import gleam/string
import lustre/element
import wisp.{type Request, type Response}

fn parse_bool_query(value: String) -> option.Option(Bool) {
  case string.lowercase(string.trim(value)) {
    "true" -> option.Some(True)
    "false" -> option.Some(False)
    _ -> option.None
  }
}

fn redirect_to_login_and_clear_session(req: Request, ctx: Context) -> Response {
  wisp.redirect(prepend_base_path(ctx, "/login"))
  |> wisp.set_cookie(req, "session", "", wisp.Signed, 0)
}

fn with_session(
  req: Request,
  ctx: Context,
  handler: fn(web.Session) -> Response,
) -> Response {
  case wisp.get_cookie(req, "session", wisp.Signed) {
    Ok(cookie) ->
      case session.get(ctx, cookie) {
        Ok(user_session) ->
          case users.get_current_admin(ctx, user_session) {
            Ok(_) -> handler(user_session)
            Error(common.Unauthorized) ->
              redirect_to_login_and_clear_session(req, ctx)
            Error(_) -> handler(user_session)
          }
        Error(_) -> redirect_to_authorize(req, ctx)
      }
    Error(_) -> redirect_to_authorize(req, ctx)
  }
}

fn require_auth_or_redirect(
  req: Request,
  ctx: Context,
  handler: fn() -> Response,
) -> Response {
  case wisp.get_cookie(req, "session", wisp.Signed) {
    Ok(cookie) ->
      case session.get(ctx, cookie) {
        Ok(user_session) ->
          case users.get_current_admin(ctx, user_session) {
            Ok(_) -> handler()
            Error(common.Unauthorized) ->
              redirect_to_login_and_clear_session(req, ctx)
            Error(_) -> handler()
          }
        Error(_) -> redirect_to_authorize(req, ctx)
      }
    Error(_) -> redirect_to_authorize(req, ctx)
  }
}

fn redirect_to_authorize(req: Request, ctx: Context) -> Response {
  let state = oauth2.generate_state()

  wisp.redirect(oauth2.authorize_url(ctx, state))
  |> wisp.set_header("cache-control", "no-cache, no-store, must-revalidate")
  |> wisp.set_cookie(req, "oauth_state", state, wisp.Signed, 300)
}

fn with_session_and_admin(
  req: Request,
  ctx: Context,
  handler: fn(web.Session, option.Option(common.UserLookupResult)) -> Response,
) -> Response {
  case wisp.get_cookie(req, "session", wisp.Signed) {
    Ok(cookie) ->
      case session.get(ctx, cookie) {
        Ok(user_session) -> {
          case users.get_current_admin(ctx, user_session) {
            Ok(option.Some(admin)) -> handler(user_session, option.Some(admin))
            Ok(option.None) -> handler(user_session, option.None)
            Error(common.Unauthorized) ->
              redirect_to_login_and_clear_session(req, ctx)
            Error(_) -> handler(user_session, option.None)
          }
        }
        Error(_) -> redirect_to_authorize(req, ctx)
      }
    Error(_) -> redirect_to_authorize(req, ctx)
  }
}

fn is_truthy_flag(value: String) -> Bool {
  case string.lowercase(value) {
    "true" -> True
    "1" -> True
    _ -> False
  }
}

fn get_bool_query(req: Request, key: String) -> Bool {
  let query = wisp.get_query(req)
  let maybe = list.key_find(query, key) |> option.from_result
  case maybe {
    option.Some(v) -> is_truthy_flag(v)
    option.None -> False
  }
}

fn clamp_limit(limit: Int) -> Int {
  let min = 10
  let max = 200
  case limit < min {
    True -> min
    False ->
      case limit > max {
        True -> max
        False -> limit
      }
  }
}

fn api_error_message(err: common.ApiError) -> String {
  case err {
    common.Unauthorized -> "Unauthorized"
    common.Forbidden(message) -> message
    common.NotFound -> "Not Found"
    common.NetworkError -> "Network error"
    common.ServerError -> "Service temporarily unavailable"
  }
}

fn admin_acls_from(
  current_admin: option.Option(common.UserLookupResult),
) -> List(String) {
  case current_admin {
    option.Some(admin) -> admin.acls
    option.None -> []
  }
}

fn home_path(admin_acls: List(String)) -> String {
  case navigation.first_accessible_path(admin_acls) {
    option.Some(path) -> path
    option.None -> "/strange-place"
  }
}

fn redirect_to_home(ctx: Context, admin_acls: List(String)) -> Response {
  wisp.redirect(prepend_base_path(ctx, home_path(admin_acls)))
}

pub fn handle_request(req: Request, ctx: Context) -> Response {
  use req <- web_middleware(req)

  case wisp.path_segments(req) {
    ["robots.txt"] ->
      case req.method {
        Get -> {
          wisp.response(200)
          |> wisp.set_header("content-type", "text/plain; charset=utf-8")
          |> wisp.string_body("User-agent: *\nDisallow: /\n")
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["login"] ->
      case req.method {
        Get -> {
          let query = wisp.get_query(req)
          let error_param = list.key_find(query, "error") |> option.from_result
          let error_msg = case error_param {
            option.Some("oauth_failed") ->
              option.Some("Authentication failed. Please try again.")
            option.Some("missing_admin_acl") ->
              option.Some(
                "Access denied: missing admin:authenticate permission. Ask an administrator to grant access.",
              )
            option.Some(_) -> option.Some("Login error. Please try again.")
            option.None -> option.None
          }

          case wisp.get_cookie(req, "session", wisp.Signed) {
            Ok(cookie) ->
              case session.get(ctx, cookie) {
                Ok(_session) ->
                  wisp.redirect(prepend_base_path(ctx, "/dashboard"))
                Error(_) -> login_page.view(ctx, error_msg)
              }
            Error(_) -> login_page.view(ctx, error_msg)
          }
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["auth", "start"] ->
      case req.method {
        Get -> redirect_to_authorize(req, ctx)
        _ -> wisp.method_not_allowed([Get])
      }
    ["oauth2_callback"] ->
      case req.method {
        Get -> oauth2_callback_page.handle(req, ctx)
        _ -> wisp.method_not_allowed([Get])
      }
    ["logout"] ->
      case req.method {
        Get -> {
          let maybe_cookie = wisp.get_cookie(req, "session", wisp.Signed)
          let session = case maybe_cookie {
            Ok(cookie) -> session.get(ctx, cookie)
            Error(_) -> Error(Nil)
          }

          let _ = case session {
            Ok(s) -> {
              let revoke_url = ctx.api_endpoint <> "/oauth2/revoke"
              let body =
                "token=" <> s.access_token <> "&token_type_hint=access_token"
              let assert Ok(revoke_req) = request.to(revoke_url)
              let basic =
                "Basic "
                <> oauth2.base64_encode_string(
                  ctx.oauth_client_id <> ":" <> ctx.oauth_client_secret,
                )
              let revoke_req =
                revoke_req
                |> request.set_method(Post)
                |> request.set_header(
                  "content-type",
                  "application/x-www-form-urlencoded",
                )
                |> request.set_header("authorization", basic)
                |> request.set_body(body)
              case httpc.send(revoke_req) {
                _ -> Nil
              }
            }
            Error(_) -> Nil
          }

          wisp.redirect(prepend_base_path(ctx, "/login"))
          |> wisp.set_cookie(req, "session", "", wisp.Signed, 0)
        }
        _ -> wisp.method_not_allowed([Get])
      }
    _ ->
      require_auth_or_redirect(req, ctx, fn() {
        handle_authenticated_request(req, ctx)
      })
  }
}

fn handle_authenticated_request(req: Request, ctx: Context) -> Response {
  case wisp.path_segments(req) {
    ["dashboard"] -> {
      use user_session, current_admin <- with_session_and_admin(req, ctx)
      let flash_data = flash.from_request(req)
      dashboard_page.view(ctx, user_session, current_admin, flash_data)
    }
    ["queue-counts.json"] -> {
      use user_session, current_admin <- with_session_and_admin(req, ctx)
      queue_counts_response(ctx, user_session, current_admin)
    }
    ["api-proxy", "ai", "stats"] -> {
      use user_session, _current_admin <- with_session_and_admin(req, ctx)
      ai_proxy_get(ctx, user_session, "/admin/ai/stats")
    }
    ["api-proxy", "ai", "test"] -> {
      use user_session, _current_admin <- with_session_and_admin(req, ctx)
      case req.method {
        Post -> {
          use body <- wisp.require_string_body(req)
          ai_proxy_post(ctx, user_session, "/admin/ai/test", body)
        }
        _ -> wisp.method_not_allowed([Post])
      }
    }
    ["api-proxy", "ai", "analyze-user"] -> {
      use user_session, _current_admin <- with_session_and_admin(req, ctx)
      case req.method {
        Post -> {
          use body <- wisp.require_string_body(req)
          ai_proxy_post(ctx, user_session, "/admin/ai/analyze-user", body)
        }
        _ -> wisp.method_not_allowed([Post])
      }
    }
    ["api-proxy", "ops", "snapshot"] -> {
      use user_session, current_admin <- with_session_and_admin(req, ctx)
      let admin_acls = case current_admin {
        option.Some(admin) -> admin.acls
        _ -> []
      }
      case acl.has_permission(admin_acls, constants.acl_metrics_view) {
        True -> ai_proxy_get(ctx, user_session, "/admin/ops/snapshot")
        False -> wisp.response(403) |> wisp.string_body("{\"error\":\"forbidden\"}")
      }
    }
    ["api-proxy", "ops", "smoke"] -> {
      use user_session, current_admin <- with_session_and_admin(req, ctx)
      let admin_acls = case current_admin {
        option.Some(admin) -> admin.acls
        _ -> []
      }
      case acl.has_permission(admin_acls, constants.acl_metrics_view) {
        True ->
          case req.method {
            Post -> ai_proxy_post(ctx, user_session, "/admin/ops/smoke", "{}")
            _ -> wisp.method_not_allowed([Post])
          }
        False -> wisp.response(403) |> wisp.string_body("{\"error\":\"forbidden\"}")
      }
    }
    ["api-proxy", "ops", "release", action] -> {
      use user_session, current_admin <- with_session_and_admin(req, ctx)
      let admin_acls = case current_admin {
        option.Some(admin) -> admin.acls
        _ -> []
      }
      case acl.has_permission(admin_acls, constants.acl_metrics_view) {
        True ->
          case req.method {
            Post -> {
              let api_path = case action {
                "advance" -> "/admin/ops/release/advance"
                "full" -> "/admin/ops/release/full"
                "write-version" -> "/admin/ops/release/write-version"
                _ -> ""
              }
              case api_path {
                "" ->
                  wisp.response(404)
                  |> wisp.string_body("{\"error\":\"unknown action\"}")
                _ -> ai_proxy_post(ctx, user_session, api_path, "{}")
              }
            }
            _ -> wisp.method_not_allowed([Post])
          }
        False -> wisp.response(403) |> wisp.string_body("{\"error\":\"forbidden\"}")
      }
    }
    ["users"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          let query = wisp.get_query(req)
          let search_query = list.key_find(query, "q") |> option.from_result
          let email_verified =
            list.key_find(query, "email_verified")
            |> option.from_result
            |> option.then(parse_bool_query)
          let has_premium =
            list.key_find(query, "has_premium")
            |> option.from_result
            |> option.then(parse_bool_query)
          let is_bot =
            list.key_find(query, "is_bot")
            |> option.from_result
            |> option.then(parse_bool_query)
          let page_str =
            list.key_find(query, "page")
            |> option.from_result
            |> option.unwrap("0")
          let page =
            int.parse(page_str) |> option.from_result |> option.unwrap(0)

          users_page.view(
            ctx,
            user_session,
            current_admin,
            flash_data,
            search_query,
            email_verified,
            has_premium,
            is_bot,
            page,
          )
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["users", user_id] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          let query = wisp.get_query(req)
          let referrer = list.key_find(query, "ref") |> option.from_result
          let tab = list.key_find(query, "tab") |> option.from_result
          let message_shred_job_id =
            list.key_find(query, "message_shred_job_id") |> option.from_result
          let delete_all_messages_dry_run = case
            list.key_find(query, "delete_all_messages_dry_run")
            |> option.from_result
          {
            option.Some(flag) ->
              case
                list.key_find(query, "delete_all_messages_channel_count")
                |> option.from_result
              {
                option.Some(channel_count_str) ->
                  case
                    list.key_find(query, "delete_all_messages_message_count")
                    |> option.from_result
                  {
                    option.Some(message_count_str) ->
                      case is_truthy_flag(flag) {
                        True ->
                          case
                            int.parse(channel_count_str) |> option.from_result
                          {
                            option.Some(channel_count) ->
                              case
                                int.parse(message_count_str)
                                |> option.from_result
                              {
                                option.Some(message_count) ->
                                  option.Some(#(channel_count, message_count))
                                _ -> option.None
                              }
                            _ -> option.None
                          }
                        False -> option.None
                      }
                    _ -> option.None
                  }
                _ -> option.None
              }
            _ -> option.None
          }
          user_detail_page.view(
            ctx,
            user_session,
            current_admin,
            flash_data,
            user_id,
            referrer,
            tab,
            message_shred_job_id,
            delete_all_messages_dry_run,
          )
        }
        Post -> {
          use user_session <- with_session(req, ctx)
          let query = wisp.get_query(req)
          let action = list.key_find(query, "action") |> option.from_result
          let tab = list.key_find(query, "tab") |> option.from_result
          user_detail_page.handle_action(
            req,
            ctx,
            user_session,
            user_id,
            action,
            tab,
          )
        }
        _ -> wisp.method_not_allowed([Get, Post])
      }
    ["guilds"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          let query = wisp.get_query(req)
          let search_query = list.key_find(query, "q") |> option.from_result
          let page_str =
            list.key_find(query, "page")
            |> option.from_result
            |> option.unwrap("0")
          let page =
            int.parse(page_str) |> option.from_result |> option.unwrap(0)

          guilds_page.view(
            ctx,
            user_session,
            current_admin,
            flash_data,
            search_query,
            page,
          )
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["guilds", guild_id] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          let query = wisp.get_query(req)
          let referrer = list.key_find(query, "ref") |> option.from_result
          let tab = list.key_find(query, "tab") |> option.from_result
          let page = list.key_find(query, "page") |> option.from_result
          guild_detail_page.view(
            ctx,
            user_session,
            current_admin,
            flash_data,
            guild_id,
            referrer,
            tab,
            page,
          )
        }
        Post -> {
          use user_session <- with_session(req, ctx)
          let query = wisp.get_query(req)
          let action = list.key_find(query, "action") |> option.from_result
          let tab = list.key_find(query, "tab") |> option.from_result
          guild_detail_page.handle_action(
            req,
            ctx,
            user_session,
            guild_id,
            action,
            tab,
          )
        }
        _ -> wisp.method_not_allowed([Get, Post])
      }
    ["audit-logs"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          let query = wisp.get_query(req)
          let search_query = list.key_find(query, "q") |> option.from_result
          let admin_user_id_filter =
            list.key_find(query, "admin_user_id") |> option.from_result
          let target_type =
            list.key_find(query, "target_type") |> option.from_result
          let target_id =
            list.key_find(query, "target_id") |> option.from_result
          let action = list.key_find(query, "action") |> option.from_result
          let current_page =
            list.key_find(query, "page")
            |> result.try(int.parse)
            |> result.unwrap(1)

          audit_logs_page.view(
            ctx,
            user_session,
            current_admin,
            flash_data,
            search_query,
            admin_user_id_filter,
            target_type,
            target_id,
            action,
            current_page,
          )
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["archives"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          let query = wisp.get_query(req)
          let subject_type =
            list.key_find(query, "subject_type")
            |> option.from_result
            |> option.unwrap("all")
          let subject_id =
            list.key_find(query, "subject_id") |> option.from_result

          archives_page.view(
            ctx,
            user_session,
            current_admin,
            flash_data,
            subject_type,
            subject_id,
          )
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["archives", "download"] ->
      case req.method {
        Get -> {
          use user_session, _current_admin <- with_session_and_admin(req, ctx)
          let query = wisp.get_query(req)
          let subject_type =
            list.key_find(query, "subject_type")
            |> option.from_result
            |> option.unwrap("user")
          let subject_id =
            list.key_find(query, "subject_id") |> option.from_result
          let archive_id =
            list.key_find(query, "archive_id") |> option.from_result

          case subject_id, archive_id {
            option.Some(sid), option.Some(aid) -> {
              case
                archives.get_archive_download_url(
                  ctx,
                  user_session,
                  subject_type,
                  sid,
                  aid,
                )
              {
                Ok(#(download_url, _expires_at)) -> wisp.redirect(download_url)
                Error(err) ->
                  errors.api_error_view(
                    ctx,
                    err,
                    option.Some("/archives"),
                    option.Some("Back to Archives"),
                  )
                  |> element.to_document_string
                  |> wisp.html_response(400)
              }
            }
            _, _ ->
              errors.api_error_view(
                ctx,
                common.Forbidden("Missing archive parameters"),
                option.Some("/archives"),
                option.Some("Back to Archives"),
              )
              |> element.to_document_string
              |> wisp.html_response(400)
          }
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["gateway"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }

          gateway_page.view(
            req,
            ctx,
            user_session,
            current_admin,
            flash_data,
            admin_acls,
            option.None,
          )
        }
        Post -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          let query = wisp.get_query(req)
          let action = list.key_find(query, "action") |> option.from_result

          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }

          case action {
            option.Some("reload_all") ->
              gateway_page.handle_action(
                req,
                ctx,
                user_session,
                current_admin,
                admin_acls,
              )
            _ ->
              gateway_page.view(
                req,
                ctx,
                user_session,
                current_admin,
                flash_data,
                admin_acls,
                option.None,
              )
          }
        }
        _ -> wisp.method_not_allowed([Get, Post])
      }
    ["instance-config"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          instance_config_page.view(
            ctx,
            user_session,
            current_admin,
            flash_data,
          )
        }
        Post -> {
          use user_session <- with_session(req, ctx)
          let query = wisp.get_query(req)
          let action_name =
            list.key_find(query, "action") |> result.unwrap("unknown")
          instance_config_page.handle_action(
            req,
            ctx,
            user_session,
            action_name,
          )
        }
        _ -> wisp.method_not_allowed([Get, Post])
      }
    ["feature-flags"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }

          feature_flags_page.view(
            ctx,
            user_session,
            current_admin,
            flash_data,
            admin_acls,
          )
        }
        Post -> {
          use user_session <- with_session(req, ctx)
          let query = wisp.get_query(req)
          let action = list.key_find(query, "action")
          let admin_result = users.get_current_admin(ctx, user_session)
          let admin_acls = case admin_result {
            Ok(option.Some(admin)) -> admin.acls
            _ -> []
          }

          feature_flags_page.handle_action(
            req,
            ctx,
            user_session,
            admin_acls,
            action,
          )
        }
        _ -> wisp.method_not_allowed([Get, Post])
      }
    ["voice-regions"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          voice_regions_page.view(ctx, user_session, current_admin, flash_data)
        }
        Post -> {
          use user_session <- with_session(req, ctx)
          voice_regions_page.handle_action(req, ctx, user_session)
        }
        _ -> wisp.method_not_allowed([Get, Post])
      }
    ["voice-servers"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let query = wisp.get_query(req)
          let region = list.key_find(query, "region") |> option.from_result
          let flash_data = flash.from_request(req)
          voice_servers_page.view(
            ctx,
            user_session,
            current_admin,
            region,
            flash_data,
          )
        }
        Post -> {
          use user_session <- with_session(req, ctx)
          let query = wisp.get_query(req)
          let region = list.key_find(query, "region") |> result.unwrap("")
          voice_servers_page.handle_action(req, ctx, user_session, region)
        }
        _ -> wisp.method_not_allowed([Get, Post])
      }
    ["ip-bans"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          ip_bans_page.view(ctx, user_session, current_admin, flash_data)
        }
        Post -> {
          use user_session <- with_session(req, ctx)
          let query = wisp.get_query(req)
          let action = list.key_find(query, "action") |> option.from_result
          ip_bans_page.handle_action(req, ctx, user_session, action)
        }
        _ -> wisp.method_not_allowed([Get, Post])
      }
    ["email-bans"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          email_bans_page.view(ctx, user_session, current_admin, flash_data)
        }
        Post -> {
          use user_session <- with_session(req, ctx)
          let query = wisp.get_query(req)
          let action = list.key_find(query, "action") |> option.from_result
          email_bans_page.handle_action(req, ctx, user_session, action)
        }
        _ -> wisp.method_not_allowed([Get, Post])
      }
    ["phone-bans"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          phone_bans_page.view(ctx, user_session, current_admin, flash_data)
        }
        Post -> {
          use user_session <- with_session(req, ctx)
          let query = wisp.get_query(req)
          let action = list.key_find(query, "action") |> option.from_result
          phone_bans_page.handle_action(req, ctx, user_session, action)
        }
        _ -> wisp.method_not_allowed([Get, Post])
      }
    ["bulk-actions"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }

          bulk_actions_page.view(
            ctx,
            user_session,
            current_admin,
            flash_data,
            admin_acls,
            option.None,
          )
        }
        Post -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let query = wisp.get_query(req)
          let action = list.key_find(query, "action") |> option.from_result

          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }

          bulk_actions_page.handle_action(
            req,
            ctx,
            user_session,
            current_admin,
            admin_acls,
            action,
          )
        }
        _ -> wisp.method_not_allowed([Get, Post])
      }
    ["asset-purge"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)

          asset_purge_page.view(
            ctx,
            user_session,
            current_admin,
            flash_data,
            option.None,
          )
        }
        Post -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          asset_purge_page.handle_action(req, ctx, user_session, current_admin)
        }
        _ -> wisp.method_not_allowed([Get, Post])
      }
    ["beta-codes"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }

          beta_codes_page.view(
            ctx,
            user_session,
            current_admin,
            flash_data,
            admin_acls,
          )
        }
        Post -> {
          use user_session <- with_session(req, ctx)
          let query = wisp.get_query(req)
          let action = list.key_find(query, "action") |> option.from_result

          let admin_result = users.get_current_admin(ctx, user_session)
          let admin_acls = case admin_result {
            Ok(option.Some(admin)) -> admin.acls
            _ -> []
          }

          let current_admin = case admin_result {
            Ok(option.Some(admin)) -> option.Some(admin)
            _ -> option.None
          }

          beta_codes_page.handle_action(
            req,
            ctx,
            user_session,
            current_admin,
            admin_acls,
            action,
          )
        }
        _ -> wisp.method_not_allowed([Get, Post])
      }
    ["gift-codes"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }

          gift_codes_page.view(
            ctx,
            user_session,
            current_admin,
            flash_data,
            admin_acls,
          )
        }
        Post -> {
          use user_session <- with_session(req, ctx)
          let query = wisp.get_query(req)
          let action = list.key_find(query, "action") |> option.from_result

          let admin_result = users.get_current_admin(ctx, user_session)
          let admin_acls = case admin_result {
            Ok(option.Some(admin)) -> admin.acls
            _ -> []
          }

          let current_admin = case admin_result {
            Ok(option.Some(admin)) -> option.Some(admin)
            _ -> option.None
          }

          gift_codes_page.handle_action(
            req,
            ctx,
            user_session,
            current_admin,
            admin_acls,
            action,
          )
        }
        _ -> wisp.method_not_allowed([Get, Post])
      }
    ["pending-verifications"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }

          case
            acl.has_permission(
              admin_acls,
              constants.acl_pending_verification_view,
            )
          {
            True ->
              pending_verifications_page.view(
                ctx,
                user_session,
                current_admin,
                flash_data,
              )
            False ->
              wisp.response(403)
              |> wisp.string_body(
                "Forbidden: requires pending_verification:view permission",
              )
          }
        }
        Post -> {
          use user_session <- with_session(req, ctx)
          let query = wisp.get_query(req)
          let action = list.key_find(query, "action") |> option.from_result
          let background = get_bool_query(req, "background")
          let admin_result = users.get_current_admin(ctx, user_session)
          let admin_acls = case admin_result {
            Ok(option.Some(admin)) -> admin.acls
            _ -> []
          }

          case
            acl.has_permission(
              admin_acls,
              constants.acl_pending_verification_review,
            )
          {
            True ->
              pending_verifications_page.handle_action(
                req,
                ctx,
                user_session,
                action,
                background,
              )
            False ->
              case background {
                True ->
                  wisp.json_response(
                    "{\"error\": \"Forbidden: requires pending_verification:review permission\"}",
                    403,
                  )
                False ->
                  flash.redirect_with_error(
                    ctx,
                    "/pending-verifications",
                    "Forbidden: requires pending_verification:review permission",
                  )
              }
          }
        }
        _ -> wisp.method_not_allowed([Get, Post])
      }
    ["pending-verifications", "fragment"] ->
      case req.method {
        Get -> {
          use user_session <- with_session(req, ctx)
          let query = wisp.get_query(req)
          let page_str =
            list.key_find(query, "page")
            |> option.from_result
            |> option.unwrap("1")
          let page =
            int.parse(page_str) |> option.from_result |> option.unwrap(1)
          let admin_result = users.get_current_admin(ctx, user_session)
          let admin_acls = case admin_result {
            Ok(option.Some(admin)) -> admin.acls
            _ -> []
          }
          let can_review =
            acl.has_permission(
              admin_acls,
              constants.acl_pending_verification_review,
            )

          case
            acl.has_permission(
              admin_acls,
              constants.acl_pending_verification_view,
            )
          {
            True ->
              pending_verifications_page.view_fragment(
                ctx,
                user_session,
                page,
                can_review,
              )
            False -> wisp.response(403) |> wisp.string_body("Forbidden")
          }
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["pending-verifications", user_id] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          pending_verifications_page.view_single(
            ctx,
            user_session,
            current_admin,
            flash_data,
            user_id,
          )
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["discovery-applications"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          let query = wisp.get_query(req)
          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }
          let has_all = case list.key_find(query, "all") {
            Ok(_) -> True
            Error(_) -> False
          }
          let status_filter = case has_all {
            True -> option.None
            False ->
              case list.key_find(query, "status") {
                Ok(s) -> option.Some(s)
                Error(_) -> option.Some("pending")
              }
          }

          case
            acl.has_permission(admin_acls, constants.acl_guild_discovery_review)
          {
            True ->
              discovery_applications_page.view(
                ctx,
                user_session,
                current_admin,
                flash_data,
                status_filter,
              )
            False ->
              wisp.response(403)
              |> wisp.string_body(
                "Forbidden: requires guild:discovery:review permission",
              )
          }
        }
        Post -> {
          use user_session <- with_session(req, ctx)
          let query = wisp.get_query(req)
          let action_name = list.key_find(query, "action") |> option.from_result
          let background = get_bool_query(req, "background")
          let admin_result = users.get_current_admin(ctx, user_session)
          let admin_acls = case admin_result {
            Ok(option.Some(admin)) -> admin.acls
            _ -> []
          }

          case
            acl.has_permission(admin_acls, constants.acl_guild_discovery_review)
          {
            True ->
              discovery_applications_page.handle_action(
                req,
                ctx,
                user_session,
                action_name,
                background,
              )
            False ->
              case background {
                True ->
                  wisp.json_response(
                    "{\"error\": \"Forbidden: requires guild:discovery:review permission\"}",
                    403,
                  )
                False ->
                  flash.redirect_with_error(
                    ctx,
                    "/discovery-applications",
                    "Forbidden: requires guild:discovery:review permission",
                  )
              }
          }
        }
        _ -> wisp.method_not_allowed([Get, Post])
      }
    ["reports"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          let query = wisp.get_query(req)
          let search_query = list.key_find(query, "q") |> option.from_result
          let status_str = list.key_find(query, "status") |> option.from_result
          let status_filter = case status_str {
            option.Some(s) ->
              int.parse(s)
              |> option.from_result
              |> option.map(option.Some)
              |> option.unwrap(option.None)
            option.None -> option.None
          }
          let type_str = list.key_find(query, "type") |> option.from_result
          let type_filter = case type_str {
            option.Some(t) ->
              int.parse(t)
              |> option.from_result
              |> option.map(option.Some)
              |> option.unwrap(option.None)
            option.None -> option.None
          }
          let category_filter =
            list.key_find(query, "category") |> option.from_result
          let page_str =
            list.key_find(query, "page")
            |> option.from_result
            |> option.unwrap("0")
          let page =
            int.parse(page_str) |> option.from_result |> option.unwrap(0)
          let sort =
            list.key_find(query, "sort")
            |> option.from_result
            |> option.map(fn(s) {
              case string.trim(s) {
                "" -> option.None
                v -> option.Some(v)
              }
            })
            |> option.unwrap(option.None)
          let limit_str =
            list.key_find(query, "limit")
            |> option.from_result
            |> option.unwrap("50")
          let limit =
            int.parse(limit_str)
            |> option.from_result
            |> option.unwrap(50)
            |> clamp_limit

          reports_page.view_with_mode(
            ctx,
            user_session,
            current_admin,
            flash_data,
            search_query,
            status_filter,
            type_filter,
            category_filter,
            page,
            limit,
            sort,
          )
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["reports", report_id] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          report_detail_page.view(
            ctx,
            user_session,
            current_admin,
            flash_data,
            report_id,
          )
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["reports", report_id, "fragment"] ->
      case req.method {
        Get -> {
          use user_session <- with_session(req, ctx)
          report_detail_page.fragment(ctx, user_session, report_id)
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["reports", report_id, "resolve"] ->
      case req.method {
        Post -> {
          use user_session <- with_session(req, ctx)
          use form <- wisp.require_form(req)
          let background = get_bool_query(req, "background")
          let public_comment =
            list.key_find(form.values, "public_comment") |> option.from_result
          let result =
            reports.resolve_report(
              ctx,
              user_session,
              report_id,
              public_comment,
              option.None,
            )

          case background {
            True -> {
              case result {
                Ok(_) -> wisp.response(204)
                Error(err) ->
                  wisp.response(400)
                  |> wisp.set_header("content-type", "text/plain")
                  |> wisp.string_body(api_error_message(err))
              }
            }
            False -> {
              case result {
                Ok(_) -> wisp.redirect(prepend_base_path(ctx, "/reports"))
                Error(_) -> wisp.redirect(prepend_base_path(ctx, "/reports"))
              }
            }
          }
        }
        _ -> wisp.method_not_allowed([Post])
      }
    ["messages"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }

          messages_page.handle_get(
            req,
            ctx,
            user_session,
            current_admin,
            flash_data,
            admin_acls,
          )
        }
        Post -> {
          use user_session <- with_session(req, ctx)
          let query = wisp.get_query(req)
          let action = list.key_find(query, "action") |> option.from_result

          let admin_result = users.get_current_admin(ctx, user_session)
          let admin_acls = case admin_result {
            Ok(option.Some(admin)) -> admin.acls
            _ -> []
          }

          messages_page.handle_action(
            req,
            ctx,
            user_session,
            admin_acls,
            action,
          )
        }
        _ -> wisp.method_not_allowed([Get, Post])
      }
    ["metrics"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          metrics_page.view(ctx, user_session, current_admin, flash_data)
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["ai"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          ai_page.view(ctx, user_session, current_admin, flash_data)
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["messages-metrics"] ->
      case req.method {
        Get -> {
          use _user_session, current_admin <- with_session_and_admin(req, ctx)
          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }
          case acl.has_permission(admin_acls, constants.acl_metrics_view) {
            True -> {
              use user_session, current_admin <- with_session_and_admin(
                req,
                ctx,
              )
              let flash_data = flash.from_request(req)
              messages_metrics_page.view(
                ctx,
                user_session,
                current_admin,
                flash_data,
              )
            }
            False ->
              wisp.response(403)
              |> wisp.string_body("Forbidden: requires metrics:view permission")
          }
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["jobs"] ->
      case req.method {
        Get -> {
          use _user_session, current_admin <- with_session_and_admin(req, ctx)
          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }
          case acl.has_permission(admin_acls, constants.acl_metrics_view) {
            True -> {
              use user_session, current_admin <- with_session_and_admin(
                req,
                ctx,
              )
              let flash_data = flash.from_request(req)
              jobs_page.view(ctx, user_session, current_admin, flash_data)
            }
            False ->
              wisp.response(403)
              |> wisp.string_body("Forbidden: requires metrics:view permission")
          }
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["storage"] ->
      case req.method {
        Get -> {
          use _user_session, current_admin <- with_session_and_admin(req, ctx)
          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }
          case acl.has_permission(admin_acls, constants.acl_metrics_view) {
            True -> {
              use user_session, current_admin <- with_session_and_admin(
                req,
                ctx,
              )
              let flash_data = flash.from_request(req)
              storage_page.view(ctx, user_session, current_admin, flash_data)
            }
            False ->
              wisp.response(403)
              |> wisp.string_body("Forbidden: requires metrics:view permission")
          }
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["database"] ->
      case req.method {
        Get -> {
          use _user_session, current_admin <- with_session_and_admin(req, ctx)
          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }
          case acl.has_permission(admin_acls, constants.acl_metrics_view) {
            True -> {
              use user_session, current_admin <- with_session_and_admin(
                req,
                ctx,
              )
              let flash_data = flash.from_request(req)
              database_page.view(ctx, user_session, current_admin, flash_data)
            }
            False ->
              wisp.response(403)
              |> wisp.string_body("Forbidden: requires metrics:view permission")
          }
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["ops"] ->
      case req.method {
        Get -> {
          use _user_session, current_admin <- with_session_and_admin(req, ctx)
          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }
          case acl.has_permission(admin_acls, constants.acl_metrics_view) {
            True -> {
              use user_session, current_admin <- with_session_and_admin(
                req,
                ctx,
              )
              let flash_data = flash.from_request(req)
              ops_page.view(ctx, user_session, current_admin, flash_data)
            }
            False ->
              wisp.response(403)
              |> wisp.string_body("Forbidden: requires metrics:view permission")
          }
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["api", "metrics", "query"] ->
      case req.method {
        Get -> {
          use _user_session, current_admin <- with_session_and_admin(req, ctx)
          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }
          case acl.has_permission(admin_acls, constants.acl_metrics_view) {
            True -> proxy_metrics_request(ctx, "/query", req)
            False -> wisp.response(403) |> wisp.string_body("Forbidden")
          }
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["api", "metrics", "query", "aggregate"] ->
      case req.method {
        Get -> {
          use _user_session, current_admin <- with_session_and_admin(req, ctx)
          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }
          case acl.has_permission(admin_acls, constants.acl_metrics_view) {
            True -> proxy_metrics_request(ctx, "/query/aggregate", req)
            False -> wisp.response(403) |> wisp.string_body("Forbidden")
          }
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["api", "metrics", "query", "top"] ->
      case req.method {
        Get -> {
          use _user_session, current_admin <- with_session_and_admin(req, ctx)
          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }
          case acl.has_permission(admin_acls, constants.acl_metrics_view) {
            True -> proxy_metrics_request(ctx, "/query/top", req)
            False -> wisp.response(403) |> wisp.string_body("Forbidden")
          }
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["api", "metrics", "query", "crashes"] ->
      case req.method {
        Get -> {
          use _user_session, current_admin <- with_session_and_admin(req, ctx)
          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }
          case acl.has_permission(admin_acls, constants.acl_metrics_view) {
            True -> proxy_metrics_request(ctx, "/query/crashes", req)
            False -> wisp.response(403) |> wisp.string_body("Forbidden")
          }
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["api", "metrics", "query", "percentiles"] ->
      case req.method {
        Get -> {
          use _user_session, current_admin <- with_session_and_admin(req, ctx)
          let admin_acls = case current_admin {
            option.Some(admin) -> admin.acls
            _ -> []
          }
          case acl.has_permission(admin_acls, constants.acl_metrics_view) {
            True -> proxy_metrics_request(ctx, "/query/percentiles", req)
            False -> wisp.response(403) |> wisp.string_body("Forbidden")
          }
        }
        _ -> wisp.method_not_allowed([Get])
      }
    ["search-index"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          let query = wisp.get_query(req)
          let job_id = list.key_find(query, "job_id") |> option.from_result
          search_index_page.view(
            ctx,
            user_session,
            current_admin,
            flash_data,
            job_id,
          )
        }
        Post -> {
          use user_session <- with_session(req, ctx)
          let query = wisp.get_query(req)
          let action = list.key_find(query, "action") |> option.from_result
          case action {
            option.Some("reindex") -> {
              use form <- wisp.require_form(req)
              let index_type =
                list.key_find(form.values, "index_type") |> option.from_result
              search_index_page.handle_reindex(
                req,
                ctx,
                user_session,
                index_type,
              )
            }
            _ -> wisp.redirect(prepend_base_path(ctx, "/search-index"))
          }
        }
        _ -> wisp.method_not_allowed([Get, Post])
      }
    ["strange-place"] ->
      case req.method {
        Get -> {
          use user_session, current_admin <- with_session_and_admin(req, ctx)
          let flash_data = flash.from_request(req)
          strange_place_page.view(ctx, user_session, current_admin, flash_data)
        }
        _ -> wisp.method_not_allowed([Get])
      }
    [] -> {
      use _session, current_admin <- with_session_and_admin(req, ctx)
      let admin_acls = admin_acls_from(current_admin)
      redirect_to_home(ctx, admin_acls)
    }
    _ -> wisp.not_found()
  }
}

fn proxy_metrics_request(ctx: Context, path: String, req: Request) -> Response {
  case ctx.metrics_endpoint {
    option.None ->
      wisp.response(503)
      |> wisp.set_header("content-type", "application/json")
      |> wisp.string_body("{\"error\": \"Metrics service not configured\"}")
    option.Some(endpoint) -> {
      let query_string = case request.get_query(req) {
        Ok(params) ->
          case params != [] {
            True ->
              "?"
              <> string.join(
                list.map(params, fn(kv) { kv.0 <> "=" <> kv.1 }),
                "&",
              )
            False -> ""
          }
        Error(_) -> ""
      }
      let url = endpoint <> path <> query_string
      wisp.log_info("Proxying metrics request to: " <> url)

      case request.to(url) {
        Ok(proxy_req) -> {
          let proxy_req = proxy_req |> request.set_method(http.Get)
          case httpc.send(proxy_req) {
            Ok(resp) -> {
              wisp.log_info(
                "Metrics response: status="
                <> int.to_string(resp.status)
                <> " body_len="
                <> int.to_string(string.length(resp.body)),
              )
              wisp.response(resp.status)
              |> wisp.set_header("content-type", "application/json")
              |> wisp.string_body(resp.body)
            }
            Error(e) -> {
              wisp.log_error(
                "Failed to reach metrics service: " <> string.inspect(e),
              )
              wisp.response(502)
              |> wisp.set_header("content-type", "application/json")
              |> wisp.string_body(
                "{\"error\": \"Failed to reach metrics service\"}",
              )
            }
          }
        }
        Error(e) -> {
          wisp.log_error(
            "Invalid metrics endpoint URL: "
            <> url
            <> " error: "
            <> string.inspect(e),
          )
          wisp.response(500)
          |> wisp.set_header("content-type", "application/json")
          |> wisp.string_body("{\"error\": \"Invalid metrics endpoint URL\"}")
        }
      }
    }
  }
}

fn web_middleware(
  req: Request,
  handle_request: fn(Request) -> Response,
) -> Response {
  let req = wisp.method_override(req)
  use <- wisp.log_request(req)
  use <- wisp.rescue_crashes
  use req <- wisp.handle_head(req)

  handle_request(req)
}

fn queue_counts_response(
  ctx: Context,
  session: web.Session,
  current_admin: option.Option(common.UserLookupResult),
) -> Response {
  let admin_acls = case current_admin {
    option.Some(admin) -> admin.acls
    option.None -> []
  }

  // Each count is fetched only if the admin has the matching ACL. Failures
  // are silently ignored — the badge will simply not appear for that key.
  let pending_verifications = case
    acl.has_permission(admin_acls, constants.acl_pending_verification_view)
  {
    True ->
      case verifications.list_pending_verifications(ctx, session, 200) {
        Ok(resp) -> option.Some(list.length(resp.pending_verifications))
        Error(_) -> option.None
      }
    False -> option.None
  }

  let discovery_applications = case
    acl.has_permission(admin_acls, constants.acl_guild_discovery_review)
  {
    True ->
      case
        discovery_applications.list_applications(
          ctx,
          session,
          option.Some("pending"),
        )
      {
        Ok(resp) -> option.Some(list.length(resp.applications))
        Error(_) -> option.None
      }
    False -> option.None
  }

  let fields = []
  let fields = case pending_verifications {
    option.Some(n) -> [#("pending-verifications", json.int(n)), ..fields]
    option.None -> fields
  }
  let fields = case discovery_applications {
    option.Some(n) -> [#("discovery-applications", json.int(n)), ..fields]
    option.None -> fields
  }

  let body = json.object(fields) |> json.to_string
  wisp.json_response(body, 200)
}

fn ai_proxy_get(
  ctx: web.Context,
  session: web.Session,
  path: String,
) -> Response {
  let url = ctx.api_endpoint <> path
  case request.to(url) {
    Ok(req) -> {
      let req =
        req
        |> request.set_method(http.Get)
        |> request.set_header(
          "authorization",
          "Bearer " <> session.access_token,
        )
      case httpc.send(req) {
        Ok(resp) ->
          wisp.response(resp.status)
          |> wisp.set_header("content-type", "application/json")
          |> wisp.string_body(resp.body)
        Error(_) ->
          wisp.response(502)
          |> wisp.string_body("{\"error\":\"upstream error\"}")
      }
    }
    Error(_) ->
      wisp.response(500)
      |> wisp.string_body("{\"error\":\"bad url\"}")
  }
}

fn ai_proxy_post(
  ctx: web.Context,
  session: web.Session,
  path: String,
  body: String,
) -> Response {
  let url = ctx.api_endpoint <> path
  case request.to(url) {
    Ok(req) -> {
      let req =
        req
        |> request.set_method(http.Post)
        |> request.set_header(
          "authorization",
          "Bearer " <> session.access_token,
        )
        |> request.set_header("content-type", "application/json")
        |> request.set_body(body)
      case httpc.send(req) {
        Ok(resp) ->
          wisp.response(resp.status)
          |> wisp.set_header("content-type", "application/json")
          |> wisp.string_body(resp.body)
        Error(_) ->
          wisp.response(502)
          |> wisp.string_body("{\"error\":\"upstream error\"}")
      }
    }
    Error(_) ->
      wisp.response(500)
      |> wisp.string_body("{\"error\":\"bad url\"}")
  }
}
