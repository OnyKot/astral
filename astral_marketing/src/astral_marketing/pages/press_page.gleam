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
import astral_marketing/i18n
import astral_marketing/icons
import astral_marketing/pages/layout
import astral_marketing/pages/layout/meta.{PageMeta}
import astral_marketing/web.{type Context}
import kielet.{gettext as g_}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import wisp

pub fn render(req: wisp.Request, ctx: Context) -> wisp.Response {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  let content = [
    hero_section(ctx),
    assets_section(ctx),
    contact_section(ctx),
  ]

  layout.render(
    req,
    ctx,
    PageMeta(
      title: g_(i18n_ctx, "Press & Brand Assets"),
      description: g_(
        i18n_ctx,
        "Download Astral logos, brand assets, and get in touch with our press team",
      ),
      og_type: "website",
    ),
    content,
  )
  |> element.to_document_string_tree
  |> wisp.html_response(200)
}

fn hero_section(ctx: Context) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  hero_base.render(hero_base.HeroConfig(
    icon: icons.newspaper([
      attribute.class("h-14 w-14 md:h-18 md:w-18 text-white"),
    ]),
    title: g_(i18n_ctx, "Press & Brand Assets"),
    description: g_(
      i18n_ctx,
      "Download our logos, brand files, and the essentials your editorial team needs to present Astral correctly.",
    ),
    extra_content: element.none(),
    custom_padding: hero_base.default_padding(),
  ))
}

fn assets_section(ctx: Context) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  html.section([attribute.class("px-6 py-10 md:py-14")], [
    html.div([attribute.class("mx-auto grid max-w-6xl gap-6 md:grid-cols-3")], [
      asset_card(
        ctx,
        g_(i18n_ctx, "White Logo"),
        g_(i18n_ctx, "Best for dark surfaces and video frames."),
        ctx.cdn_endpoint <> "/marketing/branding/logo-white.svg",
        "bg-[#111827]",
      ),
      asset_card(
        ctx,
        g_(i18n_ctx, "Color Logo"),
        g_(i18n_ctx, "Primary lockup for product stories and partner mentions."),
        ctx.cdn_endpoint <> "/marketing/branding/logo-color.svg",
        "bg-[#f8fafc]",
      ),
      asset_card(
        ctx,
        g_(i18n_ctx, "Symbol Pack"),
        g_(i18n_ctx, "Standalone symbol for avatars, thumbnails, and compact slots."),
        ctx.cdn_endpoint <> "/marketing/branding/symbol-color.svg",
        "bg-[#f8fafc]",
      ),
    ]),
  ])
}

fn contact_section(ctx: Context) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  html.section([attribute.class("px-6 py-10 md:py-14")], [
    html.div([attribute.class("marketing-panel mx-auto max-w-4xl px-6 py-10 text-center md:px-10 md:py-14")], [
      html.p([attribute.class("marketing-kicker mx-auto")], [
        html.text(g_(i18n_ctx, "Press contact")),
      ]),
      html.h2([attribute.class("marketing-title mt-6")], [
        html.text(g_(i18n_ctx, "Need quotes, assets, or a fast clarification?")),
      ]),
      html.p([attribute.class("marketing-subtitle mx-auto mt-4 max-w-2xl")], [
        html.text(g_(
          i18n_ctx,
          "Write to the Astral press inbox. We can provide logos, product notes, and direct answers for editorial requests.",
        )),
      ]),
      html.a(
        [
          attribute.href("mailto:press@astraof.com"),
          attribute.class(
            "liquid-glass interactive-glass mt-8 inline-flex items-center justify-center rounded-full px-8 py-4 text-white transition-colors hover:bg-white/8",
          ),
        ],
        [html.text("press@astraof.com")],
      ),
    ]),
  ])
}

fn asset_card(
  ctx: Context,
  title: String,
  description: String,
  asset_path: String,
  preview_class: String,
) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  html.div([attribute.class("marketing-panel reveal-card overflow-hidden rounded-[28px]")], [
    html.div(
      [
        attribute.class(
          "flex aspect-[4/3] items-center justify-center p-10 " <> preview_class,
        ),
      ],
      [
        html.img([
          attribute.src(asset_path),
          attribute.alt(title),
          attribute.class("max-h-28 w-auto"),
        ]),
      ],
    ),
    html.div([attribute.class("h-px bg-white/10")], []),
    html.div([attribute.class("flex items-start justify-between gap-4 p-6")], [
      html.div([attribute.class("min-w-0 flex-1 text-left")], [
        html.h3([attribute.class("title-sm text-white")], [html.text(title)]),
        html.p([attribute.class("body-sm mt-2 text-[hsl(var(--muted-foreground))]")], [
          html.text(description),
        ]),
      ]),
      html.a(
        [
          attribute.href(asset_path),
          attribute.target("_blank"),
          attribute.download(asset_path),
          attribute.attribute("aria-label", g_(i18n_ctx, "Download")),
          attribute.class(
            "liquid-glass interactive-glass flex h-11 w-11 items-center justify-center rounded-full text-white transition-colors hover:bg-white/8",
          ),
        ],
        [icons.download([attribute.class("h-5 w-5")])],
      ),
    ]),
  ])
}
