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

import astral_marketing/icons
import astral_marketing/locale
import astral_marketing/pages/layout
import astral_marketing/web.{type Context}
import gleam/dynamic/decode
import gleam/http/request
import gleam/httpc
import gleam/int
import gleam/json
import gleam/list
import gleam/option
import gleam/result
import gleam/string
import lustre/attribute
import lustre/element
import lustre/element/html
import wisp

pub type StatusSummary {
  StatusSummary(
    generated_at: String,
    overall_status: String,
    services: List(ServiceSummary),
  )
}

pub type ServiceSummary {
  ServiceSummary(
    key: String,
    label: String,
    status: String,
    uptime_seconds: option.Option(Int),
    sessions: option.Option(Int),
    guilds: option.Option(Int),
    presences: option.Option(Int),
    calls: option.Option(Int),
    processes: option.Option(Int),
    version: option.Option(Int),
  )
}

fn tr(ctx: Context, ru: String, en: String) -> String {
  case ctx.locale {
    locale.Ru -> ru
    _ -> en
  }
}

pub fn render(req: wisp.Request, ctx: Context) -> wisp.Response {
  let summary = fetch_status_summary(ctx)
  let overall_service_label = overall_label(ctx, summary.overall_status)
  let content = [
    html.main(
      [
        attribute.class("marketing-shell"),
      ],
      [
        html.div(
          [
            attribute.class(
              "pointer-events-none absolute -top-20 left-1/2 h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-indigo-500/18 blur-3xl",
            ),
          ],
          [],
        ),
        html.div(
          [
            attribute.class(
              "pointer-events-none absolute right-0 top-24 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl",
            ),
          ],
          [],
        ),
        html.div(
          [attribute.class("mx-auto flex w-full max-w-7xl flex-col gap-8")],
          [
            hero_section(ctx, summary, overall_service_label),
            aggregate_stats_bar(ctx, summary),
            html.section(
              [attribute.class("grid grid-cols-1 gap-5 xl:grid-cols-3")],
              summary.services
                |> list.map(fn(service) { service_card(ctx, service) }),
            ),
            faq_section(ctx),
          ],
        ),
      ],
    ),
  ]

  let page_meta =
    layout.article_page_meta(
      tr(ctx, "Статус системы Astral", "Astral System Status"),
      tr(
        ctx,
        "Публичный статус Astral: API, Gateway, метрики и uptime.",
        "Public Astral status page with service health and uptime.",
      ),
    )

  layout.render(req, ctx, page_meta, content)
  |> element.to_document_string_tree
  |> wisp.html_response(200)
}

