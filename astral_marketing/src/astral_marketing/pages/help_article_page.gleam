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
import astral_marketing/markdown_utils
import astral_marketing/pages/help_components
import astral_marketing/pages/layout
import astral_marketing/pages/layout/meta.{PageMeta}
import astral_marketing/pages/not_found_page
import astral_marketing/web.{type Context, href}
import gleam/list
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
  article_slug: String,
) -> wisp.Response {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  let help_data = help_center.load_help_articles(ctx.locale)

  case help_center.get_article(help_data, category_name, article_slug) {
    Ok(article) -> {
      let content = [page_main(ctx, article, help_data)]

      layout.render(
        req,
        ctx,
        PageMeta(
          title: article.title <> " | " <> g_(i18n_ctx, "Help Center"),
          description: article.description,
          og_type: "article",
        ),
        content,
      )
      |> element.to_document_string_tree
      |> wisp.html_response(200)
    }
    Error(_) -> not_found_page.render(req, ctx)
  }
}

pub fn render_with_locale(
  req: wisp.Request,
  ctx: Context,
  article: help_center.HelpArticle,
  help_data: help_center.HelpCenterData,
) -> wisp.Response {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  let content = [page_main_with_sidebar(ctx, article, help_data)]

  layout.render(
    req,
    ctx,
    PageMeta(
      title: article.title <> " | " <> g_(i18n_ctx, "Help Center"),
      description: article.description,
      og_type: "article",
    ),
    content,
  )
  |> element.to_document_string_tree
  |> wisp.html_response(200)
}

fn page_main(
  ctx: Context,
  article: help_center.HelpArticle,
  help_data: help_center.HelpCenterData,
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
    hero_section(ctx, article),
    article_section(ctx, article, help_data),
    help_components.ai_chat_widget(locale.get_code_from_locale(ctx.locale)),
  ])
}

fn page_main_with_sidebar(
  ctx: Context,
  article: help_center.HelpArticle,
  help_data: help_center.HelpCenterData,
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
    hero_section(ctx, article),
    article_section_with_sidebar(ctx, article, help_data),
  ])
}

fn hero_section(ctx: Context, article: help_center.HelpArticle) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  html.section(
    [
      attribute.class(
        "relative z-10 px-6 pt-48 md:pt-60 pb-16 md:pb-20 lg:pb-24 text-white",
      ),
    ],
    [
      html.div([attribute.class("mx-auto max-w-4xl")], [
        html.div(
          [
            attribute.class(
              "motion-reveal motion-delay-1 mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/70",
            ),
          ],
          [
            html.a(
              [
                href(ctx, "/help"),
                attribute.class("hover:text-white hover:underline"),
              ],
              [html.text(g_(i18n_ctx, "Help Center"))],
            ),
            html.span([], [html.text(" / ")]),
            html.a(
              [
                href(
                  ctx,
                  "/help/"
                    <> string.lowercase(locale.get_code_from_locale(ctx.locale))
                    <> "/"
                    <> article.category,
                ),
                attribute.class("hover:text-white hover:underline"),
              ],
              [html.text(article.category_title)],
            ),
          ],
        ),
        html.h1(
          [
            attribute.class("motion-reveal motion-delay-2 hero mb-4 md:mb-5"),
          ],
          [
            html.text(article.title),
          ],
        ),
        html.p(
          [
            attribute.class(
              "motion-reveal motion-delay-3 body-lg text-white/90 max-w-3xl",
            ),
          ],
          [
            html.text(article.description),
          ],
        ),
      ]),
    ],
  )
}

fn article_section(
  ctx: Context,
  article: help_center.HelpArticle,
  help_data: help_center.HelpCenterData,
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
              "motion-reveal mb-6 flex items-center justify-between gap-3 text-sm text-zinc-300/80",
            ),
          ],
          [
            html.a(
              [
                href(
                  ctx,
                  "/help/"
                    <> string.lowercase(locale.get_code_from_locale(ctx.locale))
                    <> "/"
                    <> article.category,
                ),
                attribute.class(
                  "label text-sm text-indigo-200 hover:underline flex items-center gap-2",
                ),
              ],
              [
                icons.arrow_right([attribute.class("h-4 w-4 rotate-180")]),
                html.text(g_(i18n_ctx, "Back to ") <> article.category_title),
              ],
            ),
          ],
        ),
        html.article(
          [
            attribute.class(
              "policy-prose motion-reveal motion-delay-2 prose prose-invert prose-lg max-w-none rounded-3xl border border-white/12 bg-white/5 p-6 md:p-10 shadow-[0_22px_50px_rgba(0,0,0,0.35)] backdrop-blur-2xl prose-p:first-of-type:!mt-0",
            ),
          ],
          [
            markdown_utils.render_markdown_to_element(
              article.content,
              ctx,
              help_data,
            ),
          ],
        ),
        html.div(
          [
            attribute.class(
              "motion-reveal mt-10 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_22px_50px_rgba(0,0,0,0.35)] backdrop-blur-2xl",
            ),
          ],
          [
            html.h3([attribute.class("title-sm mb-3 text-zinc-100")], [
              html.text(g_(i18n_ctx, "Still need help?")),
            ]),
            html.p([attribute.class("body mb-4 text-zinc-300/80")], [
              html.text(g_(
                i18n_ctx,
                "If you couldn't find what you're looking for, our support team is here to help.",
              )),
            ]),
            html.a(
              [
                attribute.href("mailto:support@astraof.com"),
                attribute.class(
                  "label inline-block rounded-xl bg-indigo-500 px-6 py-3 text-white transition hover:bg-indigo-400",
                ),
              ],
              [html.text(g_(i18n_ctx, "Contact Support"))],
            ),
          ],
        ),
      ]),
    ],
  )
}

