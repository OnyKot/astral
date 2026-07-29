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

import birl
import birl/duration
import astral_admin/api/common
import astral_admin/api/reports
import astral_admin/components/date_time
import astral_admin/components/flash
import astral_admin/components/layout
import astral_admin/components/ui
import astral_admin/web.{type Context, type Session, action, href}
import gleam/int
import gleam/list
import gleam/option
import gleam/order
import gleam/string
import gleam/uri
import lustre/attribute as a
import lustre/element
import lustre/element/html as h
import wisp.{type Response}

// Severity classification — drives the colored pill in the reports table.
// Categories that can mean immediate harm (CSAM, doxxing, real-world danger)
// are HIGH; targeted abuse and platform-policy violations are MEDIUM; the rest
// fall to LOW.
fn category_severity(category: String) -> String {
  case category {
    "child_safety"
    | "doxxing"
    | "self_harm"
    | "illegal_activity"
    | "malware_distribution"
    | "extremist_community"
    | "raid_coordination" -> "high"
    "harassment"
    | "hate_speech"
    | "violent_content"
    | "nsfw_violation"
    | "impersonation"
    | "malicious_links"
    | "underage_user" -> "medium"
    _ -> "low"
  }
}

// SLA target in hours by severity. An open report past this is overdue.
fn sla_hours_for(severity: String) -> Int {
  case severity {
    "high" -> 4
    "medium" -> 24
    _ -> 72
  }
}

fn severity_pill(severity: String) -> element.Element(a) {
  let #(label, classes) = case severity {
    "high" -> #("HIGH", "bg-red-500/15 text-red-300 border-red-500/40")
    "medium" -> #("MED", "bg-amber-500/15 text-amber-300 border-amber-500/40")
    _ -> #("LOW", "bg-zinc-700/40 text-zinc-300 border-zinc-700")
  }
  h.span(
    [
      a.class(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border tracking-wider "
        <> classes,
      ),
    ],
    [element.text(label)],
  )
}

fn sla_badge(
  reported_at: String,
  status: Int,
  severity: String,
) -> element.Element(a) {
  // Resolved reports show no SLA badge.
  case status {
    0 ->
      case birl.parse(reported_at) {
        Ok(reported_time) -> {
          let now = birl.now()
          let elapsed = birl.difference(now, reported_time)
          let elapsed_hours = duration.blur_to(elapsed, duration.Hour)
          let sla = sla_hours_for(severity)
          case elapsed_hours >= sla {
            True ->
              h.span(
                [
                  a.class(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-300 border border-red-500/40",
                  ),
                  a.title(
                    "SLA "
                    <> int.to_string(sla)
                    <> "h exceeded by "
                    <> int.to_string(elapsed_hours - sla)
                    <> "h",
                  ),
                ],
                [element.text("SLA OVERDUE")],
              )
            False ->
              h.span(
                [
                  a.class(
                    "inline-flex items-center px-2 py-0.5 rounded text-[10px] text-zinc-400",
                  ),
                ],
                [
                  element.text(int.to_string(sla - elapsed_hours) <> "h left"),
                ],
              )
          }
        }
        Error(_) -> element.none()
      }
    _ -> element.none()
  }
}

const report_category_options = [
  #("harassment", "Оскорбления или травля"),
  #("hate_speech", "Разжигание ненависти"),
  #("spam", "Спам или мошенничество"),
  #("illegal_activity", "Незаконная деятельность"),
  #("impersonation", "Выдача себя за другого"),
  #("child_safety", "Угрозы безопасности детей"),
  #("other", "Другое"),
  #("violent_content", "Жестокий или шок-контент"),
  #("nsfw_violation", "Нарушение NSFW-политики"),
  #("doxxing", "Раскрытие личных данных"),
  #("self_harm", "Самоповреждение или суицид"),
  #("malicious_links", "Вредоносные ссылки"),
  #("spam_account", "Спам-аккаунт"),
  #("underage_user", "Несовершеннолетний пользователь"),
  #("inappropriate_profile", "Неподобающий профиль"),
  #("raid_coordination", "Координация рейдов"),
  #("malware_distribution", "Распространение вредоносного ПО"),
  #("extremist_community", "Экстремистское сообщество"),
]

fn sort_option(
  value: String,
  label: String,
  current: option.Option(String),
) -> element.Element(a) {
  h.option([a.value(value), a.selected(current == option.Some(value))], label)
}

fn limit_option(value: Int, current: Int) -> element.Element(a) {
  h.option(
    [a.value(int.to_string(value)), a.selected(value == current)],
    int.to_string(value),
  )
}

