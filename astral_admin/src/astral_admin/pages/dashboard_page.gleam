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
import astral_admin/api/audit
import astral_admin/api/common
import astral_admin/api/discovery_applications
import astral_admin/api/platform_overview
import astral_admin/api/verifications
import astral_admin/components/flash
import astral_admin/components/layout
import astral_admin/components/ui
import astral_admin/constants
import astral_admin/web.{type Context, type Session, href}
import gleam/int
import gleam/list
import gleam/option
import gleam/string
import lustre/attribute as a
import lustre/element
import lustre/element/html as h
import wisp.{type Response}

type StatTone {
  StatNeutral
  StatWarning
  StatDanger
  StatPositive
}

pub fn view(
  ctx: Context,
  session: Session,
  current_admin: option.Option(common.UserLookupResult),
  flash_data: option.Option(flash.Flash),
) -> Response {
  let admin_acls = case current_admin {
    option.Some(admin) -> admin.acls
    option.None -> []
  }

  let pending_verifications_count = case
    acl.has_permission(admin_acls, constants.acl_pending_verification_view)
  {
    True ->
      case verifications.list_pending_verifications(ctx, session, 100) {
        Ok(resp) -> option.Some(list.length(resp.pending_verifications))
        Error(_) -> option.None
      }
    False -> option.None
  }

  let pending_discovery_count = case
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

  let platform = case
    acl.has_permission(admin_acls, constants.acl_metrics_view)
  {
    True ->
      case platform_overview.get_platform_overview(ctx, session) {
        Ok(stats) -> option.Some(stats)
        Error(_) -> option.None
      }
    False -> option.None
  }

  let recent_logs = case
    acl.has_permission(admin_acls, constants.acl_audit_log_view)
  {
    True ->
      case
        audit.search_audit_logs(
          ctx,
          session,
          option.None,
          option.None,
          option.None,
          option.None,
          option.None,
          8,
          0,
        )
      {
        Ok(resp) -> resp.logs
        Error(_) -> []
      }
    False -> []
  }

  let admin_name = case current_admin {
    option.Some(admin) ->
      case admin.global_name {
        option.Some(name) -> name
        option.None -> admin.username
      }
    option.None -> "Admin"
  }

  let content =
    h.div([a.class("max-w-7xl mx-auto flex flex-col gap-8")], [
      hero(ctx, admin_name),
      stats_grid(
        ctx,
        admin_acls,
        pending_verifications_count,
        pending_discovery_count,
        platform,
      ),
      action_grid(ctx, admin_acls),
      recent_activity(ctx, recent_logs),
    ])

  let html =
    layout.page(
      "Dashboard",
      "dashboard",
      ctx,
      session,
      current_admin,
      flash_data,
      content,
    )
  wisp.html_response(element.to_document_string(html), 200)
}

fn hero(_ctx: Context, admin_name: String) -> element.Element(a) {
  h.div([a.class("space-y-4")], [
    h.div([a.class("flex flex-wrap items-start justify-between gap-4")], [
      h.div([a.class("space-y-2")], [
        h.h1([a.class("text-2xl font-semibold text-zinc-100 tracking-tight")], [
          element.text("Привет, " <> admin_name <> "."),
        ]),
        h.p([a.class("max-w-3xl text-sm text-zinc-400")], [
          element.text(
            "Сводка по платформе, очередям и служебным зонам. Сначала смотри на цифры, потом проваливайся в действия.",
          ),
        ]),
      ]),
      h.div([a.class("flex flex-wrap items-center gap-2")], [
        ui.badge("READ ONLY", ui.BadgeInfo),
        ui.badge("CONTROL", ui.BadgeSuccess),
      ]),
    ]),
    h.div([a.class("h-px bg-zinc-800/80")], []),
  ])
}

fn stats_grid(
  ctx: Context,
  _admin_acls: List(String),
  pending_verifications_count: option.Option(Int),
  pending_discovery_count: option.Option(Int),
  platform: option.Option(platform_overview.PlatformOverview),
) -> element.Element(a) {
  let cards = []

  let cards = case pending_verifications_count {
    option.Some(count) -> [
      stat_card(
        ctx,
        "Ожидают регистрации",
        int.to_string(count),
        "/pending-verifications",
        case count {
          0 -> StatPositive
          n if n > 10 -> StatDanger
          _ -> StatWarning
        },
      ),
      ..cards
    ]
    option.None -> cards
  }

  let cards = case pending_discovery_count {
    option.Some(count) -> [
      stat_card(
        ctx,
        "Заявки в Discovery",
        int.to_string(count),
        "/discovery-applications",
        case count {
          0 -> StatPositive
          n if n > 5 -> StatDanger
          _ -> StatWarning
        },
      ),
      ..cards
    ]
    option.None -> cards
  }

  let cards = case platform {
    option.Some(p) -> [
      stat_card(
        ctx,
        "Открытые репорты",
        int.to_string(p.total_reports - p.resolved_reports),
        "/reports",
        case p.total_reports - p.resolved_reports {
          0 -> StatPositive
          n if n > 25 -> StatDanger
          _ -> StatWarning
        },
      ),
      stat_card(
        ctx,
        "Активные сессии",
        int.to_string(p.active_sessions),
        "/metrics",
        StatNeutral,
      ),
      stat_card(
        ctx,
        "Активные сообщества",
        int.to_string(p.active_guilds),
        "/metrics",
        StatNeutral,
      ),
      ..cards
    ]
    option.None -> cards
  }

  case list.is_empty(cards) {
    True ->
      h.div([a.class("rounded-xl border border-zinc-800 bg-zinc-950 p-6")], [
        h.p([a.class("text-sm text-zinc-400")], [
          element.text(
            "У вас нет доступа к статистике платформы. Обратитесь к администратору для получения нужных ACL.",
          ),
        ]),
      ])
    False ->
      h.div(
        [
          a.class(
            "grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
          ),
        ],
        list.reverse(cards),
      )
  }
}

