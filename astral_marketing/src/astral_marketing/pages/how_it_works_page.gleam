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

import astral_marketing/pages/layout
import astral_marketing/pages/layout/meta.{PageMeta}
import astral_marketing/web.{type Context}
import lustre/attribute
import lustre/element
import lustre/element/html
import wisp

pub fn handle(ctx: Context, req: wisp.Request) -> wisp.Response {
  let content = [
    html.link([
      attribute.rel("stylesheet"),
      attribute.href("/static/how-it-works.css"),
    ]),
    html.script(
      [attribute.src("/static/how-it-works.js"), attribute.attribute("defer", "")],
      "",
    ),
    html.main([attribute.id("hiw-root")], [
      // Hero
      html.section([attribute.class("hiw-hero")], [
        html.div([attribute.class("hiw-hero__bg")], []),
        html.div([attribute.class("hiw-hero__content")], [
          html.span([attribute.class("hiw-eyebrow")], [
            html.text("Как это работает"),
          ]),
          html.h1([attribute.class("hiw-hero__title")], [
            html.text("Astral изнутри"),
          ]),
          html.p([attribute.class("hiw-hero__sub")], [
            html.text(
              "Независимая платформа для общения. Скорость, безопасность, открытость.",
            ),
          ]),
          html.div([attribute.class("hiw-hero__scroll")], [
            html.span([], [html.text("Прокрути вниз")]),
            html.div([attribute.class("hiw-scroll-arrow")], []),
          ]),
        ]),
      ]),
      // Architecture
      html.section([attribute.class("hiw-section"), attribute.id("arch")], [
        html.div([attribute.class("hiw-section__inner")], [
          html.div([attribute.class("hiw-label")], [html.text("01")]),
          html.h2([attribute.class("hiw-section__title")], [
            html.text("Архитектура"),
          ]),
          html.p([attribute.class("hiw-section__lead")], [
            html.text(
              "Три независимых слоя — каждый оптимизирован под свою задачу.",
            ),
          ]),
          html.div([attribute.class("hiw-arch-diagram")], [
            html.div([attribute.class("hiw-arch-layer hiw-arch-layer--user")], [
              html.span([], [html.text("Пользователь")]),
            ]),
            html.div([attribute.class("hiw-arch-arrow")], []),
            html.div([attribute.class("hiw-arch-layer hiw-arch-layer--edge")], [
              html.span([], [html.text("Caddy · TLS · Балансировщик")]),
            ]),
            html.div([attribute.class("hiw-arch-arrow")], []),
            html.div([attribute.class("hiw-arch-services")], [
              html.div(
                [attribute.class("hiw-arch-service hiw-arch-service--api")],
                [
                  html.strong([], [html.text("API")]),
                  html.span([], [html.text("Node.js · Hono · REST")]),
                ],
              ),
              html.div(
                [
                  attribute.class(
                    "hiw-arch-service hiw-arch-service--gateway",
                  ),
                ],
                [
                  html.strong([], [html.text("Gateway")]),
                  html.span([], [html.text("Erlang/OTP · WebSocket")]),
                ],
              ),
              html.div(
                [attribute.class("hiw-arch-service hiw-arch-service--cpp")],
                [
                  html.strong([], [html.text("C++ Services")]),
                  html.span([], [html.text("userver · < 1ms")]),
                ],
              ),
            ]),
            html.div([attribute.class("hiw-arch-arrow")], []),
            html.div([attribute.class("hiw-arch-databases")], [
              html.span([attribute.class("hiw-db-tag")], [
                html.text("PostgreSQL"),
              ]),
              html.span([attribute.class("hiw-db-tag")], [
                html.text("Cassandra"),
              ]),
              html.span([attribute.class("hiw-db-tag")], [html.text("Redis")]),
              html.span([attribute.class("hiw-db-tag")], [
                html.text("ClickHouse"),
              ]),
              html.span([attribute.class("hiw-db-tag")], [
                html.text("Meilisearch"),
              ]),
            ]),
          ]),
          html.div([attribute.class("hiw-cards")], [
            hiw_card(
              "⚡",
              "Erlang Gateway",
              "Каждый сервер — отдельный процесс. Ошибка одного не влияет на остальных. Миллионы соединений одновременно.",
            ),
            hiw_card(
              "🚀",
              "C++ Микросервисы",
              "Операции типа «сколько онлайн» выполняются тысячи раз в секунду. C++ даёт < 1ms против 50ms на Node.js.",
            ),
            hiw_card(
              "📦",
              "Cassandra для сообщений",
              "Сообщения — append-only данные. Cassandra оптимизирована именно для этого: быстрая запись, горизонтальное масштабирование.",
            ),
          ]),
        ]),
      ]),
      // Realtime
      html.section(
        [attribute.class("hiw-section hiw-section--dark"), attribute.id("rt")],
        [
          html.div([attribute.class("hiw-section__inner")], [
            html.div([attribute.class("hiw-label")], [html.text("02")]),
            html.h2([attribute.class("hiw-section__title")], [
              html.text("Реальное время"),
            ]),
            html.p([attribute.class("hiw-section__lead")], [
              html.text("Сообщение появляется у всех за < 50ms."),
            ]),
            html.div([attribute.class("hiw-ws-flow")], [
              hiw_ws_step("1", "Открываешь Astral", "Браузер"),
              hiw_ws_arrow(),
              hiw_ws_step("2", "WebSocket соединение", "Gateway"),
              hiw_ws_arrow(),
              hiw_ws_step("3", "IDENTIFY + токен", "Auth"),
              hiw_ws_arrow(),
              hiw_ws_step("4", "READY — все данные", "State"),
              hiw_ws_arrow(),
              hiw_ws_step("5", "Живые события", "∞"),
            ]),
            html.div([attribute.class("hiw-events")], [
              hiw_event("←", "MESSAGE_CREATE", "Новое сообщение"),
              hiw_event("←", "PRESENCE_UPDATE", "Кто онлайн"),
              hiw_event("←", "VOICE_STATE_UPDATE", "Голос"),
              hiw_event("→", "heartbeat", "Каждые 41 сек"),
            ]),
          ]),
        ],
      ),
      // Voice
      html.section([attribute.class("hiw-section"), attribute.id("voice")], [
        html.div([attribute.class("hiw-section__inner")], [
          html.div([attribute.class("hiw-label")], [html.text("03")]),
          html.h2([attribute.class("hiw-section__title")], [
            html.text("Голос и видео"),
          ]),
          html.p([attribute.class("hiw-section__lead")], [
            html.text(
              "WebRTC + LiveKit. Та же технология что в Google Meet, но с открытым кодом.",
            ),
          ]),
          html.div([attribute.class("hiw-voice-diagram")], [
            html.div([attribute.class("hiw-voice-participant")], [
              html.div([attribute.class("hiw-voice-avatar")], [
                html.text("A"),
              ]),
              html.span([], [html.text("Участник A")]),
            ]),
            html.div([attribute.class("hiw-voice-server")], [
              html.div([attribute.class("hiw-voice-server__icon")], [
                html.text("⚡"),
              ]),
              html.strong([], [html.text("LiveKit Server")]),
              html.div([attribute.class("hiw-voice-features")], [
                html.span([], [html.text("Simulcast")]),
                html.span([], [html.text("Шумоподавление")]),
                html.span([], [html.text("Адаптивный битрейт")]),
              ]),
            ]),
            html.div([attribute.class("hiw-voice-participant")], [
              html.div([attribute.class("hiw-voice-avatar")], [
                html.text("B"),
              ]),
              html.span([], [html.text("Участник B")]),
            ]),
          ]),
          html.div([attribute.class("hiw-stats-row")], [
            hiw_stat("< 80ms", "Задержка голоса"),
            hiw_stat("< 2s", "Подключение"),
            hiw_stat("3×", "Качество видео"),
          ]),
        ]),
      ]),
      // Security
      html.section(
        [
          attribute.class("hiw-section hiw-section--dark"),
          attribute.id("security"),
        ],
        [
          html.div([attribute.class("hiw-section__inner")], [
            html.div([attribute.class("hiw-label")], [html.text("04")]),
            html.h2([attribute.class("hiw-section__title")], [
              html.text("Безопасность"),
            ]),
            html.p([attribute.class("hiw-section__lead")], [
              html.text("Многоуровневая защита на каждом запросе."),
            ]),
            html.div([attribute.class("hiw-security-layers")], [
              hiw_sec_layer(
                "🛡",
                "IP Ban",
                "Заблокированные IP не проходят дальше первого слоя",
              ),
              hiw_sec_layer(
                "⏱",
                "Rate Limiting",
                "Не более N запросов в секунду — защита от спама и DDoS",
              ),
              hiw_sec_layer(
                "🌐",
                "Origin Check",
                "Запросы только с разрешённых доменов",
              ),
              hiw_sec_layer(
                "🔑",
                "Auth Middleware",
                "JWT токены с коротким временем жизни",
              ),
              hiw_sec_layer(
                "✅",
                "Permission Check",
                "Проверка прав на каждое конкретное действие",
              ),
            ]),
            html.div([attribute.class("hiw-auth-features")], [
              hiw_card(
                "📧",
                "IP-авторизация",
                "Новое устройство требует подтверждения по email.",
              ),
              hiw_card(
                "✈️",
                "2FA через Telegram",
                "Вместо SMS, которые можно перехватить.",
              ),
              hiw_card(
                "🔐",
                "WebAuthn / Passkeys",
                "Вход без пароля через биометрию.",
              ),
            ]),
          ]),
        ],
      ),
      // Performance
      html.section(
        [attribute.class("hiw-section"), attribute.id("perf")],
        [
          html.div([attribute.class("hiw-section__inner")], [
            html.div([attribute.class("hiw-label")], [html.text("05")]),
            html.h2([attribute.class("hiw-section__title")], [
              html.text("Производительность"),
            ]),
            html.div([attribute.class("hiw-perf-grid")], [
              hiw_perf_bar("WebSocket сообщение", 50, "< 50ms"),
              hiw_perf_bar("API ответ (p95)", 100, "< 100ms"),
              hiw_perf_bar("Задержка голоса", 80, "< 80ms"),
              hiw_perf_bar("Подключение к голосу", 2000, "< 2s"),
              hiw_perf_bar("Загрузка страницы", 2000, "< 2s"),
            ]),
          ]),
        ],
      ),
      // Platforms
      html.section(
        [
          attribute.class("hiw-section hiw-section--dark"),
          attribute.id("platforms"),
        ],
        [
          html.div([attribute.class("hiw-section__inner")], [
            html.div([attribute.class("hiw-label")], [html.text("06")]),
            html.h2([attribute.class("hiw-section__title")], [
              html.text("Везде"),
            ]),
            html.p([attribute.class("hiw-section__lead")], [
              html.text(
                "Один код — все платформы. Новая функция появляется везде одновременно.",
              ),
            ]),
            html.div([attribute.class("hiw-platforms")], [
              html.div([attribute.class("hiw-platform")], [
                html.div([attribute.class("hiw-platform__icon")], [
                  html.text("🌐"),
                ]),
                html.strong([], [html.text("Web")]),
                html.span([], [html.text("React 19")]),
              ]),
              html.div([attribute.class("hiw-platform__arrow")], [
                html.text("→"),
              ]),
              html.div([attribute.class("hiw-platform")], [
                html.div([attribute.class("hiw-platform__icon")], [
                  html.text("🖥"),
                ]),
                html.strong([], [html.text("Desktop")]),
                html.span([], [html.text("Electron")]),
              ]),
              html.div([attribute.class("hiw-platform__arrow")], [
                html.text("→"),
              ]),
              html.div([attribute.class("hiw-platform")], [
                html.div([attribute.class("hiw-platform__icon")], [
                  html.text("📱"),
                ]),
                html.strong([], [html.text("Mobile")]),
                html.span([], [html.text("Android · iOS")]),
              ]),
            ]),
          ]),
        ],
      ),
      // CTA
      html.section([attribute.class("hiw-cta")], [
        html.div([attribute.class("hiw-cta__inner")], [
          html.h2([attribute.class("hiw-cta__title")], [
            html.text("Попробуй Astral"),
          ]),
          html.p([attribute.class("hiw-cta__sub")], [
            html.text("Бесплатно. Без рекламы. Открытый код."),
          ]),
          html.a(
            [
              attribute.href("https://astraof.com"),
              attribute.class("hiw-cta__btn"),
            ],
            [html.text("Открыть Astral →")],
          ),
        ]),
      ]),
    ]),
  ]

  layout.render(
    req,
    ctx,
    PageMeta(
      title: "Как работает Astral — архитектура, безопасность, производительность",
      description: "Подробная статья о том, как устроен Astral изнутри: архитектура, реальное время, голос, безопасность и производительность.",
      og_type: "website",
    ),
    content,
  )
  |> element.to_document_string_tree
  |> wisp.html_response(200)
}