fn quick_filter_chip(
  ctx: Context,
  label: String,
  status_filter: option.Option(Int),
  type_filter: option.Option(Int),
  category_filter: option.Option(String),
  query: option.Option(String),
  sort: option.Option(String),
  limit: Int,
) -> element.Element(a) {
  let url =
    build_pagination_url(
      0,
      query,
      status_filter,
      type_filter,
      category_filter,
      sort,
      limit,
    )

  h.a(
    [
      href(ctx, url),
      a.class(
        "px-3 py-1.5 bg-zinc-950 text-zinc-300 border border-zinc-700 rounded-full text-sm hover:bg-zinc-900 hover:text-zinc-100 transition-colors",
      ),
    ],
    [element.text(label)],
  )
}

fn selection_toolbar() -> element.Element(a) {
  h.div(
    [
      a.class(
        "flex items-center justify-between gap-3 bg-zinc-950/80 border border-zinc-800 rounded-xl px-4 py-3 mb-3 shadow-xs",
      ),
      a.attribute("data-report-toolbar", "true"),
    ],
    [
      h.div([a.class("flex items-center gap-2")], [
        h.input([
          a.type_("checkbox"),
          a.class("h-4 w-4 rounded border-neutral-300"),
          a.attribute("data-report-select-all", "true"),
        ]),
        h.span([a.class("text-sm text-zinc-300")], [
          element.text("Выбрать все на странице"),
        ]),
      ]),
      h.div([a.class("flex items-center gap-2 flex-wrap")], [
        h.span(
          [
            a.attribute("data-report-selected-count", "true"),
            a.class("text-sm text-zinc-400"),
          ],
          [element.text("0 выбрано")],
        ),
        h.button(
          [
            a.attribute("data-report-bulk-resolve-with-note", "true"),
            a.class(
              "px-3 py-1.5 bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-700 transition-colors",
            ),
            a.disabled(True),
          ],
          [element.text("Закрыть с комментарием")],
        ),
        h.button(
          [
            a.attribute("data-report-bulk-resolve", "true"),
            a.class(
              "px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed",
            ),
            a.disabled(True),
          ],
          [element.text("Закрыть выбранные")],
        ),
      ]),
    ],
  )
}

pub fn view(
  ctx: Context,
  session: Session,
  current_admin: option.Option(common.UserLookupResult),
  flash_data: option.Option(flash.Flash),
  query: option.Option(String),
  status_filter: option.Option(Int),
  type_filter: option.Option(Int),
  category_filter: option.Option(String),
  page: Int,
  limit: Int,
  sort: option.Option(String),
) -> Response {
  view_with_mode(
    ctx,
    session,
    current_admin,
    flash_data,
    query,
    status_filter,
    type_filter,
    category_filter,
    page,
    limit,
    sort,
  )
}

pub fn view_with_mode(
  ctx: Context,
  session: Session,
  current_admin: option.Option(common.UserLookupResult),
  flash_data: option.Option(flash.Flash),
  query: option.Option(String),
  status_filter: option.Option(Int),
  type_filter: option.Option(Int),
  category_filter: option.Option(String),
  page: Int,
  limit: Int,
  sort: option.Option(String),
) -> Response {
  let offset = page * limit

  let result =
    reports.search_reports(
      ctx,
      session,
      query,
      status_filter,
      type_filter,
      category_filter,
      limit,
      offset,
    )

  let content = case result {
    Ok(response) -> {
      let sorted_reports = sort_reports(response.reports, sort)
      h.div([a.class("max-w-7xl mx-auto space-y-5 pb-8")], [
        ui.flex_row_between([
          ui.heading_page("Репорты"),
          h.div([a.class("flex items-center gap-4")], [
            h.span([a.class("body-sm text-zinc-400")], [
              element.text(
                "Найдено "
                <> int.to_string(response.total)
                <> " результатов (показано "
                <> int.to_string(list.length(sorted_reports))
                <> ")",
              ),
            ]),
          ]),
        ]),
        render_filters(
          ctx,
          query,
          status_filter,
          type_filter,
          category_filter,
          sort,
          limit,
        ),
        case list.is_empty(response.reports) {
          True -> empty_state()
          False ->
            h.div([a.class("mt-4")], [
              selection_toolbar(),
              render_reports_table(ctx, sorted_reports),
              render_pagination(
                ctx,
                response.total,
                response.offset,
                response.limit,
                page,
                query,
                status_filter,
                type_filter,
                category_filter,
                sort,
              ),
            ])
        },
      ])
    }
    Error(err) -> error_view(err)
  }

  let html =
    layout.page(
      "Репорты",
      "reports",
      ctx,
      session,
      current_admin,
      flash_data,
      h.div([], [content, reports_script()]),
    )
  wisp.html_response(element.to_document_string(html), 200)
}

