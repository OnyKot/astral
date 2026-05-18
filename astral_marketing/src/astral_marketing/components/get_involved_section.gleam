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

import astral_marketing/components/support_card
import astral_marketing/help_center
import astral_marketing/i18n
import astral_marketing/web.{type Context}
import kielet.{gettext as g_}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html

pub fn render(ctx: Context) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)
  let help_data = help_center.load_help_articles(ctx.locale)
  let bug_article_href =
    help_center.article_href(ctx.locale, help_data, "1447264362996695040")

  html.section(
    [
      attribute.class(
        "bg-gradient-to-b from-[#0b0b0d] to-[#09090b] px-6 py-24 md:py-40 reveal-section",
      ),
      attribute.id("get-involved"),
      attribute.style("scroll-margin-top", "8rem"),
    ],
    [
      html.div([attribute.class("mx-auto max-w-7xl")], [
        html.div([attribute.class("mb-20 md:mb-24 text-center animate-fade-up")], [
          html.h2(
            [
              attribute.class(
                "display mb-8 md:mb-10 text-white text-4xl md:text-5xl lg:text-6xl",
              ),
            ],
            [html.text(g_(i18n_ctx, "Get involved"))],
          ),
          html.p(
            [
              attribute.class(
                "lead mx-auto max-w-3xl text-zinc-300 text-xl md:text-2xl",
              ),
            ],
            [
              html.text(g_(
                i18n_ctx,
                "We're building a complete platform with all the features you'd expect. But we can't do it without your help!",
              )),
            ],
          ),
        ]),
        html.div(
          [
            attribute.class("grid gap-10 md:gap-12 grid-cols-1 md:grid-cols-2 animate-fade-up delay-1"),
          ],
          [
            support_card.render(
              ctx,
              "rocket-launch",
              g_(i18n_ctx, "Join and spread the word"),
              g_(
                i18n_ctx,
                "We're limiting registrations during beta. Once you're in, you can give friends a code to skip the queue.",
              ),
              g_(i18n_ctx, "Register now"),
              ctx.app_endpoint <> "/register",
            ),
            support_card.render(
              ctx,
              "bug",
              g_(i18n_ctx, "Report bugs"),
              g_(
                i18n_ctx,
                "Approved reports grant access to Astral Testers, where you can earn points and the Bug Hunter badge.",
              ),
              g_(i18n_ctx, "Read the Guide"),
              bug_article_href,
            ),
            support_card.render(
              ctx,
              "code",
              g_(i18n_ctx, "Contribute code"),
              g_(
                i18n_ctx,
                "Astral is independent and community-funded. Share ideas, UX issues, and feature requests with the team.",
              ),
              g_(i18n_ctx, "Contact product team"),
              "mailto:product@astraof.com",
            ),
            support_card.render(
              ctx,
              "shield-check",
              g_(i18n_ctx, "Found a security issue?"),
              g_(
                i18n_ctx,
                "We appreciate responsible disclosure via our Security Bug Bounty page.",
              ),
              g_(i18n_ctx, "Security Bug Bounty"),
              "/security",
            ),
          ],
        ),
      ]),
    ],
  )
}

