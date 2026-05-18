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
import astral_marketing/pages/layout/meta.{PageMeta}
import astral_marketing/web.{type Context}
import gleam/list
import lustre/attribute
import lustre/element
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
          "relative isolate flex min-h-[70vh] items-center justify-center overflow-hidden px-6 pb-20 pt-36 md:pt-40",
        ),
      ],
      [
        html.div(
          [
            attribute.class(
              "pointer-events-none absolute left-0 top-0 h-80 w-80 rounded-full bg-indigo-500/14 blur-3xl",
            ),
          ],
          [],
        ),
        html.div(
          [
            attribute.class(
              "pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl",
            ),
          ],
          [],
        ),
        html.section(
          [
            attribute.class(
              "relative z-10 w-full max-w-2xl rounded-[32px] border border-white/12 bg-[linear-gradient(180deg,rgba(11,13,21,0.94),rgba(8,10,18,0.92))] px-6 py-8 text-center shadow-[0_28px_70px_rgba(0,0,0,0.4)] backdrop-blur-3xl md:px-10 md:py-10",
            ),
          ],
          [
            html.div([attribute.class("mb-5 flex justify-center")], [
              html.span(
                [
                  attribute.class(
                    "inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200",
                  ),
                ],
                [
                  icons.check_circle([attribute.class("h-4 w-4")]),
                  html.text(tr(ctx, "Переезд завершён", "Migration complete")),
                ],
              ),
            ]),
            html.h1(
              [
                attribute.class(
                  "text-balance text-4xl font-black tracking-tight text-white md:text-6xl",
                ),
              ],
              [
                html.text(tr(
                  ctx,
                  "Теперь мы на astraof.com",
                  "We are now on astraof.com",
                )),
              ],
            ),
            html.p(
              [
                attribute.class(
                  "mx-auto mt-5 max-w-xl text-base leading-relaxed text-zinc-300 md:text-lg",
                ),
              ],
              [
                html.text(tr(
                  ctx,
                  "Старый домен asrtal.ru оставлен только как временный bridge для совместимости. Вход, сайт и загрузки теперь открывайте через новый адрес.",
                  "The old asrtal.ru domain now stays online only as a temporary compatibility bridge. Open the site, sign in, and downloads on the new address.",
                )),
              ],
            ),
            html.div(
              [
                attribute.class(
                  "mt-6 space-y-3 text-left text-sm text-zinc-300 md:text-base",
                ),
              ],
              [
                bullet(tr(
                  ctx,
                  "Основной сайт и web-клиент: astraof.com",
                  "Primary site and web client: astraof.com",
                )),
                bullet(tr(
                  ctx,
                  "Загрузки и новые ссылки: astraof.com/download",
                  "Downloads and new links: astraof.com/download",
                )),
                bullet(tr(
                  ctx,
                  "Старый домен больше не должен использоваться для обычного входа и регистрации",
                  "The old domain should no longer be used for regular sign-in and registration",
                )),
              ],
            ),
            html.div(
              [
                attribute.class(
                  "mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center",
                ),
              ],
              [
                action_link(
                  "https://astraof.com",
                  icons.arrow_right([attribute.class("h-4 w-4")]),
                  tr(ctx, "Открыть astraof.com", "Open astraof.com"),
                  True,
                  True,
                ),
                action_link(
                  "https://astraof.com/login",
                  icons.sparkle([attribute.class("h-4 w-4")]),
                  tr(ctx, "Войти", "Sign in"),
                  True,
                  False,
                ),
                action_link(
                  "https://astraof.com/download",
                  icons.download([attribute.class("h-4 w-4")]),
                  tr(ctx, "Скачать приложение", "Download app"),
                  True,
                  False,
                ),
              ],
            ),
          ],
        ),
      ],
    ),
  ]

  layout.render(
    req,
    ctx,
    PageMeta(
      title: tr(ctx, "Мы переехали на astraof.com", "We moved to astraof.com"),
      description: tr(
        ctx,
        "Сайт и сервисы Astra переехали на astraof.com. Старый домен оставлен только как bridge для совместимости.",
        "Astra moved to astraof.com. The old domain remains only as a temporary compatibility bridge.",
      ),
      og_type: "website",
    ),
    content,
  )
  |> element.to_document_string_tree
  |> wisp.html_response(200)
}

fn bullet(text: String) -> element.Element(a) {
  html.div([attribute.class("flex gap-3")], [
    html.span([attribute.class("mt-1 text-indigo-300")], [html.text("•")]),
    html.span([], [html.text(text)]),
  ])
}

fn action_link(
  url: String,
  icon: element.Element(a),
  label: String,
  is_primary: Bool,
  external: Bool,
) -> element.Element(a) {
  let attrs = [
    attribute.href(url),
    attribute.class(case is_primary {
      True ->
        "inline-flex items-center justify-center gap-3 rounded-2xl border border-indigo-200/45 bg-white px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-zinc-200"
      False ->
        "inline-flex items-center justify-center gap-3 rounded-2xl border border-white/12 bg-white/6 px-6 py-3 text-sm font-semibold text-zinc-100 transition-colors hover:bg-white/12"
    }),
  ]

  let attrs = case external {
    True ->
      attrs
      |> list.append([
        attribute.target("_blank"),
        attribute.rel("noopener noreferrer"),
      ])
    False -> attrs
  }

  html.a(attrs, [icon, html.text(label)])
}