fn render_filters(
  ctx: Context,
  query: option.Option(String),
  status_filter: option.Option(Int),
  type_filter: option.Option(Int),
  category_filter: option.Option(String),
  sort: option.Option(String),
  limit: Int,
) {
  h.div(
    [
      a.class(
        "bg-zinc-950/80 border border-zinc-800 rounded-xl p-5 mb-6 shadow-xs",
      ),
    ],
    [
      h.form([a.method("get"), a.class("space-y-4")], [
        h.div([a.class("flex flex-wrap gap-2")], [
          quick_filter_chip(
            ctx,
            "Ожидает",
            option.Some(0),
            type_filter,
            category_filter,
            query,
            sort,
            limit,
          ),
          quick_filter_chip(
            ctx,
            "Закрыт",
            option.Some(1),
            type_filter,
            category_filter,
            query,
            sort,
            limit,
          ),
          quick_filter_chip(
            ctx,
            "Сообщение",
            status_filter,
            option.Some(0),
            category_filter,
            query,
            sort,
            limit,
          ),
          quick_filter_chip(
            ctx,
            "Пользователь",
            status_filter,
            option.Some(1),
            category_filter,
            query,
            sort,
            limit,
          ),
          quick_filter_chip(
            ctx,
            "Сервер",
            status_filter,
            option.Some(2),
            category_filter,
            query,
            sort,
            limit,
          ),
        ]),
        h.div([a.class("w-full")], [
          h.label([a.class("block body-sm text-zinc-300 mb-2")], [
            element.text("Поиск"),
          ]),
          h.input([
            a.type_("text"),
            a.name("q"),
            a.value(option.unwrap(query, "")),
            a.placeholder("Поиск по ID, автору, категории или описанию..."),
            a.class(
              "w-full px-3 py-2.5 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
            ),
          ]),
        ]),
        h.div([a.class("grid grid-cols-1 md:grid-cols-4 gap-4")], [
          h.div([a.class("flex-1")], [
            h.label([a.class("block body-sm text-zinc-300 mb-2")], [
              element.text("Статус"),
            ]),
            h.select(
              [
                a.name("status"),
                a.class(
                  "w-full px-3 py-2.5 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
                ),
              ],
              [
                h.option(
                  [a.value(""), a.selected(option.is_none(status_filter))],
                  "Все",
                ),
                h.option(
                  [a.value("0"), a.selected(status_filter == option.Some(0))],
                  "Ожидает",
                ),
                h.option(
                  [a.value("1"), a.selected(status_filter == option.Some(1))],
                  "Закрыт",
                ),
              ],
            ),
          ]),
          h.div([a.class("flex-1")], [
            h.label([a.class("block body-sm text-zinc-300 mb-2")], [
              element.text("Тип"),
            ]),
            h.select(
              [
                a.name("type"),
                a.class(
                  "w-full px-3 py-2.5 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
                ),
              ],
              [
                h.option(
                  [a.value(""), a.selected(option.is_none(type_filter))],
                  "Все",
                ),
                h.option(
                  [a.value("0"), a.selected(type_filter == option.Some(0))],
                  "Сообщение",
                ),
                h.option(
                  [a.value("1"), a.selected(type_filter == option.Some(1))],
                  "Пользователь",
                ),
                h.option(
                  [a.value("2"), a.selected(type_filter == option.Some(2))],
                  "Сервер",
                ),
              ],
            ),
          ]),
          {
            let selected_category = option.unwrap(category_filter, "")
            let category_select_children =
              list.append(
                [
                  h.option(
                    [a.value(""), a.selected(option.is_none(category_filter))],
                    "Все",
                  ),
                ],
                list.map(report_category_options, fn(option_pair) {
                  let #(value, label) = option_pair
                  h.option(
                    [a.value(value), a.selected(selected_category == value)],
                    label,
                  )
                }),
              )

            h.div([a.class("flex-1")], [
              h.label([a.class("block body-sm text-zinc-300 mb-2")], [
                element.text("Категория"),
              ]),
              h.select(
                [
                  a.name("category"),
                  a.class(
                    "w-full px-3 py-2.5 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
                  ),
                ],
                category_select_children,
              ),
            ])
          },
          h.div([a.class("flex-1")], [
            h.label([a.class("block body-sm text-zinc-300 mb-2")], [
              element.text("Сортировка"),
            ]),
            h.select(
              [
                a.name("sort"),
                a.class(
                  "w-full px-3 py-2.5 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
                ),
              ],
              [
                sort_option("reported_at_desc", "Сначала новые", sort),
                sort_option("reported_at_asc", "Сначала старые", sort),
                sort_option("status_asc", "Статус: по возрастанию", sort),
                sort_option("status_desc", "Статус: по убыванию", sort),
              ],
            ),
          ]),
          h.div([a.class("flex-1")], [
            h.label([a.class("block body-sm text-zinc-300 mb-2")], [
              element.text("Размер страницы"),
            ]),
            h.select(
              [
                a.name("limit"),
                a.class(
                  "w-full px-3 py-2.5 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
                ),
              ],
              [
                limit_option(25, limit),
                limit_option(50, limit),
                limit_option(100, limit),
                limit_option(150, limit),
              ],
            ),
          ]),
        ]),
        h.div([a.class("flex gap-2")], [
          h.button(
            [
              a.type_("submit"),
              a.class(
                "px-4 py-2 bg-neutral-900 text-white rounded-lg label hover:bg-neutral-800 transition-colors",
              ),
            ],
            [element.text("Найти и отфильтровать")],
          ),
          h.a(
            [
              href(ctx, "/reports"),
              a.class(
                "px-4 py-2 bg-zinc-950 text-zinc-300 border border-zinc-700 rounded-lg label hover:bg-zinc-900 hover:text-zinc-100 transition-colors",
              ),
            ],
            [element.text("Сбросить")],
          ),
        ]),
      ]),
    ],
  )
}

