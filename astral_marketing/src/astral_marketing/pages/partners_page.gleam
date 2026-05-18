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
import gleam/option.{None}
import kielet.{gettext as g_}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import wisp

pub fn render(req: wisp.Request, ctx: Context) -> wisp.Response {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  let content = [
    hero_section(ctx),
    perks_section(ctx),
    cta_section(ctx),
  ]

  layout.render(
    req,
    ctx,
    PageMeta(
      title: g_(i18n_ctx, "Astral Partner"),
      description: g_(
        i18n_ctx,
        "Join the Astral Partner Program and unlock exclusive benefits for you and your community",
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
    icon: icons.astral_partner([
      attribute.class("h-14 w-14 md:h-18 md:w-18"),
    ]),
    title: g_(i18n_ctx, "Become an Astral Partner"),
    description: g_(
      i18n_ctx,
      "A focused program for creators and communities that need visibility, direct support, and better rollout access.",
    ),
    extra_content: element.none(),
    custom_padding: hero_base.default_padding(),
  ))
}

fn perks_section(ctx: Context) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  html.section([attribute.class("px-6 py-10 md:py-14")], [
    html.div([attribute.class("mx-auto max-w-6xl")], [
      html.div([attribute.class("mb-12 text-center md:mb-16")], [
        html.h2([attribute.class("marketing-title")], [
          html.text(g_(i18n_ctx, "What partners get")),
        ]),
        html.p([attribute.class("marketing-subtitle mx-auto mt-4 max-w-3xl")], [
          html.text(g_(
            i18n_ctx,
            "The program is built around practical support: distribution, trust signals, product access, and a direct line to the team.",
          )),
        ]),
      ]),
      html.div([attribute.class("grid gap-6 md:grid-cols-2 xl:grid-cols-3")], [
        perk_card(
          icons.astral_premium(None, [attribute.class("h-7 w-7 text-white")]),
          g_(i18n_ctx, "Plutonium access"),
          g_(i18n_ctx, "Premium capabilities for the main account and better room to experiment."),
        ),
        perk_card(
          icons.seal_check([attribute.class("h-7 w-7 text-white")]),
          g_(i18n_ctx, "Verification"),
          g_(i18n_ctx, "Clear authenticity signals for your community and public presence."),
        ),
        perk_card(
          icons.link([attribute.class("h-7 w-7 text-white")]),
          g_(i18n_ctx, "Vanity URL"),
          g_(i18n_ctx, "A cleaner public entry point for campaigns, servers, and creator identity."),
        ),
        perk_card(
          icons.rocket([attribute.class("h-7 w-7 text-white")]),
          g_(i18n_ctx, "Early rollout access"),
          g_(i18n_ctx, "Preview product changes before the broader release cycle reaches everyone else."),
        ),
        perk_card(
          icons.microphone([attribute.class("h-7 w-7 text-white")]),
          g_(i18n_ctx, "Voice priority"),
          g_(i18n_ctx, "Closer coordination for voice-driven communities and live event use cases."),
        ),
        perk_card(
          icons.astral_staff([attribute.class("h-7 w-7 text-white")]),
          g_(i18n_ctx, "Direct team channel"),
          g_(i18n_ctx, "Fast contact with Astral when you need a decision, clarification, or deployment help."),
        ),
      ]),
    ]),
  ])
}

fn perk_card(icon: Element(a), title: String, description: String) -> Element(a) {
  html.div([attribute.class("marketing-panel reveal-card rounded-[28px] p-6 md:p-7")], [
    html.div([attribute.class("inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/8")], [
      icon,
    ]),
    html.h3([attribute.class("title-sm mt-5 text-white")], [html.text(title)]),
    html.p([attribute.class("body mt-3 text-[hsl(var(--muted-foreground))]")], [
      html.text(description),
    ]),
  ])
}

fn cta_section(ctx: Context) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  html.section([attribute.class("px-6 py-10 md:py-14")], [
    html.div([attribute.class("marketing-panel mx-auto max-w-4xl px-6 py-10 text-center md:px-10 md:py-14")], [
      html.p([attribute.class("marketing-kicker mx-auto")], [
        html.text(g_(i18n_ctx, "Application")),
      ]),
      html.h2([attribute.class("marketing-title mt-6")], [
        html.text(g_(i18n_ctx, "Send your project and audience details")),
      ]),
      html.p([attribute.class("marketing-subtitle mx-auto mt-4 max-w-2xl")], [
        html.text(g_(
          i18n_ctx,
          "Include who you are, where your community lives, and how you plan to use Astral. That is enough for the first pass.",
        )),
      ]),
      html.a(
        [
          attribute.href("mailto:partners@astraof.com"),
          attribute.class(
            "liquid-glass interactive-glass mt-8 inline-flex items-center justify-center rounded-full px-8 py-4 text-white transition-colors hover:bg-white/8",
          ),
        ],
        [html.text(g_(i18n_ctx, "Apply at partners@astraof.com"))],
      ),
    ]),
  ])
}
