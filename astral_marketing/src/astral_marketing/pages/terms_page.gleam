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
import astral_marketing/markdown_utils
import astral_marketing/pages/layout
import astral_marketing/web.{type Context}
import kielet.{gettext as g_}
import lustre/attribute
import lustre/element
import lustre/element/html
import wisp

pub fn render(req: wisp.Request, ctx: Context) -> wisp.Response {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)
  let help_data = help_center.load_help_articles(ctx.locale)
  let title = g_(i18n_ctx, "Terms of Service")
  let subtitle = g_(i18n_ctx, "Read the Astral Terms of Service")
  let markdown_element =
    markdown_utils.load_markdown_with_fallback("priv/terms", ctx.locale)
    |> markdown_utils.render_markdown_to_element(ctx, help_data)

  let content = [
    html.main([attribute.class("marketing-shell")], [
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
      html.section([attribute.class("motion-reveal")], [
        html.div([attribute.class("marketing-hero")], [
          html.h1([attribute.class("marketing-title mb-4")], [
            html.text(title),
          ]),
          html.p(
            [
              attribute.class("marketing-subtitle mx-auto max-w-2xl"),
            ],
            [html.text(subtitle)],
          ),
        ]),
      ]),
      html.section([attribute.class("mt-10 md:mt-14")], [
        html.div([attribute.class("mx-auto max-w-4xl")], [
          html.article(
            [
              attribute.class(
                "marketing-panel policy-prose motion-reveal motion-delay-2 p-6 md:p-10",
              ),
            ],
            [markdown_element],
          ),
        ]),
      ]),
    ]),
  ]

  layout.render(req, ctx, layout.article_page_meta(title, subtitle), content)
  |> element.to_document_string_tree
  |> wisp.html_response(200)
}