fn render_reports_table(ctx: Context, reports: List(reports.SearchReportResult)) {
  let base_cell = ui.table_cell_class

  let columns = [
    ui.TableColumn(
      "",
      base_cell <> " w-10",
      fn(report: reports.SearchReportResult) {
        case report.status == 0 {
          True ->
            h.input([
              a.type_("checkbox"),
              a.class("h-4 w-4 rounded"),
              a.attribute("data-report-select", report.report_id),
            ])
          False ->
            h.input([
              a.type_("checkbox"),
              a.class("h-4 w-4 rounded opacity-30 cursor-not-allowed"),
              a.disabled(True),
              a.attribute("aria-label", "Report already resolved"),
            ])
        }
      },
    ),
    ui.TableColumn(
      "Reported At",
      base_cell <> " whitespace-nowrap",
      fn(report: reports.SearchReportResult) {
        let severity = category_severity(report.category)
        h.div([a.class("flex flex-col gap-1")], [
          h.div([a.class("text-sm text-zinc-100")], [
            element.text(date_time.format_timestamp(report.reported_at)),
          ]),
          sla_badge(report.reported_at, report.status, severity),
        ])
      },
    ),
    ui.TableColumn(
      "Severity",
      "px-4 py-4 whitespace-nowrap",
      fn(report: reports.SearchReportResult) {
        severity_pill(category_severity(report.category))
      },
    ),
    ui.TableColumn(
      "Type",
      "px-6 py-4 whitespace-nowrap",
      fn(report: reports.SearchReportResult) {
        report_type_pill(report.report_type)
      },
    ),
    ui.TableColumn(
      "Category",
      base_cell <> " break-words",
      fn(report: reports.SearchReportResult) { element.text(report.category) },
    ),
    ui.TableColumn(
      "Reporter",
      "px-6 py-4 whitespace-nowrap text-sm",
      fn(report: reports.SearchReportResult) {
        render_reporter_cell(ctx, report)
      },
    ),
    ui.TableColumn(
      "Reported",
      "px-6 py-4 whitespace-nowrap text-sm",
      fn(report: reports.SearchReportResult) {
        render_reported_cell(ctx, report)
      },
    ),
    ui.TableColumn(
      "Status",
      "px-6 py-4 whitespace-nowrap",
      fn(report: reports.SearchReportResult) {
        status_pill(report.report_id, report.status)
      },
    ),
    ui.TableColumn(
      "Actions",
      "px-6 py-4 whitespace-nowrap text-sm",
      fn(report: reports.SearchReportResult) {
        render_actions_cell(ctx, report)
      },
    ),
  ]

  h.div([a.attribute("data-report-table", "true")], [
    ui.data_table(columns, reports),
  ])
}

fn render_reported_cell(ctx: Context, report: reports.SearchReportResult) {
  case report.report_type {
    0 -> render_reported_user_cell(ctx, report)
    1 -> render_reported_user_cell(ctx, report)
    2 -> render_reported_guild_cell(ctx, report)
    _ ->
      h.span([a.class("text-sm text-zinc-500 italic")], [
        element.text("Unknown"),
      ])
  }
}