fn hiw_card(icon: String, title: String, body: String) -> element.Element(a) {
  html.div([attribute.class("hiw-card")], [
    html.div([attribute.class("hiw-card__icon")], [html.text(icon)]),
    html.strong([attribute.class("hiw-card__title")], [html.text(title)]),
    html.p([attribute.class("hiw-card__body")], [html.text(body)]),
  ])
}

fn hiw_ws_step(
  num: String,
  label: String,
  tag: String,
) -> element.Element(a) {
  html.div([attribute.class("hiw-ws-step")], [
    html.div([attribute.class("hiw-ws-step__num")], [html.text(num)]),
    html.span([attribute.class("hiw-ws-step__label")], [html.text(label)]),
    html.span([attribute.class("hiw-ws-step__tag")], [html.text(tag)]),
  ])
}

fn hiw_ws_arrow() -> element.Element(a) {
  html.div([attribute.class("hiw-ws-arrow")], [html.text("→")])
}

fn hiw_event(
  dir: String,
  event: String,
  desc: String,
) -> element.Element(a) {
  html.div([attribute.class("hiw-event")], [
    html.span([attribute.class("hiw-event__dir")], [html.text(dir)]),
    html.code([attribute.class("hiw-event__name")], [html.text(event)]),
    html.span([attribute.class("hiw-event__desc")], [html.text(desc)]),
  ])
}