fn stat_card(
  ctx: Context,
  title: String,
  value: String,
  url: String,
  tone: StatTone,
) -> element.Element(a) {
  let accent = case tone {
    StatNeutral -> "border-zinc-800 hover:border-zinc-700"
    StatPositive -> "border-emerald-900/60 hover:border-emerald-700/80"
    StatWarning -> "border-amber-900/60 hover:border-amber-700/80"
    StatDanger -> "border-red-900/60 hover:border-red-700/80"
  }

  let value_color = case tone {
    StatNeutral -> "text-zinc-100"
    StatPositive -> "text-emerald-300"
    StatWarning -> "text-amber-300"
    StatDanger -> "text-red-300"
  }

  h.a(
    [
      href(ctx, url),
      a.class(
        "group block rounded-xl border bg-zinc-950/65 px-5 py-4 transition-colors "
        <> accent,
      ),
    ],
    [
      h.div(
        [
          a.class(
            "text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-zinc-400",
          ),
        ],
        [element.text(title)],
      ),
      h.div([a.class("mt-2 text-3xl font-semibold " <> value_color)], [
        element.text(value),
      ]),
      h.div(
        [
          a.class(
            "mt-2 text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors",
          ),
        ],
        [element.text("Открыть →")],
      ),
    ],
  )
}

fn action_grid(ctx: Context, admin_acls: List(String)) -> element.Element(a) {
  let actions = [
    #("Пользователи", "Поиск и карточка", "/users", [
      constants.acl_user_lookup,
    ]),
    #("Серверы", "Гильдии, флаги, владельцы", "/guilds", [
      constants.acl_guild_lookup,
    ]),
    #("Репорты", "Очередь модерации", "/reports", [
      constants.acl_report_view,
    ]),
    #("Discovery", "Проверка заявок", "/discovery-applications", [
      constants.acl_guild_discovery_review,
    ]),
    #("Конфиг", "Глобальные параметры", "/instance-config", [
      constants.acl_instance_config_view,
    ]),
    #("База и Redis", "Cassandra, pool, Redis", "/database", [
      constants.acl_metrics_view,
    ]),
    #("Аудит", "Кто что сделал", "/audit-logs", [
      constants.acl_audit_log_view,
    ]),
  ]

  let visible =
    list.filter(actions, fn(action) {
      let #(_, _, _, required) = action
      list.any(required, fn(acl_name) {
        acl.has_permission(admin_acls, acl_name)
      })
    })

  case list.is_empty(visible) {
    True -> element.none()
    False ->
      h.div([], [
        h.h2(
          [
            a.class(
              "text-[0.7rem] font-medium uppercase tracking-[0.18em] text-zinc-400 mb-3",
            ),
          ],
          [
            element.text("Быстрые действия"),
          ],
        ),
        h.div(
          [a.class("grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")],
          list.map(visible, fn(action) {
            let #(title, description, url, _) = action
            action_card(ctx, title, description, url)
          }),
        ),
      ])
  }
}

fn action_card(
  ctx: Context,
  title: String,
  description: String,
  url: String,
) -> element.Element(a) {
  h.a(
    [
      href(ctx, url),
      a.class(
        "group flex flex-col gap-1.5 rounded-xl border border-zinc-800/80 bg-zinc-950/65 px-4 py-3.5 transition-colors hover:border-indigo-500/50 hover:bg-zinc-900/70",
      ),
    ],
    [
      h.div([a.class("text-sm font-semibold text-zinc-100")], [
        element.text(title),
      ]),
      h.div([a.class("text-xs text-zinc-400")], [element.text(description)]),
    ],
  )
}

fn recent_activity(
  ctx: Context,
  logs: List(audit.AuditLog),
) -> element.Element(a) {
  case list.is_empty(logs) {
    True -> element.none()
    False ->
      h.div([], [
        h.h2(
          [
            a.class(
              "text-[0.7rem] font-medium uppercase tracking-[0.18em] text-zinc-400 mb-3",
            ),
          ],
          [element.text("Недавняя активность")],
        ),
        h.div(
          [
            a.class(
              "rounded-xl border border-zinc-800/80 bg-zinc-950/65 divide-y divide-zinc-800/70",
            ),
          ],
          list.map(logs, fn(log) { activity_row(ctx, log) }),
        ),
      ])
  }
}

fn activity_row(ctx: Context, log: audit.AuditLog) -> element.Element(a) {
  h.div([a.class("flex items-center justify-between gap-4 px-4 py-3")], [
    h.div([a.class("flex flex-col gap-0.5 min-w-0")], [
      h.div([a.class("text-sm text-zinc-100 truncate")], [
        element.text(log.action),
      ]),
      h.div([a.class("text-xs text-zinc-500 truncate")], [
        element.text(
          log.target_type
          <> " · "
          <> log.target_id
          <> case log.audit_log_reason {
            option.Some(reason) -> " · " <> reason
            option.None -> ""
          },
        ),
      ]),
    ]),
    h.div([a.class("flex items-center gap-3 flex-shrink-0")], [
      h.div([a.class("text-xs text-zinc-500")], [
        element.text(string.slice(log.created_at, 0, 16)),
      ]),
      h.a(
        [
          href(ctx, "/users/" <> log.admin_user_id),
          a.class("text-xs text-zinc-400 hover:text-zinc-200 underline"),
        ],
        [element.text("admin")],
      ),
    ]),
  ])
}
