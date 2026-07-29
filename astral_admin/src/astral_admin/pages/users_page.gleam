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

import astral_admin/api/users

import astral_admin/avatar

import astral_admin/badge

import astral_admin/components/errors

import astral_admin/components/flash

import astral_admin/components/layout

import astral_admin/components/pagination

import astral_admin/components/ui

import astral_admin/components/url_builder

import astral_admin/user

import astral_admin/web.{type Context, type Session, href}

import gleam/int

import gleam/list

import gleam/option

import gleam/string

import lustre/attribute as a

import lustre/element

import lustre/element/html as h

import wisp.{type Response}

pub fn view(
  ctx: Context,
  session: Session,
  current_admin: option.Option(common.UserLookupResult),
  flash_data: option.Option(flash.Flash),
  query: option.Option(String),
  email_verified: option.Option(Bool),
  has_premium: option.Option(Bool),
  is_bot: option.Option(Bool),
  page: Int,
) -> Response {
  let limit = 50

  let offset = page * limit

  let normalized_query =
    query
    |> option.map(string.trim)
    |> option.then(fn(value) {
      case value {
        "" -> option.None

        _ -> option.Some(value)
      }
    })
  let has_active_filters =
    option.is_some(email_verified)
    || option.is_some(has_premium)
    || option.is_some(is_bot)

  let result = case #(normalized_query, has_active_filters) {
    #(_, True) ->
      search_users_with_fallback(
        ctx,
        session,
        normalized_query,
        email_verified,
        has_premium,
        is_bot,
        limit,
        offset,
      )

    #(option.Some(_), False) ->
      search_users_with_fallback(
        ctx,
        session,
        normalized_query,
        email_verified,
        has_premium,
        is_bot,
        limit,
        offset,
      )

    #(option.None, False) -> Ok(users.SearchUsersResponse(users: [], total: 0))
  }

  let content = case result {
    Ok(response) -> {
      h.div([a.class("max-w-7xl mx-auto space-y-6")], [
        ui.flex_row_between([
          ui.heading_page("Пользователи"),

          case query {
            option.Some(_) ->
              h.div(
                [a.class("flex flex-col sm:flex-row sm:items-center gap-4")],
                [
                  h.span([a.class("text-sm text-zinc-400")], [
                    element.text(
                      "Найдено "
                      <> int.to_string(response.total)
                      <> " результатов (показано "
                      <> int.to_string(list.length(response.users))
                      <> ")",
                    ),
                  ]),
                ],
              )

            option.None -> element.none()
          },
        ]),

        render_search_form(ctx, query, email_verified, has_premium, is_bot),

        case list.is_empty(response.users) {
          True -> empty_search_results(normalized_query, has_active_filters)

          False ->
            h.div([], [
              render_users_grid(ctx, response.users),

              pagination.pagination(ctx, response.total, limit, page, fn(p) {
                build_pagination_url(
                  p,
                  normalized_query,
                  email_verified,
                  has_premium,
                  is_bot,
                )
              }),
            ])
        },
      ])
    }

    Error(err) -> errors.api_error_view(ctx, err, option.None, option.None)
  }

  let html =
    layout.page(
      "Пользователи",
      "users",
      ctx,
      session,
      current_admin,
      flash_data,
      content,
    )

  wisp.html_response(element.to_document_string(html), 200)
}

fn render_search_form(
  ctx: Context,
  query: option.Option(String),
  email_verified: option.Option(Bool),
  has_premium: option.Option(Bool),
  is_bot: option.Option(Bool),
) {
  ui.card(ui.PaddingSmall, [
    h.form([a.method("get"), a.class("flex flex-col gap-4")], [
      h.div([a.class("flex flex-col sm:flex-row gap-2")], [
        h.input([
          a.type_("text"),

          a.name("q"),

          a.value(option.unwrap(query, "")),

          a.placeholder("Поиск по ID, тегу, email, телефону или Stripe ID..."),

          a.class(
            "flex-1 min-w-0 px-4 py-2.5 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
          ),

          a.attribute("autocomplete", "off"),
        ]),

        ui.button_primary("Найти", "submit", [a.class("w-full sm:w-auto")]),

        h.a(
          [
            href(ctx, "/users"),

            a.class(
              "px-4 py-2.5 bg-zinc-950 text-zinc-300 border border-zinc-700 rounded-lg text-sm font-medium hover:bg-zinc-900 hover:text-zinc-100 transition-colors w-full sm:w-auto text-center",
            ),
          ],
          [element.text("Сбросить")],
        ),
      ]),
      h.div([a.class("grid grid-cols-1 md:grid-cols-3 gap-3")], [
        render_bool_filter(
          "Верификация email",
          "email_verified",
          email_verified,
          "Все",
          "Подтвержден",
          "Не подтвержден",
        ),
        render_bool_filter(
          "Подписка",
          "has_premium",
          has_premium,
          "Все",
          "Есть премиум",
          "Без премиума",
        ),
        render_bool_filter(
          "Тип аккаунта",
          "is_bot",
          is_bot,
          "Все",
          "Только боты",
          "Только пользователи",
        ),
      ]),

      h.p([a.class("text-xs text-zinc-500")], [
        element.text(
          "Поддерживается поиск по ID, тегу, email, телефону и Stripe ID.",
        ),
      ]),
    ]),
  ])
}

