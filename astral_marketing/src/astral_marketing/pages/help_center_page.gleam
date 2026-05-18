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

import astral_marketing/help_center
import astral_marketing/i18n
import astral_marketing/icons
import astral_marketing/locale
import astral_marketing/pages/help_components
import astral_marketing/pages/layout
import astral_marketing/pages/layout/meta.{PageMeta}
import astral_marketing/web.{type Context, href}
import gleam/int
import gleam/list
import gleam/string
import kielet.{gettext as g_}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import wisp

pub fn render(req: wisp.Request, ctx: Context) -> wisp.Response {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  let help_data = help_center.load_help_articles(ctx.locale)

  let content = [page_main(ctx, help_data)]

  layout.render(
    req,
    ctx,
    PageMeta(
      title: g_(i18n_ctx, "Help Center"),
      description: g_(
        i18n_ctx,
        "Find answers to common questions and learn how to use Astral.",
      ),
      og_type: "website",
    ),
    content,
  )
  |> element.to_document_string_tree
  |> wisp.html_response(200)
}

fn page_main(ctx: Context, help_data: help_center.HelpCenterData) -> Element(a) {
  html.main([attribute.class("relative isolate overflow-hidden")], [
    html.div(
      [
        attribute.class(
          "pointer-events-none absolute -top-32 -left-20 h-96 w-96 rounded-full bg-indigo-500/18 blur-3xl",
        ),
      ],
      [],
    ),
    html.div(
      [
        attribute.class(
          "pointer-events-none absolute -right-20 top-16 h-[28rem] w-[28rem] rounded-full bg-cyan-400/12 blur-3xl",
        ),
      ],
      [],
    ),
    hero_section(ctx),
    categories_section(ctx, help_data),
    help_components.ai_chat_widget(locale.get_code_from_locale(ctx.locale)),
  ])
}

fn hero_section(ctx: Context) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  help_components.hero_section(
    ctx,
    g_(i18n_ctx, "How can we help?"),
    g_(i18n_ctx, "Search our help articles or browse by category."),
    web.prepend_base_path(ctx, "/help/search"),
    g_(i18n_ctx, "Search for help..."),
    "",
  )
}

fn categories_section(
  ctx: Context,
  help_data: help_center.HelpCenterData,
) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  html.section(
    [
      attribute.class(
        "relative z-10 border-t border-white/10 px-6 py-20 md:py-32",
      ),
    ],
    [
      html.div([attribute.class("mx-auto max-w-7xl")], [
        html.div(
          [
            attribute.class(
              "motion-reveal mb-12 md:mb-16 text-center max-w-3xl mx-auto",
            ),
          ],
          [
            html.h2(
              [
                attribute.class(
                  "display mb-4 text-zinc-100 text-4xl md:text-5xl lg:text-6xl",
                ),
              ],
              [html.text(g_(i18n_ctx, "Browse by category"))],
            ),
            html.p(
              [
                attribute.class("body-lg text-zinc-300/90"),
              ],
              [
                html.text(g_(
                  i18n_ctx,
                  "Find step-by-step guides and answers, organized by topic.",
                )),
              ],
            ),
          ],
        ),
        html.div(
          [
            attribute.class("grid gap-6 md:gap-8 md:grid-cols-2 lg:grid-cols-3"),
          ],
          {
            help_data.categories
            |> list.index_map(fn(category, index) {
              category_card(ctx, category, index)
            })
          },
        ),
      ]),
    ],
  )
}

fn category_card(
  ctx: Context,
  category: help_center.HelpCategory,
  index: Int,
) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)
  let locale_code = locale.get_code_from_locale(ctx.locale) |> string.lowercase

  let icon = get_icon_for_category(category.icon)

  let delay_class = case index {
    0 -> "motion-delay-1"
    1 -> "motion-delay-2"
    2 -> "motion-delay-3"
    3 -> "motion-delay-4"
    4 -> "motion-delay-5"
    _ -> ""
  }

  html.a(
    [
      href(ctx, "/help/" <> locale_code <> "/" <> category.name),
      attribute.class(
        "reveal-card motion-reveal "
        <> delay_class
        <> " group flex h-full flex-col justify-between rounded-3xl border border-white/10 bg-white/5 p-7 md:p-8 shadow-[0_22px_50px_rgba(0,0,0,0.35)] backdrop-blur-2xl",
      ),
    ],
    [
      html.div([attribute.class("mb-5 flex items-start gap-4")], [
        html.div(
          [
            attribute.class(
              "inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(99,102,241,0.26),rgba(34,211,238,0.10))] text-indigo-200 shadow-[0_18px_45px_rgba(0,0,0,0.35)] backdrop-blur",
            ),
          ],
          [icon],
        ),
        html.div([], [
          html.h3([attribute.class("title-sm mb-1 text-zinc-100")], [
            html.text(category.title),
          ]),
          html.p([attribute.class("body-sm text-zinc-300/80")], [
            html.text(
              int.to_string(category.article_count)
              <> " "
              <> case category.article_count {
                1 -> g_(i18n_ctx, "article")
                _ -> g_(i18n_ctx, "articles")
              },
            ),
          ]),
        ]),
      ]),
      html.div([attribute.class("mt-auto flex items-center justify-between")], [
        html.span(
          [
            attribute.class("label text-sm text-indigo-200"),
          ],
          [html.text(g_(i18n_ctx, "Browse articles"))],
        ),
        icons.arrow_right([
          attribute.class(
            "h-5 w-5 text-indigo-200 transition-transform group-hover:translate-x-0.5",
          ),
        ]),
      ]),
    ],
  )
}

fn get_icon_for_category(icon_name: String) -> Element(a) {
  let class = "h-6 w-6"

  case icon_name {
    "rocket_launch" -> icons.rocket_launch([attribute.class(class)])
    "shield_check" -> icons.shield_check([attribute.class(class)])
    "users_three" -> icons.users_three([attribute.class(class)])
    "sparkle" -> icons.sparkle([attribute.class(class)])
    "chats" -> icons.chats([attribute.class(class)])
    "gear" -> icons.gear([attribute.class(class)])
    "heart" -> icons.heart([attribute.class(class)])
    "brain" -> icons.brain([attribute.class(class)])
    "paperclip" -> icons.paperclip([attribute.class(class)])
    "question" -> icons.question([attribute.class(class)])
    _ -> icons.sparkle([attribute.class(class)])
  }
}