fn article_section_with_sidebar(
  ctx: Context,
  article: help_center.HelpArticle,
  help_data: help_center.HelpCenterData,
) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)
  let locale_code = locale.get_code_from_locale(ctx.locale)

  let category_articles =
    help_data.all_articles
    |> list.filter(fn(a) { a.category == article.category })

  html.section(
    [
      attribute.class(
        "relative z-10 border-t border-white/10 px-6 py-16 md:py-24",
      ),
    ],
    [
      html.div([attribute.class("mx-auto max-w-7xl")], [
        html.div([attribute.class("flex flex-col lg:flex-row gap-8")], [
          html.aside(
            [
              attribute.class(
                "motion-reveal w-full lg:w-64 flex-shrink-0 lg:sticky lg:top-32 lg:self-start",
              ),
            ],
            [
              html.div([attribute.class("mb-6")], [
                html.a(
                  [
                    href(ctx, "/help"),
                    attribute.class(
                      "label text-indigo-200 hover:underline flex items-center gap-2",
                    ),
                  ],
                  [
                    icons.arrow_right([attribute.class("h-4 w-4 rotate-180")]),
                    html.text(g_(i18n_ctx, "Back to Help Center")),
                  ],
                ),
              ]),
              html.div(
                [
                  attribute.class(
                    "rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_22px_50px_rgba(0,0,0,0.35)] backdrop-blur-2xl",
                  ),
                ],
                [
                  html.h3([attribute.class("subtitle mb-4 text-zinc-100")], [
                    html.text(g_(i18n_ctx, "Articles in this section")),
                  ]),
                  html.ul([attribute.class("space-y-2")], {
                    category_articles
                    |> list.map(fn(a) {
                      let is_current = a.snowflake_id == article.snowflake_id
                      let url =
                        web.prepend_base_path(
                          ctx,
                          "/help/"
                            <> string.lowercase(locale_code)
                            <> "/articles/"
                            <> a.snowflake_id
                            <> "-"
                            <> help_center.create_slug(a.title),
                        )

                      html.li([], [
                        html.a(
                          [
                            attribute.href(url),
                            attribute.class(case is_current {
                              True ->
                                "block text-indigo-200 font-semibold hover:underline"
                              False ->
                                "block text-zinc-300/80 hover:text-indigo-200 hover:underline"
                            }),
                          ],
                          [html.text(a.title)],
                        ),
                      ])
                    })
                  }),
                ],
              ),
            ],
          ),
          html.div([attribute.class("flex-1 min-w-0")], [
            html.article(
              [
                attribute.class(
                  "policy-prose motion-reveal motion-delay-2 prose prose-invert prose-lg max-w-none rounded-3xl border border-white/12 bg-white/5 p-6 md:p-10 shadow-[0_22px_50px_rgba(0,0,0,0.35)] backdrop-blur-2xl prose-p:first-of-type:!mt-0",
                ),
              ],
              [
                markdown_utils.render_markdown_to_element(
                  article.content,
                  ctx,
                  help_data,
                ),
              ],
            ),
            html.div(
              [
                attribute.class(
                  "motion-reveal mt-12 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_22px_50px_rgba(0,0,0,0.35)] backdrop-blur-2xl",
                ),
              ],
              [
                html.h3([attribute.class("title-sm mb-4 text-zinc-100")], [
                  html.text(g_(i18n_ctx, "Still need help?")),
                ]),
                html.p([attribute.class("body mb-4 text-zinc-300/80")], [
                  html.text(g_(
                    i18n_ctx,
                    "If you couldn't find what you're looking for, our support team is here to help.",
                  )),
                ]),
                html.a(
                  [
                    attribute.href("mailto:support@astraof.com"),
                    attribute.class(
                      "label inline-block rounded-xl bg-indigo-500 px-6 py-3 text-white transition hover:bg-indigo-400",
                    ),
                  ],
                  [html.text(g_(i18n_ctx, "Contact Support"))],
                ),
              ],
            ),
          ]),
        ]),
      ]),
    ],
  )
}

