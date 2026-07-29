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
import astral_admin/api/guilds
import astral_admin/avatar
import astral_admin/components/errors
import astral_admin/components/flash
import astral_admin/components/layout
import astral_admin/components/pagination
import astral_admin/components/ui
import astral_admin/components/url_builder
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

  let result = case normalized_query {
    option.Some(_) ->
      guilds.search_guilds(ctx, session, normalized_query, limit, offset)
    option.None -> Ok(guilds.SearchGuildsResponse(guilds: [], total: 0))
  }

  let content = case result {
    Ok(response) -> {
      h.div([a.class("max-w-7xl mx-auto space-y-6")], [
        ui.flex_row_between([
          ui.heading_page("Серверы"),
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
                      <> int.to_string(list.length(response.guilds))
                      <> ")",
                    ),
                  ]),
                ],
              )
            option.None -> element.none()
          },
        ]),
        render_search_form(ctx, query),
        case list.is_empty(response.guilds) {
          True -> empty_search_results(normalized_query)
          False ->
            h.div([], [
              render_guilds_grid(ctx, response.guilds),
              pagination.pagination(ctx, response.total, limit, page, fn(p) {
                build_pagination_url(p, normalized_query)
              }),
            ])
        },
      ])
    }
    Error(err) -> errors.api_error_view(ctx, err, option.None, option.None)
  }

  let html =
    layout.page(
      "Серверы",
      "guilds",
      ctx,
      session,
      current_admin,
      flash_data,
      content,
    )
  wisp.html_response(element.to_document_string(html), 200)
}

fn render_search_form(ctx: Context, query: option.Option(String)) {
  ui.card(ui.PaddingSmall, [
    h.form([a.method("get"), a.class("flex flex-col gap-4")], [
      h.div([a.class("flex flex-col sm:flex-row gap-2")], [
        h.input([
          a.type_("text"),
          a.name("q"),
          a.value(option.unwrap(query, "")),
          a.placeholder("Поиск по ID, названию сервера или vanity URL..."),
          a.class(
            "flex-1 px-4 py-2 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
          ),
          a.attribute("autocomplete", "off"),
        ]),
        ui.button_primary("Поиск", "submit", [a.class("w-full sm:w-auto")]),
        h.a(
          [
            href(ctx, "/guilds"),
            a.class(
              "px-4 py-2 bg-zinc-950 text-zinc-300 border border-zinc-700 rounded-lg text-sm font-medium hover:bg-zinc-900 transition-colors w-full sm:w-auto text-center",
            ),
          ],
          [element.text("Сбросить")],
        ),
      ]),
      h.p([a.class("text-xs text-zinc-500")], [
        element.text(
          "Поиск поддерживает: ID сервера, название, vanity URL и другое",
        ),
      ]),
    ]),
  ])
}

fn render_guilds_grid(ctx: Context, guilds: List(guilds.GuildSearchResult)) {
  h.div(
    [a.class("grid grid-cols-1 gap-4")],
    list.map(guilds, fn(guild) { render_guild_card(ctx, guild) }),
  )
}

fn render_guild_card(ctx: Context, guild: guilds.GuildSearchResult) {
  h.div(
    [
      a.class(
        "bg-zinc-950/80 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors",
      ),
    ],
    [
      h.div([a.class("p-5")], [
        h.div([a.class("flex flex-col sm:flex-row sm:items-center gap-4")], [
          case
            avatar.get_guild_icon_url(
              ctx.media_endpoint,
              guild.id,
              guild.icon,
              True,
            )
          {
            option.Some(icon_url) ->
              h.div(
                [
                  a.class(
                    "flex-shrink-0 flex items-center sm:block justify-center",
                  ),
                ],
                [
                  h.img([
                    a.src(icon_url),
                    a.alt(guild.name),
                    a.class("w-16 h-16 rounded-full"),
                  ]),
                ],
              )
            option.None ->
              h.div(
                [
                  a.class(
                    "flex-shrink-0 flex items-center sm:block justify-center",
                  ),
                ],
                [
                  h.div(
                    [
                      a.class(
                        "w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-base font-medium text-zinc-300",
                      ),
                    ],
                    [element.text(avatar.get_initials_from_name(guild.name))],
                  ),
                ],
              )
          },
          h.div([a.class("flex-1 min-w-0")], [
            h.div([a.class("flex items-center gap-2 mb-2 flex-wrap")], [
              h.h2([a.class("text-base font-medium text-zinc-100 break-all")], [
                element.text(guild.name),
              ]),
              case list.is_empty(guild.features) {
                False ->
                  h.span(
                    [
                      a.class(
                        "px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded uppercase",
                      ),
                    ],
                    [element.text("Рекомендуемый")],
                  )
                True -> element.none()
              },
            ]),
            h.div([a.class("space-y-0.5")], [
              h.div([a.class("text-sm text-zinc-400 break-all")], [
                element.text("ID: " <> guild.id),
              ]),
              h.div([a.class("text-sm text-zinc-400")], [
                element.text("Участники: " <> int.to_string(guild.member_count)),
              ]),
              h.div([a.class("text-sm text-zinc-400")], [
                element.text("Владелец: "),
                h.a(
                  [
                    href(ctx, "/users/" <> guild.owner_id),
                    a.class(
                      "hover:text-blue-600 hover:underline transition-colors",
                    ),
                  ],
                  [element.text(guild.owner_id)],
                ),
              ]),
            ]),
          ]),
          h.a(
            [
              href(ctx, "/guilds/" <> guild.id),
              a.class(
                "px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm hover:bg-neutral-800 transition-colors flex-shrink-0 no-underline text-center w-full sm:w-auto",
              ),
            ],
            [element.text("Открыть")],
          ),
        ]),
      ]),
    ],
  )
}

fn build_pagination_url(page: Int, query: option.Option(String)) -> String {
  url_builder.build_url("/guilds", [
    #("page", option.Some(int.to_string(page))),
    #("q", query),
  ])
}

fn empty_search_results(query: option.Option(String)) {
  case query {
    option.Some(_) ->
      ui.card_empty([
        ui.text_muted("No guilds found"),
        ui.text_small_muted("Измени поисковый запрос"),
      ])
    option.None ->
      ui.card_empty([
        ui.text_muted("No guilds available"),
        ui.text_small_muted("Каталог серверов пуст или еще не проиндексирован"),
      ])
  }
}