fn render_reporter_cell(ctx: Context, report: reports.SearchReportResult) {
  let primary = case report.reporter_tag {
    option.Some(tag) -> tag
    option.None ->
      case report.reporter_email {
        option.Some(email) -> email
        option.None -> "Anonymous"
      }
  }

  let primary_element = case report.reporter_id {
    option.Some(id) ->
      h.a(
        [
          href(ctx, "/users/" <> id),
          a.class(
            "text-sm text-zinc-100 hover:text-indigo-300 underline decoration-zinc-700 hover:decoration-indigo-500",
          ),
        ],
        [element.text(primary)],
      )
    option.None ->
      h.span([a.class("text-sm text-zinc-100")], [element.text(primary)])
  }

  let detail_values = []
  let detail_values = case report.reporter_full_legal_name {
    option.Some(full_name) -> list.append(detail_values, [full_name])
    option.None -> detail_values
  }

  let detail_values = case report.reporter_country_of_residence {
    option.Some(country) -> list.append(detail_values, [country])
    option.None -> detail_values
  }

  let secondary = case list.is_empty(detail_values) {
    True -> element.none()
    False ->
      h.div(
        [a.class("flex flex-col gap-1 text-xs text-zinc-500")],
        list.map(detail_values, fn(value) { h.div([], [element.text(value)]) }),
      )
  }

  h.div([a.class("flex flex-col gap-1")], [
    primary_element,
    secondary,
  ])
}

fn render_reported_user_cell(ctx: Context, report: reports.SearchReportResult) {
  let primary_text = format_user_tag(report)
  case report.reported_user_id {
    option.Some(id) ->
      h.a(
        [
          href(ctx, "/users/" <> id),
          a.class(
            "text-sm text-zinc-100 hover:text-indigo-300 underline decoration-zinc-700 hover:decoration-indigo-500",
          ),
        ],
        [element.text(primary_text)],
      )
    option.None ->
      h.span([a.class("text-sm text-zinc-100")], [element.text(primary_text)])
  }
}

fn render_reported_guild_cell(ctx: Context, report: reports.SearchReportResult) {
  case report.reported_guild_id {
    option.Some(guild_id) -> {
      let primary_name = case report.reported_guild_name {
        option.Some(name) -> name
        option.None -> "Сервер " <> guild_id
      }
      let primary_element =
        h.a(
          [
            href(ctx, "/guilds/" <> guild_id),
            a.class(
              "text-sm text-zinc-100 hover:text-indigo-300 underline decoration-zinc-700 hover:decoration-indigo-500",
            ),
          ],
          [element.text(primary_name)],
        )
      let detail_lines = case report.reported_guild_invite_code {
        option.Some(code) -> [element.text("Invite: " <> code)]
        option.None -> []
      }
      let secondary = case list.is_empty(detail_lines) {
        True -> element.none()
        False -> h.div([a.class("text-xs text-zinc-500")], detail_lines)
      }
      h.div([a.class("flex flex-col gap-1")], [primary_element, secondary])
    }
    option.None ->
      h.span([a.class("text-sm text-zinc-500 italic")], [element.text("-")])
  }
}

fn compare_reports(
  sort_key: String,
  a: reports.SearchReportResult,
  b: reports.SearchReportResult,
) -> Bool {
  case sort_key {
    "reported_at_asc" ->
      string.compare(a.reported_at, b.reported_at) == order.Lt
    "status_asc" ->
      case a.status == b.status {
        True -> string.compare(a.reported_at, b.reported_at) == order.Lt
        False -> a.status < b.status
      }
    "status_desc" ->
      case a.status == b.status {
        True -> string.compare(a.reported_at, b.reported_at) == order.Lt
        False -> a.status > b.status
      }
    _ ->
      case string.compare(a.reported_at, b.reported_at) {
        order.Gt -> True
        order.Eq ->
          case string.compare(a.report_id, b.report_id) {
            order.Lt -> True
            _ -> False
          }
        order.Lt -> False
      }
  }
}

fn insert_sorted(
  acc: List(reports.SearchReportResult),
  item: reports.SearchReportResult,
  sort_key: String,
) -> List(reports.SearchReportResult) {
  case acc {
    [] -> [item]
    [head, ..tail] ->
      case compare_reports(sort_key, item, head) {
        True -> [item, ..acc]
        False -> [head, ..insert_sorted(tail, item, sort_key)]
      }
  }
}

fn sort_reports(
  reports_list: List(reports.SearchReportResult),
  sort: option.Option(String),
) -> List(reports.SearchReportResult) {
  let sort_key = option.unwrap(sort, "reported_at_desc")
  list.fold(reports_list, [], fn(acc, item) {
    insert_sorted(acc, item, sort_key)
  })
}

fn format_user_tag(report: reports.SearchReportResult) -> String {
  case report.reported_user_tag {
    option.Some(tag) -> tag
    option.None ->
      case report.reported_user_username {
        option.Some(username) -> {
          let discriminator =
            option.unwrap(report.reported_user_discriminator, "0000")
          username <> "#" <> discriminator
        }
        option.None ->
          "Пользователь " <> option.unwrap(report.reported_user_id, "unknown")
      }
  }
}