fn hiw_stat(value: String, label: String) -> element.Element(a) {
  html.div([attribute.class("hiw-stat")], [
    html.strong([attribute.class("hiw-stat__value")], [html.text(value)]),
    html.span([attribute.class("hiw-stat__label")], [html.text(label)]),
  ])
}

fn hiw_sec_layer(
  icon: String,
  title: String,
  desc: String,
) -> element.Element(a) {
  html.div([attribute.class("hiw-sec-layer")], [
    html.div([attribute.class("hiw-sec-layer__icon")], [html.text(icon)]),
    html.div([attribute.class("hiw-sec-layer__text")], [
      html.strong([], [html.text(title)]),
      html.span([], [html.text(desc)]),
    ]),
    html.div([attribute.class("hiw-sec-layer__check")], [html.text("✓")]),
  ])
}

fn hiw_perf_bar(
  label: String,
  _ms: Int,
  value: String,
) -> element.Element(a) {
  html.div([attribute.class("hiw-perf-row")], [
    html.span([attribute.class("hiw-perf-label")], [html.text(label)]),
    html.div([attribute.class("hiw-perf-bar")], [
      html.div(
        [
          attribute.class("hiw-perf-bar__fill"),
          attribute.attribute("data-value", value),
        ],
        [],
      ),
    ]),
    html.span([attribute.class("hiw-perf-value")], [html.text(value)]),
  ])
}
