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

const hero_video_url =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4"

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
      html.video(
        [
          attribute.class("absolute inset-0 z-0 h-full w-full object-cover"),
          attribute.attribute("autoplay", "autoplay"),
          attribute.attribute("loop", "loop"),
          attribute.attribute("muted", "muted"),
          attribute.attribute("playsinline", "playsinline"),
        ],
        [
          html.source([
            attribute.src(hero_video_url),
            attribute.type_("video/mp4"),
          ]),
        ],
      ),
      html.div([attribute.class("relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center")], [
        html.h1(
          [
            attribute.class(
              "animate-fade-rise max-w-7xl text-[3rem] leading-[0.95] tracking-[-2.46px] text-white sm:text-7xl md:text-8xl font-normal font-accent",
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

fn cta_button(href: String, label: String) -> Element(a) {
  html.a(
    [
      attribute.href(href),
      attribute.class(
        "liquid-glass interactive-glass inline-flex items-center justify-center rounded-full px-14 py-5 text-base text-[hsl(var(--foreground))] cursor-pointer",
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
        "interactive-glass inline-flex items-center justify-center rounded-full border border-white/20 bg-black/20 px-8 py-5 text-base text-[hsl(var(--foreground))] backdrop-blur-sm transition-colors duration-200 hover:bg-black/30",
      ),
    ],
    [html.text(label)],
  )
}