fn render_actions_cell(ctx: Context, report: reports.SearchReportResult) {
  let resolve_button = case report.status == 0 {
    True ->
      h.form(
        [
          a.method("post"),
          action(ctx, "/reports/" <> report.report_id <> "/resolve"),
          a.attribute("data-report-action", "resolve"),
          a.attribute("data-report-id", report.report_id),
          a.attribute("data-confirm", "Закрыть этот репорт?"),
          a.attribute("data-async", "true"),
        ],
        [
          h.input([a.type_("hidden"), a.name("_method"), a.value("post")]),
          h.input([
            a.type_("hidden"),
            a.name("public_comment"),
            a.value(""),
          ]),
          h.button(
            [
              a.type_("submit"),
              a.class(
                "px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-colors",
              ),
            ],
            [element.text("Закрыть")],
          ),
        ],
      )
    False -> element.none()
  }

  h.div([a.class("flex flex-col gap-2")], [
    h.div([a.class("flex flex-wrap gap-2")], [
      h.a(
        [
          href(ctx, "/reports/" <> report.report_id),
          a.class(
            "inline-flex items-center px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-500 transition-colors",
          ),
        ],
        [element.text("Открыть")],
      ),
      resolve_button,
    ]),
  ])
}

fn render_pagination(
  ctx: Context,
  total: Int,
  _offset: Int,
  limit: Int,
  current_page: Int,
  query: option.Option(String),
  status_filter: option.Option(Int),
  type_filter: option.Option(Int),
  category_filter: option.Option(String),
  sort: option.Option(String),
) {
  let total_pages = { total + limit - 1 } / limit
  let has_previous = current_page > 0
  let has_next = current_page < total_pages - 1

  h.div([a.class("mt-6 flex justify-center gap-3 items-center")], [
    case has_previous {
      True -> {
        let prev_url =
          build_pagination_url(
            current_page - 1,
            query,
            status_filter,
            type_filter,
            category_filter,
            sort,
            limit,
          )

        h.a(
          [
            href(ctx, prev_url),
            a.class(
              "px-6 py-2 bg-zinc-950 text-zinc-100 border border-zinc-700 rounded-lg label hover:bg-zinc-900 transition-colors",
            ),
          ],
          [element.text("< Назад")],
        )
      }
      False ->
        h.div(
          [
            a.class(
              "px-6 py-2 bg-zinc-950/70 text-zinc-600 border border-zinc-800 rounded-lg label cursor-not-allowed",
            ),
          ],
          [element.text("< Назад")],
        )
    },
    h.span([a.class("body-sm text-zinc-400")], [
      element.text(
        "Страница "
        <> int.to_string(current_page + 1)
        <> " из "
        <> int.to_string(total_pages),
      ),
    ]),
    case has_next {
      True -> {
        let next_url =
          build_pagination_url(
            current_page + 1,
            query,
            status_filter,
            type_filter,
            category_filter,
            sort,
            limit,
          )

        h.a(
          [
            href(ctx, next_url),
            a.class(
              "px-6 py-2 bg-neutral-900 text-white rounded-lg label hover:bg-neutral-800 transition-colors",
            ),
          ],
          [element.text("Далее >")],
        )
      }
      False ->
        h.div(
          [
            a.class(
              "px-6 py-2 bg-zinc-950/70 text-zinc-600 rounded-lg label cursor-not-allowed",
            ),
          ],
          [element.text("Далее >")],
        )
    },
  ])
}