fn render_bool_filter(
  label: String,
  name: String,
  current: option.Option(Bool),
  all_label: String,
  true_label: String,
  false_label: String,
) {
  h.div([a.class("space-y-2")], [
    h.label([a.class("block text-sm font-medium text-zinc-300")], [
      element.text(label),
    ]),
    h.select(
      [
        a.name(name),
        a.class(
          "w-full px-3 py-2.5 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
        ),
      ],
      [
        bool_filter_option("", all_label, current),
        bool_filter_option("true", true_label, current),
        bool_filter_option("false", false_label, current),
      ],
    ),
  ])
}

fn bool_filter_option(
  value: String,
  label: String,
  current: option.Option(Bool),
) -> element.Element(a) {
  let selected = case #(value, current) {
    #("", option.None) -> True
    #("true", option.Some(True)) -> True
    #("false", option.Some(False)) -> True
    _ -> False
  }

  h.option([a.value(value), a.selected(selected)], label)
}

fn render_users_grid(ctx: Context, users: List(common.UserLookupResult)) {
  h.div(
    [a.class("grid grid-cols-1 gap-4")],
    list.map(users, fn(user) { render_user_card(ctx, user) }),
  )
}

fn render_user_card(ctx: Context, user: common.UserLookupResult) {
  let badges = badge.get_user_badges(ctx.cdn_endpoint, user.flags)

  h.div(
    [
      a.class(
        "bg-zinc-950/70 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors",
      ),
    ],
    [
      h.div([a.class("p-5")], [
        h.div([a.class("flex flex-col sm:flex-row sm:items-center gap-4")], [
          h.img([
            a.src(avatar.get_user_avatar_url(
              ctx.media_endpoint,
              ctx.cdn_endpoint,
              user.id,
              user.avatar,
              True,
              ctx.asset_version,
            )),
            a.attribute(
              "onerror",
              avatar.get_user_avatar_fallback_onerror(
                ctx.cdn_endpoint,
                user.id,
                ctx.asset_version,
              ),
            ),

            a.alt(user.username),

            a.class("w-16 h-16 rounded-full flex-shrink-0"),
          ]),

          h.div([a.class("flex-1 min-w-0")], [
            h.div([a.class("flex items-center gap-2 mb-1")], [
              h.h2([a.class("text-base font-medium text-zinc-100 break-all")], [
                element.text(
                  user.username
                  <> "#"
                  <> user.format_discriminator(user.discriminator),
                ),
              ]),

              case user.bot {
                True ->
                  h.span(
                    [
                      a.class(
                        "px-2 py-0.5 bg-sky-950/50 text-sky-300 border border-sky-900 rounded",
                      ),
                    ],
                    [element.text("Бот")],
                  )

                False -> element.none()
              },
            ]),

            case list.is_empty(badges) {
              False ->
                h.div(
                  [a.class("flex items-center gap-1.5 mb-2")],
                  list.map(badges, fn(b) {
                    h.img([
                      a.src(b.icon),

                      a.alt(b.name),

                      a.title(b.name),

                      a.class("w-5 h-5"),
                    ])
                  }),
                )

              True -> element.none()
            },

            h.div([a.class("flex flex-wrap gap-2 mb-2")], [
              case user.email_verified {
                True -> ui.pill("Email подтвержден", ui.PillSuccess)
                False -> ui.pill("Email не подтвержден", ui.PillWarning)
              },
              case user.has_totp {
                True -> ui.pill("2FA включен", ui.PillInfo)
                False -> ui.pill("2FA выключен", ui.PillNeutral)
              },
              case user.premium_type {
                option.Some(_) -> ui.pill("Премиум", ui.PillPrimary)
                option.None -> element.none()
              },
            ]),

            h.div([a.class("space-y-0.5")], [
              h.div([a.class("text-sm text-zinc-400")], [
                element.text("ID: " <> user.id),
              ]),

              case user.extract_timestamp(user.id) {
                Ok(created_at) ->
                  h.div([a.class("text-sm text-zinc-500")], [
                    element.text("Создан: " <> created_at),
                  ])

                Error(_) -> element.none()
              },
            ]),
          ]),

          h.a(
            [
              href(ctx, "/users/" <> user.id),

              a.class(
                "px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors flex-shrink-0 no-underline text-center w-full sm:w-auto",
              ),
            ],
            [element.text("Открыть")],
          ),
        ]),
      ]),
    ],
  )
}

