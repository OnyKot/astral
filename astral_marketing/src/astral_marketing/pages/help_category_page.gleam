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
import astral_marketing/pages/not_found_page
import astral_marketing/web.{type Context, href}
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import kielet.{gettext as g_}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import wisp

pub fn render(
  req: wisp.Request,
  ctx: Context,
  category_name: String,
  search_query: option.Option(String),
) -> wisp.Response {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  let help_data = help_center.load_help_articles(ctx.locale)

  case help_center.get_category(help_data, category_name) {
    Ok(category) -> {
      let articles = case search_query {
        Some(query) ->
          help_center.search_articles(help_data, query)
          |> help_center.filter_by_category(category_name)
        None -> category.articles
      }

      let content = [page_main(ctx, category, articles, search_query)]

      layout.render(
        req,
        ctx,
        PageMeta(
          title: category.title <> " | " <> g_(i18n_ctx, "Help Center"),
          description: g_(i18n_ctx, "Browse help articles about ")
            <> string.lowercase(category.title)
            <> ".",
          og_type: "website",
        ),
        content,
      )
      |> element.to_document_string_tree
      |> wisp.html_response(200)
    }
    Error(_) -> not_found_page.render(req, ctx)
  }
}

fn page_main(
  ctx: Context,
  category: help_center.HelpCategory,
  articles: List(help_center.HelpArticle),
  search_query: option.Option(String),
) -> Element(a) {
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
    hero_section(ctx, category, search_query),
    articles_section(ctx, category, articles, search_query),
  ])
}

fn hero_section(
  ctx: Context,
  category: help_center.HelpCategory,
  search_query: option.Option(String),
) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)
  let locale_code = locale.get_code_from_locale(ctx.locale) |> string.lowercase

  help_components.hero_section(
    ctx,
    category.title,
    g_(i18n_ctx, "Search our help articles or browse by category."),
    web.prepend_base_path(ctx, "/help/" <> locale_code <> "/" <> category.name),
    g_(i18n_ctx, "Search in " <> category.title <> "..."),
    case search_query {
      Some(q) -> q
      None -> ""
    },
  )
}

fn articles_section(
  ctx: Context,
  category: help_center.HelpCategory,
  articles: List(help_center.HelpArticle),
  search_query: option.Option(String),
) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)
  let locale_code = locale.get_code_from_locale(ctx.locale) |> string.lowercase

  html.section(
    [
      attribute.class(
        "relative z-10 border-t border-white/10 px-6 py-16 md:py-24",
      ),
    ],
    [
      html.div([attribute.class("mx-auto max-w-4xl")], [
        case search_query {
          Some(query) ->
            html.div(
              [
                attribute.class(
                  "motion-reveal mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
                ),
              ],
              [
                html.div([attribute.class("body-sm text-zinc-300/80")], [
                  html.text(
                    g_(i18n_ctx, "Search results for") <> " \"" <> query <> "\"",
                  ),
                ]),
                html.a(
                  [
                    href(ctx, "/help/" <> locale_code <> "/" <> category.name),
                    attribute.class(
                      "label text-sm text-indigo-200 hover:underline",
                    ),
                  ],
                  [html.text(g_(i18n_ctx, "Clear search"))],
                ),
              ],
            )
          None ->
            html.div([attribute.class("motion-reveal mb-10 text-left")], [
              html.h2([attribute.class("headline text-zinc-100 mb-2")], [
                html.text(g_(i18n_ctx, "Articles in ") <> category.title),
              ]),
              html.p([attribute.class("body text-zinc-300/80")], [
                html.text(g_(
                  i18n_ctx,
                  "Choose a guide below or search again if you don't see what you need.",
                )),
              ]),
            ])
        },
        case list.is_empty(articles) {
          True ->
            html.div(
              [
                attribute.class(
                  "motion-reveal rounded-3xl border border-white/10 bg-white/5 p-10 text-center shadow-[0_22px_50px_rgba(0,0,0,0.35)] backdrop-blur-2xl",
                ),
              ],
              [
                html.p([attribute.class("body text-zinc-300/80")], [
                  html.text(g_(i18n_ctx, "No articles found.")),
                ]),
                html.a(
                  [
                    href(ctx, "/help/" <> locale_code <> "/" <> category.name),
                    attribute.class(
                      "mt-4 inline-block label text-sm text-indigo-200 hover:underline",
                    ),
                  ],
                  [html.text(g_(i18n_ctx, "View all articles"))],
                ),
              ],
            )
          False ->
            html.div([attribute.class("space-y-3 md:space-y-4")], {
              articles
              |> list.index_map(fn(article, index) {
                article_card(ctx, article, index)
              })
            })
        },
      ]),
    ],
  )
}

fn article_card(
  ctx: Context,
  article: help_center.HelpArticle,
  index: Int,
) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  let locale_code = locale.get_code_from_locale(ctx.locale)
  let url =
    web.prepend_base_path(
      ctx,
      "/help/"
        <> string.lowercase(locale_code)
        <> "/articles/"
        <> article.snowflake_id
        <> "-"
        <> help_center.create_slug(article.title),
    )

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
      attribute.href(url),
      attribute.class(
        "reveal-card motion-reveal "
        <> delay_class
        <> " group block rounded-3xl border border-white/10 bg-white/5 p-6 md:p-7 shadow-[0_22px_50px_rgba(0,0,0,0.35)] backdrop-blur-2xl",
      ),
    ],
    [
      html.h3(
        [
          attribute.class(
            "title-sm mb-2 text-zinc-100 group-hover:text-indigo-200",
          ),
        ],
        [
          html.text(article.title),
        ],
      ),
      html.p([attribute.class("body text-zinc-300/80")], [
        html.text(article.description),
      ]),
      html.div(
        [
          attribute.class(
            "mt-3 flex items-center gap-2 text-indigo-200 body-sm",
          ),
        ],
        [
          html.span([], [html.text(g_(i18n_ctx, "Read article"))]),
          icons.arrow_right([
            attribute.class(
              "h-4 w-4 transition-transform group-hover:translate-x-0.5",
            ),
          ]),
        ],
      ),
    ],
  )
}