fn build_pagination_url(
  page: Int,
  query: option.Option(String),
  status_filter: option.Option(Int),
  type_filter: option.Option(Int),
  category_filter: option.Option(String),
  sort: option.Option(String),
  limit: Int,
) -> String {
  let base = "/reports"
  let mut_params = [
    #("page", int.to_string(page)),
    #("limit", int.to_string(limit)),
  ]

  let mut_params = case query {
    option.Some(q) ->
      case string.trim(q) {
        "" -> mut_params
        q -> [#("q", q), ..mut_params]
      }
    option.None -> mut_params
  }

  let mut_params = case status_filter {
    option.Some(s) -> [#("status", int.to_string(s)), ..mut_params]
    option.None -> mut_params
  }

  let mut_params = case type_filter {
    option.Some(t) -> [#("type", int.to_string(t)), ..mut_params]
    option.None -> mut_params
  }

  let mut_params = case category_filter {
    option.Some(c) ->
      case string.trim(c) {
        "" -> mut_params
        c -> [#("category", c), ..mut_params]
      }
    option.None -> mut_params
  }

  let mut_params = case sort {
    option.Some(s) ->
      case string.trim(s) {
        "" -> mut_params
        s -> [#("sort", s), ..mut_params]
      }
    option.None -> mut_params
  }

  case mut_params {
    [] -> base
    params -> {
      let query_string =
        params
        |> list.map(fn(pair) {
          let #(key, value) = pair
          key <> "=" <> uri.percent_encode(value)
        })
        |> string.join("&")
      base <> "?" <> query_string
    }
  }
}

fn format_report_type(report_type: Int) -> String {
  case report_type {
    0 -> "Сообщение"
    1 -> "Пользователь"
    2 -> "Сервер"
    _ -> "Неизвестно"
  }
}

fn report_type_pill(report_type: Int) {
  let tone = case report_type {
    0 -> ui.PillInfo
    1 -> ui.PillPurple
    2 -> ui.PillOrange
    _ -> ui.PillNeutral
  }

  ui.pill(format_report_type(report_type), tone)
}

fn status_pill(report_id: String, status: Int) {
  let #(label, tone) = case status {
    0 -> #("Ожидает", ui.PillWarning)
    1 -> #("Закрыт", ui.PillSuccess)
    _ -> #("Неизвестно", ui.PillNeutral)
  }

  h.span([a.attribute("data-status-pill", report_id)], [
    ui.pill(label, tone),
  ])
}

fn empty_state() {
  ui.card_empty([
    ui.text_muted("Репорты не найдены"),
    ui.text_small_muted("Измени фильтры или попробуй позже"),
  ])
}

fn reports_script() -> element.Element(a) {
  let js =
    "
(function () {
  const table = document.querySelector('[data-report-table]');
  if (!table) return;
  const toolbar = document.querySelector('[data-report-toolbar]');
  const selectAll = toolbar?.querySelector('[data-report-select-all]') || null;
  const countEl = toolbar?.querySelector('[data-report-selected-count]') || null;
  const bulkBtn = toolbar?.querySelector('[data-report-bulk-resolve]') || null;
  const bulkBtnNote = toolbar?.querySelector('[data-report-bulk-resolve-with-note]') || null;

  function showToast(message, ok) {
    const box = document.createElement('div');
    box.className = 'fixed left-4 right-4 bottom-4 z-50';
    box.innerHTML =
      '<div class=\"max-w-xl mx-auto\">' +
      '<div class=\"px-4 py-3 rounded-lg shadow border ' +
      (ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800') +
      '\">' +
      '<div class=\"text-sm font-semibold\">' + (ok ? 'Готово' : 'Ошибка действия') + '</div>' +
      '<div class=\"text-sm mt-1 break-words\">' + (message || (ok ? 'Готово' : 'Неизвестная ошибка')) + '</div>' +
      '</div></div>';
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 4000);
  }

  function selectionBoxes() {
    return Array.from(table.querySelectorAll('[data-report-select]:not(:disabled)'));
  }

  function updateSelection() {
    const boxes = selectionBoxes();
    const selected = boxes.filter((b) => b.checked);
    if (countEl) countEl.textContent = selected.length + ' selected';
    if (bulkBtn) bulkBtn.disabled = selected.length === 0;
    if (bulkBtnNote) bulkBtnNote.disabled = selected.length === 0;
    if (selectAll) {
      selectAll.disabled = boxes.length === 0;
      selectAll.checked = selected.length > 0 && selected.length === boxes.length;
      selectAll.indeterminate =
        selected.length > 0 && selected.length < boxes.length;
    }
  }

  function setLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      btn.dataset.originalText = btn.textContent;
      btn.textContent = 'Выполняется...';
    } else if (btn.dataset.originalText) {
      btn.textContent = btn.dataset.originalText;
    }
  }

  async function submitForm(form) {
    const actionUrl = new URL(form.action, window.location.origin);
    actionUrl.searchParams.set('background', '1');
    const fd = new FormData(form);
    const body = new URLSearchParams();
    fd.forEach((v, k) => body.append(k, v));
    const resp = await fetch(actionUrl.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: body.toString(),
      credentials: 'same-origin',
    });
    if (!resp.ok && resp.status !== 204) {
      let t = '';
      try { t = await resp.text(); } catch (_) {}
      throw new Error(t || 'Request failed (' + resp.status + ')');
    }
  }

  function markResolved(reportId) {
    const pill = table.querySelector('[data-status-pill=\"' + reportId + '\"]');
    if (pill) {
      const inner = pill.querySelector('span');
      if (inner) {
        inner.textContent = 'Закрыт';
        inner.classList.remove('bg-yellow-100', 'text-yellow-700');
        inner.classList.add('bg-green-100', 'text-green-700');
      }
    }
    const form = table.querySelector('form[data-report-id=\"' + reportId + '\"]');
    if (form) {
      form.remove();
    }
    const checkbox = table.querySelector('[data-report-select=\"' + reportId + '\"]');
    if (checkbox) {
      checkbox.checked = false;
      checkbox.disabled = true;
      checkbox.removeAttribute('data-report-select');
      checkbox.classList.add('opacity-30', 'cursor-not-allowed');
    }
  }

  async function resolveOne(reportId, sharedNote) {
    const form = table.querySelector(
      'form[data-report-id=\"' + reportId + '\"][data-report-action=\"resolve\"]'
    );
    if (!form) {
      markResolved(reportId);
      return false;
    }
    if (sharedNote) {
      const input = form.querySelector('[name=\"public_comment\"]');
      if (input) input.value = sharedNote;
    }
    await submitForm(form);
    markResolved(reportId);
    return true;
  }

  async function handleBulkResolve(sharedNote) {
    const boxes = selectionBoxes().filter((b) => b.checked);
    if (boxes.length === 0) return;
    const confirmText = sharedNote
      ? 'Закрыть ' + boxes.length + ' репорт(ов) с одинаковым комментарием?'
      : 'Закрыть ' + boxes.length + ' репорт(ов)?';
    if (!window.confirm(confirmText)) return;
    const activeBtn = sharedNote ? bulkBtnNote : bulkBtn;
    setLoading(activeBtn, true);
    try {
      let resolvedCount = 0;
      for (const box of boxes) {
        const id = box.getAttribute('data-report-select');
        if (!id) continue;
        if (await resolveOne(id, sharedNote)) {
          resolvedCount += 1;
        }
        box.checked = false;
      }
      if (resolvedCount > 0) {
        showToast('Закрыто: ' + resolvedCount + ' репорт(ов)', true);
      }
    } catch (err) {
      showToast(err && err.message ? err.message : String(err), false);
    } finally {
      setLoading(activeBtn, false);
      updateSelection();
    }
  }

  async function handleBulkResolveWithNote() {
    const note = window.prompt('Комментарий, который применить ко всем выбранным репортам:');
    if (note == null) return; // user cancelled
    const trimmed = note.trim();
    if (trimmed.length === 0) {
      return;
    }
    handleBulkResolve(trimmed);
  }

  function wireSelection() {
    if (selectAll) {
      selectAll.addEventListener('change', (e) => {
        selectionBoxes().forEach((b) => (b.checked = e.target.checked));
        updateSelection();
      });
    }
    table.addEventListener('change', (e) => {
      const t = e.target;
      if (t && t.matches('[data-report-select]')) updateSelection();
    });
    if (bulkBtn) {
      bulkBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleBulkResolve('');
      });
    }
    if (bulkBtnNote) {
      bulkBtnNote.addEventListener('click', (e) => {
        e.preventDefault();
        handleBulkResolveWithNote();
      });
    }
    updateSelection();
  }

  function wireAsyncForms() {
    table.querySelectorAll('form[data-async]').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const confirmMsg = form.getAttribute('data-confirm');
        if (confirmMsg && !window.confirm(confirmMsg)) return;
        const btn = form.querySelector('button[type=\"submit\"]');
        const id = form.getAttribute('data-report-id') || form.querySelector('[name=\"report_id\"]')?.value;
        setLoading(btn, true);
        submitForm(form)
          .then(() => {
            if (id) markResolved(id);
            showToast('Репорт закрыт', true);
          })
          .catch((err) => showToast(err && err.message ? err.message : String(err), false))
          .finally(() => setLoading(btn, false));
      });
    });
  }

  wireSelection();
  wireAsyncForms();
})();
"

  h.script([a.attribute("defer", "defer")], js)
}