fn hero_section(
  ctx: Context,
  summary: StatusSummary,
  overall_service_label: String,
) {
  html.section(
    [attribute.class("marketing-panel relative overflow-hidden p-8 md:p-12")],
    [
      html.div(
        [
          attribute.class(
            "pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl "
            <> glow_class(summary.overall_status),
          ),
        ],
        [],
      ),
      html.div(
        [
          attribute.class(
            "relative z-10 grid gap-10 lg:grid-cols-[1.4fr_0.6fr] lg:items-end",
          ),
        ],
        [
          html.div([attribute.class("max-w-3xl")], [
            html.div(
              [
                attribute.class(
                  "mb-5 inline-flex items-center gap-3 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm font-semibold text-zinc-100 backdrop-blur",
                ),
              ],
              [
                html.span(
                  [
                    attribute.class(
                      "relative flex h-2.5 w-2.5 items-center justify-center",
                    ),
                  ],
                  [
                    html.span(
                      [
                        attribute.class(
                          "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 "
                          <> pulse_class(summary.overall_status),
                        ),
                      ],
                      [],
                    ),
                    html.span(
                      [
                        attribute.class(status_dot_class(summary.overall_status)),
                      ],
                      [],
                    ),
                  ],
                ),
                html.text(tr(
                  ctx,
                  "Состояние систем Astral",
                  "Astral system status",
                )),
              ],
            ),
            html.h1(
              [
                attribute.class(
                  "text-4xl font-black tracking-tight text-white md:text-6xl lg:text-7xl",
                ),
              ],
              [html.text(overall_service_label)],
            ),
            html.p(
              [
                attribute.class(
                  "mt-5 max-w-2xl text-lg leading-8 text-zinc-200/88",
                ),
              ],
              [
                html.text(tr(
                  ctx,
                  "Публичная страница статуса Astral показывает живые данные по REST API, WebSocket Gateway и метрикам — как чувствуют себя ключевые сервисы прямо сейчас. Цифры обновляются по live-сводке из production-кластера, а не из ручных заглушек.",
                  "A public status page for Astral's REST API, WebSocket Gateway and metrics layer — with live numbers from the production cluster rather than static placeholders. Updated in real time.",
                )),
              ],
            ),
          ]),
          html.div(
            [attribute.class("marketing-panel rounded-2xl p-5 lg:p-6")],
            [
              html.p(
                [
                  attribute.class(
                    "text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400",
                  ),
                ],
                [html.text(tr(ctx, "Последнее обновление", "Last updated"))],
              ),
              html.p(
                [attribute.class("mt-3 text-base font-semibold text-white")],
                [html.text(pretty_timestamp(summary.generated_at))],
              ),
              html.div([attribute.class("mt-4 flex items-center gap-2")], [
                html.span(
                  [
                    attribute.class(
                      "h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse",
                    ),
                  ],
                  [],
                ),
                html.span(
                  [
                    attribute.class(
                      "text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200/88",
                    ),
                  ],
                  [html.text(tr(ctx, "Живые данные", "Live data"))],
                ),
              ]),
              html.p(
                [attribute.class("mt-4 text-sm leading-6 text-zinc-400")],
                [
                  html.text(tr(
                    ctx,
                    "Ссылка обновляется автоматически каждые 60 секунд. Все метрики — агрегатные и публичные: никаких IP, user-id или токенов.",
                    "The numbers refresh every 60 seconds. Everything here is aggregate and public — no IPs, user ids or tokens.",
                  )),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  )
}

fn aggregate_stats_bar(ctx: Context, summary: StatusSummary) {
  let operational_count =
    summary.services
    |> list.filter(fn(s) { s.status == "operational" })
    |> list.length
  let total_count = list.length(summary.services)
  let total_sessions = sum_optional(summary.services, fn(s) { s.sessions })
  let total_guilds = sum_optional(summary.services, fn(s) { s.guilds })
  let total_calls = sum_optional(summary.services, fn(s) { s.calls })
  let max_uptime = max_optional(summary.services, fn(s) { s.uptime_seconds })

  html.section(
    [
      attribute.class(
        "grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5",
      ),
    ],
    [
      aggregate_stat_card(
        ctx,
        tr(ctx, "Сервисы онлайн", "Services online"),
        int.to_string(operational_count) <> " / " <> int.to_string(total_count),
        tr(ctx, "компоненты работают штатно", "components operational"),
        "emerald",
      ),
      aggregate_stat_card(
        ctx,
        tr(ctx, "Дольше всех", "Longest uptime"),
        format_uptime(ctx, max_uptime),
        tr(ctx, "с момента последнего рестарта", "since last restart"),
        "indigo",
      ),
      aggregate_stat_card(
        ctx,
        tr(ctx, "Активные сессии", "Active sessions"),
        format_count(total_sessions),
        tr(ctx, "подключения к Gateway сейчас", "gateway connections right now"),
        "cyan",
      ),
      aggregate_stat_card(
        ctx,
        tr(ctx, "Серверы", "Guilds"),
        format_count(total_guilds),
        tr(ctx, "сообществ видит кластер", "communities visible to the cluster"),
        "violet",
      ),
      aggregate_stat_card(
        ctx,
        tr(ctx, "Голосовые звонки", "Voice calls"),
        format_count(total_calls),
        tr(ctx, "идут прямо сейчас", "happening right now"),
        "amber",
      ),
    ],
  )
}

fn aggregate_stat_card(
  _ctx: Context,
  label: String,
  value: String,
  caption: String,
  accent: String,
) {
  let accent_bar = case accent {
    "emerald" -> "from-emerald-400/60 to-emerald-400/0"
    "indigo" -> "from-indigo-400/60 to-indigo-400/0"
    "cyan" -> "from-cyan-400/60 to-cyan-400/0"
    "violet" -> "from-violet-400/60 to-violet-400/0"
    "amber" -> "from-amber-400/60 to-amber-400/0"
    _ -> "from-zinc-400/60 to-zinc-400/0"
  }

  html.div(
    [
      attribute.class(
        "marketing-panel relative overflow-hidden rounded-2xl p-5",
      ),
    ],
    [
      html.div(
        [
          attribute.class(
            "pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r "
            <> accent_bar,
          ),
        ],
        [],
      ),
      html.p(
        [
          attribute.class(
            "text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400",
          ),
        ],
        [html.text(label)],
      ),
      html.p(
        [
          attribute.class(
            "mt-3 text-2xl font-black leading-none text-white md:text-3xl",
          ),
        ],
        [html.text(value)],
      ),
      html.p(
        [attribute.class("mt-2 text-xs leading-5 text-zinc-500")],
        [html.text(caption)],
      ),
    ],
  )
}

fn sum_optional(
  services: List(ServiceSummary),
  selector: fn(ServiceSummary) -> option.Option(Int),
) -> Int {
  services
  |> list.fold(0, fn(acc, service) {
    case selector(service) {
      option.Some(v) -> acc + v
      option.None -> acc
    }
  })
}

fn max_optional(
  services: List(ServiceSummary),
  selector: fn(ServiceSummary) -> option.Option(Int),
) -> option.Option(Int) {
  services
  |> list.fold(option.None, fn(acc, service) {
    case selector(service), acc {
      option.Some(v), option.Some(current) ->
        case v > current {
          True -> option.Some(v)
          False -> option.Some(current)
        }
      option.Some(v), option.None -> option.Some(v)
      option.None, other -> other
    }
  })
}

fn format_count(value: Int) -> String {
  int.to_string(value)
}

fn faq_section(ctx: Context) {
  let items = [
    #(
      tr(ctx, "Что означает каждый статус?", "What does each status mean?"),
      tr(
        ctx,
        "«Работает» — сервис отвечает и метрики в норме. «Деградация» — сервис работает, но с повышенными задержками или частичными ошибками. «Недоступно» — сервис не отвечает, ведём диагностику. «Неизвестно» — временно не можем достучаться до health-эндпоинта.",
        "\"Operational\" means the service responds and metrics are within bounds. \"Degraded\" means the service still works but latency is elevated or some requests error. \"Outage\" means the service doesn't respond — we're investigating. \"Unknown\" means we temporarily can't reach the health endpoint.",
      ),
    ),
    #(
      tr(ctx, "Как часто обновляется страница?", "How often does this page update?"),
      tr(
        ctx,
        "Сводка берётся из live-эндпоинта кластера, HTML-страница перезапрашивает её при каждой навигации. Фоновая авто-перезагрузка — раз в 60 секунд.",
        "The summary is fetched from a live cluster endpoint on every page render, and the page auto-refreshes every 60 seconds in the background.",
      ),
    ),
    #(
      tr(ctx, "Что вы НЕ показываете?", "What do you NOT show here?"),
      tr(
        ctx,
        "Ничего, что можно было бы использовать для атаки: IP и хостов, приватных путей, per-user метрик, секретов, внутренней топологии, данных о клиентах. Только агрегаты на уровне всего кластера.",
        "Anything that could be used to attack the service: IP addresses, host names, private paths, per-user metrics, secrets, internal topology, customer data. Only cluster-wide aggregates.",
      ),
    ),
    #(
      tr(ctx, "Где история инцидентов?", "Where is the incident history?"),
      tr(
        ctx,
        "Пока мы держим только текущий снимок. Историческая панель и push-уведомления об инцидентах — в бэклоге.",
        "For now we only publish the current snapshot. A historical panel and push-based incident notifications are on the backlog.",
      ),
    ),
  ]

  html.section(
    [attribute.class("marketing-panel overflow-hidden rounded-3xl p-8 md:p-10")],
    [
      html.h2(
        [attribute.class("text-2xl font-bold text-white md:text-3xl")],
        [html.text(tr(ctx, "Часто задаваемые вопросы", "Frequently asked questions"))],
      ),
      html.p(
        [attribute.class("mt-2 text-sm text-zinc-400")],
        [
          html.text(tr(
            ctx,
            "Короткие ответы на то, что обычно спрашивают после первого взгляда на эту страницу.",
            "Short answers to what people usually ask after glancing at this page.",
          )),
        ],
      ),
      html.div(
        [attribute.class("mt-6 grid gap-4 md:grid-cols-2")],
        items
          |> list.map(fn(item) {
            let #(question, answer) = item
            html.div(
              [
                attribute.class(
                  "rounded-2xl border border-white/8 bg-black/20 p-5",
                ),
              ],
              [
                html.p(
                  [attribute.class("text-base font-semibold text-white")],
                  [html.text(question)],
                ),
                html.p(
                  [attribute.class("mt-2 text-sm leading-6 text-zinc-400")],
                  [html.text(answer)],
                ),
              ],
            )
          }),
      ),
    ],
  )
}

fn pulse_class(status: String) -> String {
  case status {
    "operational" -> "bg-emerald-400/70"
    "degraded" -> "bg-amber-400/70"
    "outage" -> "bg-rose-400/70"
    _ -> "bg-zinc-400/60"
  }
}

fn service_card(ctx: Context, service: ServiceSummary) {
  let service_status_label = status_label(ctx, service.status)
  let stat_items =
    []
    |> append_metric(tr(ctx, "Аптайм", "Uptime"), format_uptime(ctx, service.uptime_seconds))
    |> append_metric(tr(ctx, "Сессии", "Sessions"), maybe_int(service.sessions))
    |> append_metric(tr(ctx, "Серверы", "Guilds"), maybe_int(service.guilds))
    |> append_metric(tr(ctx, "Присутствия", "Presences"), maybe_int(service.presences))
    |> append_metric(tr(ctx, "Звонки", "Calls"), maybe_int(service.calls))
    |> append_metric(tr(ctx, "Процессы", "Processes"), maybe_int(service.processes))
    |> append_metric(tr(ctx, "Версия API", "API version"), maybe_version(service.version))

  html.article(
    [
      attribute.class(
        "marketing-panel reveal-card relative overflow-hidden p-6",
      ),
    ],
    [
      html.div(
        [
          attribute.class(
            "pointer-events-none absolute -right-14 -top-14 h-32 w-32 rounded-full blur-3xl "
            <> glow_class(service.status),
          ),
        ],
        [],
      ),
      html.div([attribute.class("relative z-10")], [
        html.div([attribute.class("flex items-start justify-between gap-4")], [
          html.div([attribute.class("flex items-center gap-3")], [
            html.div(
              [
                attribute.class(
                  "flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 bg-white/8 text-indigo-200",
                ),
              ],
              [service_icon(service.key)],
            ),
            html.div([], [
              html.h2([attribute.class("text-2xl font-bold text-white")], [
                html.text(service.label),
              ]),
              html.p([attribute.class("mt-1 text-sm text-zinc-400")], [
                html.text(service_status_label),
              ]),
            ]),
          ]),
          html.span(
            [
              attribute.class(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] "
                <> pill_class(service.status),
              ),
            ],
            [
              html.span([attribute.class(status_dot_class(service.status))], []),
              html.text(service_status_label),
            ],
          ),
        ]),
        html.div([attribute.class("mt-6 grid grid-cols-2 gap-3")], stat_items),
      ]),
    ],
  )
}

fn append_metric(
  items: List(element.Element(a)),
  label: String,
  value: String,
) -> List(element.Element(a)) {
  case metric_item(label, value) {
    option.Some(item) -> list.append(items, [item])
    option.None -> items
  }
}

fn metric_item(
  label: String,
  value: String,
) -> option.Option(element.Element(a)) {
  case value {
    "" -> option.None
    _ ->
      option.Some(
        html.div(
          [
            attribute.class(
              "rounded-2xl border border-white/10 bg-black/20 px-4 py-3",
            ),
          ],
          [
            html.p([
              attribute.class(
                "text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500",
              ),
            ], [
              html.text(label),
            ]),
            html.p([attribute.class("mt-2 text-lg font-bold text-white")], [
              html.text(value),
            ]),
          ],
        ),
      )
  }
}

fn fetch_status_summary(ctx: Context) -> StatusSummary {
  let url = "http://" <> ctx.api_host <> "/v1/status/summary"

  case request.to(url) {
    Ok(req) ->
      case httpc.send(req) {
        Ok(resp) if resp.status >= 200 && resp.status < 300 ->
          decode_status_summary(resp.body)
          |> result.unwrap(default_status_summary())
        _ -> default_status_summary()
      }
    Error(_) -> default_status_summary()
  }
}

fn decode_status_summary(body: String) -> Result(StatusSummary, Nil) {
  let details_decoder = {
    use sessions <- decode.optional_field(
      "sessions",
      option.None,
      decode.optional(decode.int),
    )
    use guilds <- decode.optional_field(
      "guilds",
      option.None,
      decode.optional(decode.int),
    )
    use presences <- decode.optional_field(
      "presences",
      option.None,
      decode.optional(decode.int),
    )
    use calls <- decode.optional_field(
      "calls",
      option.None,
      decode.optional(decode.int),
    )
    use processes <- decode.optional_field(
      "process_count",
      option.None,
      decode.optional(decode.int),
    )
    use version <- decode.optional_field(
      "version",
      option.None,
      decode.optional(decode.int),
    )
    decode.success(#(sessions, guilds, presences, calls, processes, version))
  }

  let service_decoder = {
    use key <- decode.field("key", decode.string)
    use label <- decode.field("label", decode.string)
    use status <- decode.field("status", decode.string)
    use uptime_seconds <- decode.field(
      "uptime_seconds",
      decode.optional(decode.int),
    )
    use details <- decode.optional_field(
      "details",
      option.None,
      decode.optional(details_decoder),
    )
    let #(sessions, guilds, presences, calls, processes, version) = case details {
      option.Some(#(s, g, p, c, pr, v)) -> #(s, g, p, c, pr, v)
      option.None -> #(
        option.None,
        option.None,
        option.None,
        option.None,
        option.None,
        option.None,
      )
    }
    decode.success(
      ServiceSummary(
        key: key,
        label: label,
        status: status,
        uptime_seconds: uptime_seconds,
        sessions: sessions,
        guilds: guilds,
        presences: presences,
        calls: calls,
        processes: processes,
        version: version,
      ),
    )
  }

  let summary_decoder = {
    use generated_at <- decode.field("generated_at", decode.string)
    use overall_status <- decode.field("overall_status", decode.string)
    use services <- decode.field("services", decode.list(service_decoder))
    decode.success(
      StatusSummary(
        generated_at: generated_at,
        overall_status: overall_status,
        services: services,
      ),
    )
  }

  case json.parse(from: body, using: summary_decoder) {
    Ok(summary) -> Ok(summary)
    Error(_) -> Error(Nil)
  }
}

fn default_service(key: String, label: String) -> ServiceSummary {
  ServiceSummary(
    key: key,
    label: label,
    status: "unknown",
    uptime_seconds: option.None,
    sessions: option.None,
    guilds: option.None,
    presences: option.None,
    calls: option.None,
    processes: option.None,
    version: option.None,
  )
}

fn default_status_summary() -> StatusSummary {
  StatusSummary(
    generated_at: "",
    overall_status: "unknown",
    services: [
      default_service("api", "API"),
      default_service("gateway", "Gateway"),
      default_service("metrics", "Metrics"),
    ],
  )
}

fn overall_label(ctx: Context, status: String) -> String {
  case status {
    "operational" -> tr(ctx, "Все системы работают штатно", "All systems operational")
    "degraded" -> tr(ctx, "Есть частичные ухудшения", "Partial service degradation")
    "outage" -> tr(ctx, "Есть серьёзные проблемы", "Major service outage")
    _ -> tr(ctx, "Статус уточняется", "Status is being verified")
  }
}

fn status_label(ctx: Context, status: String) -> String {
  case status {
    "operational" -> tr(ctx, "Работает", "Operational")
    "degraded" -> tr(ctx, "Есть деградация", "Degraded")
    "outage" -> tr(ctx, "Недоступно", "Outage")
    _ -> tr(ctx, "Неизвестно", "Unknown")
  }
}

fn maybe_int(value: option.Option(Int)) -> String {
  case value {
    option.Some(v) -> int.to_string(v)
    option.None -> ""
  }
}

fn maybe_version(value: option.Option(Int)) -> String {
  case value {
    option.Some(v) -> "v" <> int.to_string(v)
    option.None -> ""
  }
}

fn format_uptime(ctx: Context, value: option.Option(Int)) -> String {
  case value {
    option.None -> tr(ctx, "Нет данных", "No data")
    option.Some(seconds) -> {
      let days = seconds / 86_400
      let hours = seconds % 86_400 / 3_600
      let minutes = seconds % 3_600 / 60

      case days > 0 {
        True ->
          int.to_string(days)
          <> tr(ctx, " д ", "d ")
          <> int.to_string(hours)
          <> tr(ctx, " ч", "h")
        False ->
          case hours > 0 {
            True ->
              int.to_string(hours)
              <> tr(ctx, " ч ", "h ")
              <> int.to_string(minutes)
              <> tr(ctx, " мин", "m")
            False ->
              int.to_string(minutes)
              <> tr(ctx, " мин", "m")
          }
      }
    }
  }
}

fn pretty_timestamp(value: String) -> String {
  case value {
    "" -> "-"
    _ ->
      value
      |> string.replace("T", " ")
      |> string.replace("Z", " UTC")
  }
}

fn glow_class(status: String) -> String {
  case status {
    "operational" -> "bg-emerald-400/18"
    "degraded" -> "bg-amber-400/20"
    "outage" -> "bg-rose-400/18"
    _ -> "bg-zinc-400/14"
  }
}

fn pill_class(status: String) -> String {
  case status {
    "operational" ->
      "border-emerald-300/30 bg-emerald-500/12 text-emerald-100"
    "degraded" ->
      "border-amber-300/30 bg-amber-500/12 text-amber-100"
    "outage" ->
      "border-rose-300/30 bg-rose-500/12 text-rose-100"
    _ -> "border-zinc-300/20 bg-zinc-500/10 text-zinc-200"
  }
}

fn status_dot_class(status: String) -> String {
  case status {
    "operational" -> "h-2.5 w-2.5 rounded-full bg-emerald-300"
    "degraded" -> "h-2.5 w-2.5 rounded-full bg-amber-300"
    "outage" -> "h-2.5 w-2.5 rounded-full bg-rose-300"
    _ -> "h-2.5 w-2.5 rounded-full bg-zinc-300"
  }
}

fn service_icon(key: String) {
  case key {
    "api" -> icons.code_icon([attribute.class("h-5 w-5")])
    "gateway" -> icons.chats_circle([attribute.class("h-5 w-5")])
    "metrics" -> icons.chart_line([attribute.class("h-5 w-5")])
    _ -> icons.seal_check([attribute.class("h-5 w-5")])
  }
}