fn search_users_with_fallback(
  ctx: Context,
  session: Session,
  query: option.Option(String),
  email_verified: option.Option(Bool),
  has_premium: option.Option(Bool),
  is_bot: option.Option(Bool),
  limit: Int,
  offset: Int,
) -> Result(users.SearchUsersResponse, common.ApiError) {
  case
    users.search_users(
      ctx,
      session,
      query,
      email_verified,
      has_premium,
      is_bot,
      limit,
      offset,
    )
  {
    Ok(response) ->
      case response.total > 0 || !list.is_empty(response.users) {
        True -> Ok(response)
        False ->
          lookup_user_fallback(
            ctx,
            session,
            query,
            email_verified,
            has_premium,
            is_bot,
            offset,
          )
      }

    Error(common.ServerError) ->
      lookup_user_fallback(
        ctx,
        session,
        query,
        email_verified,
        has_premium,
        is_bot,
        offset,
      )

    Error(common.NotFound) ->
      lookup_user_fallback(
        ctx,
        session,
        query,
        email_verified,
        has_premium,
        is_bot,
        offset,
      )

    Error(err) -> Error(err)
  }
}

fn lookup_user_fallback(
  ctx: Context,
  session: Session,
  query: option.Option(String),
  email_verified: option.Option(Bool),
  has_premium: option.Option(Bool),
  is_bot: option.Option(Bool),
  offset: Int,
) -> Result(users.SearchUsersResponse, common.ApiError) {
  case offset > 0 {
    True -> Ok(users.SearchUsersResponse(users: [], total: 0))
    False ->
      case query {
        option.Some(search_query) ->
          case users.lookup_user(ctx, session, search_query) {
            Ok(option.Some(user)) ->
              case
                user_matches_filters(user, email_verified, has_premium, is_bot)
              {
                True -> Ok(users.SearchUsersResponse(users: [user], total: 1))
                False -> Ok(users.SearchUsersResponse(users: [], total: 0))
              }

            Ok(option.None) ->
              Ok(users.SearchUsersResponse(users: [], total: 0))
            Error(err) -> Error(err)
          }

        option.None -> Ok(users.SearchUsersResponse(users: [], total: 0))
      }
  }
}

fn user_matches_filters(
  user: common.UserLookupResult,
  email_verified: option.Option(Bool),
  has_premium: option.Option(Bool),
  is_bot: option.Option(Bool),
) -> Bool {
  let email_matches = case email_verified {
    option.Some(value) -> user.email_verified == value
    option.None -> True
  }
  let premium_matches = case has_premium {
    option.Some(True) -> option.is_some(user.premium_type)
    option.Some(False) -> option.is_none(user.premium_type)
    option.None -> True
  }
  let bot_matches = case is_bot {
    option.Some(value) -> user.bot == value
    option.None -> True
  }

  email_matches && premium_matches && bot_matches
}

fn build_pagination_url(
  page: Int,
  query: option.Option(String),
  email_verified: option.Option(Bool),
  has_premium: option.Option(Bool),
  is_bot: option.Option(Bool),
) -> String {
  url_builder.build_url("/users", [
    #("page", option.Some(int.to_string(page))),

    #("q", query),
    #("email_verified", bool_param(email_verified)),
    #("has_premium", bool_param(has_premium)),
    #("is_bot", bool_param(is_bot)),
  ])
}

fn bool_param(value: option.Option(Bool)) -> option.Option(String) {
  case value {
    option.Some(True) -> option.Some("true")
    option.Some(False) -> option.Some("false")
    option.None -> option.None
  }
}

fn empty_search_results(query: option.Option(String), has_active_filters: Bool) {
  case #(query, has_active_filters) {
    #(option.Some(_), _) ->
      ui.card_empty([
        ui.text_muted("Пользователи не найдены"),

        ui.text_small_muted("Попробуй изменить запрос или фильтры"),
      ])

    #(option.None, True) ->
      ui.card_empty([
        ui.text_muted("Пользователи не найдены"),

        ui.text_small_muted("Попробуй изменить запрос или фильтры"),
      ])

    #(option.None, False) ->
      ui.card_empty([
        ui.text_muted("Справочник пользователей пуст"),

        ui.text_small_muted(
          "Начни поиск по ID, тегу, email, телефону или Stripe ID",
        ),
      ])
  }
}