fn error_view(err: common.ApiError) {
  let #(title, message) = case err {
    common.Unauthorized -> #(
      "Требуется авторизация",
      "Your session has expired. Please log in again.",
    )
    common.Forbidden(msg) -> #("Недостаточно прав", msg)
    common.NotFound -> #("Не найдено", "Не удалось загрузить репорты.")
    common.ServerError -> #(
      "Ошибка сервера",
      "На сервере произошла ошибка. Повтори попытку позже.",
    )
    common.NetworkError -> #(
      "Сетевая ошибка",
      "Не удалось подключиться к API. Повтори попытку позже.",
    )
  }

  h.div([a.class("max-w-4xl mx-auto")], [
    h.div(
      [
        a.class(
          "bg-red-950/20 border border-red-900/60 rounded-xl p-8 shadow-sm",
        ),
      ],
      [
        h.div([a.class("flex items-start gap-4")], [
          h.div(
            [
              a.class(
                "flex-shrink-0 w-12 h-12 bg-red-950/50 rounded-full flex items-center justify-center",
              ),
            ],
            [
              h.span([a.class("text-red-300 title-sm")], [
                element.text("!"),
              ]),
            ],
          ),
          h.div([a.class("flex-1")], [
            h.h2([a.class("title-sm text-red-200 mb-2")], [
              element.text(title),
            ]),
            h.p([a.class("text-red-300/90")], [element.text(message)]),
          ]),
        ]),
      ],
    ),
  ])
}
