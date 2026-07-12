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

import astral_marketing/locale
import astral_marketing/pages/layout
import astral_marketing/web.{type Context, prepend_base_path}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import wisp

fn tr(ctx: Context, ru: String, en: String) -> String {
  case ctx.locale {
    locale.Ru -> ru
    _ -> en
  }
}

pub fn render(req: wisp.Request, ctx: Context) -> wisp.Response {
  let content = [
    html.main(
      [
        attribute.class(
          "relative isolate min-h-screen overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]",
        ),
      ],
      [hero_section(ctx)],
    ),
  ]

  layout.render(req, ctx, layout.default_page_meta(), content)
  |> element.to_document_string_tree
  |> wisp.html_response(200)
}

fn hero_section(ctx: Context) -> Element(a) {
  html.section(
    [
      attribute.class(
        "relative isolate flex min-h-screen items-center justify-center overflow-hidden px-6 pt-32 pb-[90px] text-center",
      ),
    ],
    [
      html.div(
        [
          attribute.class("home-hero-backdrop"),
          attribute.attribute("aria-hidden", "true"),
        ],
        [],
      ),
      html.div([attribute.class("relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center")], [
        html.h1(
          [
            attribute.class(
              "animate-fade-rise max-w-6xl text-[2.85rem] leading-[0.98] tracking-normal text-white sm:text-6xl md:text-7xl font-bold font-display",
            ),
          ],
          [
            html.text(tr(ctx, "Astral — там, где ", "Astral is where ")),
            html.em(
              [attribute.class("not-italic text-[hsl(var(--muted-foreground))]")],
              [html.text(tr(ctx, "идеи", "ideas"))],
            ),
            html.text(tr(ctx, " обретают форму ", " take shape ")),
            html.em(
              [attribute.class("not-italic text-[hsl(var(--muted-foreground))]")],
              [html.text(tr(ctx, "в тишине и фокусе.", "through silence and focus."))],
            ),
          ],
        ),
        html.p(
          [
            attribute.class(
              "animate-fade-rise-delay mt-8 max-w-2xl text-base leading-relaxed text-[hsl(var(--muted-foreground))] sm:text-lg",
            ),
          ],
          [
            html.text(
              tr(
                ctx,
                "Мы делаем платформу для сообществ, создателей и команд, которым нужен ясный интерфейс, голос, чат и рабочее пространство без лишнего шума.",
                "We build a platform for communities, creators, and teams that need clear chat, voice, and workspace tools without unnecessary noise.",
              ),
            ),
          ],
        ),
        html.div(
          [
            attribute.class(
              "animate-fade-rise-delay-2 mt-12 flex flex-col items-center gap-4 sm:flex-row",
            ),
          ],
          [
            cta_button(ctx.app_endpoint <> "/login", tr(ctx, "Открыть Astral", "Open Astral")),
            secondary_button(
              prepend_base_path(ctx, "/download"),
              tr(ctx, "Скачать приложение", "View Downloads"),
            ),
          ],
        ),
      ]),
    ],
  )
}

pub fn messenger_scene(ctx: Context) -> Element(a) {
  html.div(
    [
      attribute.class(
        "astral-hero-comms pointer-events-none absolute inset-x-0 top-20 z-[-1] mx-auto hidden max-w-7xl md:block",
      ),
      attribute.attribute("aria-hidden", "true"),
    ],
    [
      html.div([attribute.class("hero-chat-card hero-chat-card--left")], [
        html.div([attribute.class("hero-chat-card__top")], [
          html.span([attribute.class("hero-presence hero-presence--online")], []),
          html.span([], [html.text(tr(ctx, "Команда", "Team"))]),
        ]),
        html.p([], [
          html.text(tr(
            ctx,
            "Голос уже открыт, макеты в канале.",
            "Voice is live, mockups are in the channel.",
          )),
        ]),
      ]),
      html.div([attribute.class("hero-chat-card hero-chat-card--right")], [
        html.div([attribute.class("hero-chat-card__top")], [
          html.span([attribute.class("hero-presence hero-presence--idle")], []),
          html.span([], [html.text(tr(ctx, "Дизайн", "Design"))]),
        ]),
        html.p([], [
          html.text(tr(
            ctx,
            "Закрепил тред, можно ревьюить.",
            "Pinned the thread, ready for review.",
          )),
        ]),
      ]),
      html.div([attribute.class("hero-channel-strip")], [
        html.span([], [html.text("# general")]),
        html.span([], [html.text("# voice")]),
        html.span([], [html.text("# drops")]),
      ]),
    ],
  )
}

fn cta_button(href: String, label: String) -> Element(a) {
  html.a(
    [
      attribute.href(href),
      attribute.class(
        "astral-button astral-button-primary inline-flex items-center justify-center px-12 py-5 text-base text-[hsl(var(--foreground))] cursor-pointer",
      ),
    ],
    [html.text(label)],
  )
}

fn secondary_button(href: String, label: String) -> Element(a) {
  html.a(
    [
      attribute.href(href),
      attribute.class(
        "astral-button astral-button-secondary inline-flex items-center justify-center px-8 py-5 text-base text-[hsl(var(--foreground))]",
      ),
    ],
    [html.text(label)],
  )
}
