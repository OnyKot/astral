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

import astral_marketing/components/hero_base
import astral_marketing/help_center
import astral_marketing/i18n
import astral_marketing/icons
import astral_marketing/markdown_utils
import astral_marketing/pages/layout
import astral_marketing/pages/layout/meta.{PageMeta}
import astral_marketing/web.{type Context}
import kielet.{gettext as g_}
import lustre/attribute
import lustre/element.{none, to_document_string_tree, type Element}
import lustre/element/html
import wisp

pub fn render(req: wisp.Request, ctx: Context) -> wisp.Response {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)
  let help_data = help_center.load_help_articles(ctx.locale)

  let markdown_element =
    markdown_utils.load_markdown_with_fallback("priv/company", ctx.locale)
    |> markdown_utils.render_markdown_to_element(ctx, help_data)

  let content = [
    hero_section(ctx),
    article_section(ctx, markdown_element),
  ]

  layout.render(
    req,
    ctx,
    PageMeta(
      title: g_(i18n_ctx, "Company Information"),
      description: g_(i18n_ctx, "Learn about Astral and our mission"),
      og_type: "article",
    ),
    content,
  )
  |> to_document_string_tree
  |> wisp.html_response(200)
}

fn hero_section(ctx: Context) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  hero_base.render(hero_base.HeroConfig(
    icon: icons.globe([attribute.class("h-14 w-14 md:h-18 md:w-18 text-white")]),
    title: g_(i18n_ctx, "Company Information"),
    description: g_(
      i18n_ctx,
      "What Astral is building, how the platform is positioned, and the context behind the product direction.",
    ),
    extra_content: none(),
    custom_padding: hero_base.default_padding(),
  ))
}

fn article_section(_ctx: Context, markdown_element: Element(a)) -> Element(a) {
  html.section([attribute.class("px-6 pb-16 md:pb-20")], [
    html.div([attribute.class("mx-auto max-w-5xl")], [
      html.article(
        [
          attribute.class(
            "policy-prose prose prose-invert prose-lg marketing-panel motion-reveal rounded-[32px] px-6 py-8 md:px-10 md:py-12 prose-headings:font-normal prose-headings:text-white prose-headings:font-accent prose-p:text-[hsl(var(--muted-foreground))] prose-li:text-[hsl(var(--muted-foreground))] prose-strong:text-white prose-a:text-white hover:prose-a:text-white/80",
          ),
        ],
        [markdown_element],
      ),
    ]),
  ])
}
