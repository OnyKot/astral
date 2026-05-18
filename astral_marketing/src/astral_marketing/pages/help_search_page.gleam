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
import gleam/list
import gleam/string
import kielet.{gettext as g_}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import wisp

pub fn render(req: wisp.Request, ctx: Context, query: String) -> wisp.Response {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  let help_data = help_center.load_help_articles(ctx.locale)
  let results = help_center.search_articles(help_data, query)

  let content = [page_main(ctx, query, results)]

  layout.render(
    req,
    ctx,
    PageMeta(
      title: g_(i18n_ctx, "Search Results")
        <> " - "
        <> g_(i18n_ctx, "Help Center"),
      description: g_(i18n_ctx, "Search results for: ") <> query,
      og_type: "website",
    ),
    content,
  )
  |> element.to_document_string_tree
  |> wisp.html_response(200)
}

fn page_main(
  ctx: Context,
  query: String,
  results: List(help_center.HelpArticle),
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
    hero_section(ctx, query),
    results_section(ctx, query, results),
  ])
}

fn hero_section(ctx: Context, query: String) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  help_components.hero_section(
    ctx,
    g_(i18n_ctx, "How can we help?"),
    g_(i18n_ctx, "Search our help articles or browse by category."),
    web.prepend_base_path(ctx, "/help/search"),
    g_(i18n_ctx, "Search for help..."),
    query,
  )
}

fn results_section(
  ctx: Context,
  query: String,
  results: List(help_center.HelpArticle),
) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  html.section(
    [
      attribute.class(
        "relative z-10 border-t border-white/10 px-6 py-16 md:py-24",
      ),
    ],
    [
      html.div([attribute.class("mx-auto max-w-4xl")], [
        html.div(
          [
            attribute.class(
              "motion-reveal mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
            ),
          ],
          [
            html.div([attribute.class("body-sm text-zinc-300/80")], [
              html.text(case list.length(results) {
                0 ->
                  g_(i18n_ctx, "No results found for") <> " \"" <> query <> "\""
                1 ->
                  "1 " <> g_(i18n_ctx, "result for") <> " \"" <> query <> "\""
                n ->
                  string.inspect(n)
                  <> " "
                  <> g_(i18n_ctx, "results for")
                  <> " \""
                  <> query
                  <> "\""
              }),
            ]),
            html.a(
              [
                href(ctx, "/help"),
                attribute.class(
                  "label text-sm text-indigo-200 hover:underline flex items-center gap-2",
                ),
              ],
              [
                icons.arrow_right([attribute.class("h-4 w-4 rotate-180")]),
                html.text(g_(i18n_ctx, "Back to Help Center")),
              ],
            ),
          ],
        ),
        case list.is_empty(results) {
          True ->
            html.div(
              [
                attribute.class(
                  "motion-reveal rounded-3xl border border-white/10 bg-white/5 p-12 text-center shadow-[0_22px_50px_rgba(0,0,0,0.35)] backdrop-blur-2xl",
                ),
              ],
              [
                html.div([attribute.class("mb-6 flex justify-center")], [
                  icons.magnifying_glass([
                    attribute.class("h-16 w-16 text-zinc-500"),
                  ]),
                ]),
                html.h3([attribute.class("title-sm mb-2 text-zinc-100")], [
                  html.text(g_(i18n_ctx, "No articles found")),
                ]),
                html.p([attribute.class("body mb-6 text-zinc-300/80")], [
                  html.text(g_(
                    i18n_ctx,
                    "Try different keywords or browse our categories.",
                  )),
                ]),
                html.a(
                  [
                    href(ctx, "/help"),
                    attribute.class(
                      "label inline-block rounded-xl bg-indigo-500 px-6 py-3 text-white transition hover:bg-indigo-400",
                    ),
                  ],
                  [html.text(g_(i18n_ctx, "Browse Categories"))],
                ),
              ],
            )
          False ->
            html.div([attribute.class("space-y-3 md:space-y-4")], {
              results
              |> list.index_map(fn(article, index) {
                result_card(ctx, article, index)
              })
            })
        },
      ]),
    ],
  )
}

fn result_card(
  ctx: Context,
  article: help_center.HelpArticle,
  index: Int,
) -> Element(a) {
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
      html.div([attribute.class("body-sm mb-2 text-zinc-300/70")], [
        html.text(article.category_title),
      ]),
      html.h3(
        [
          attribute.class(
            "title-sm mb-2 text-zinc-100 group-hover:text-indigo-200",
          ),
        ],
        [html.text(article.title)],
      ),
      html.p([attribute.class("body text-zinc-300/80")], [
        html.text(article.description),
      ]),
    ],
  )
}
