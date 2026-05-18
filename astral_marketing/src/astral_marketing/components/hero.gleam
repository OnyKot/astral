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

import astral_marketing/components/platform_download_button
import astral_marketing/i18n
import astral_marketing/locale
import astral_marketing/web.{type Context}
import kielet.{gettext as g_}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html

pub fn render(ctx: Context) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  html.main(
    [
      attribute.class(
        "relative isolate overflow-hidden flex flex-col items-center justify-center px-6 pb-20 pt-56 md:pb-24 md:pt-72 lg:pb-28 mt-16 md:mt-20",
      ),
    ],
    [
      html.div([
        attribute.class(
          "pointer-events-none absolute -top-32 -left-16 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl animate-float-slow",
        ),
      ], []),
      html.div([
        attribute.class(
          "pointer-events-none absolute -right-24 top-24 h-96 w-96 rounded-full bg-cyan-400/15 blur-3xl animate-float",
        ),
      ], []),
      html.div([
        attribute.class(
          "pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/50 to-transparent",
        ),
      ], []),
      html.div([attribute.class("max-w-5xl space-y-6 text-center animate-fade-up")], [
        case ctx.locale {
          locale.Ja ->
            html.div([attribute.class("mb-2 flex justify-center")], [
              html.span([attribute.class("text-3xl font-bold text-white")], [
                html.text("Astral"),
              ]),
            ])
          _ -> element.none()
        },
        html.h1([attribute.class("hero text-balance")], [
          html.text(g_(i18n_ctx, "A chat app that puts you first")),
        ]),
        html.p([attribute.class("lead mx-auto max-w-4xl text-zinc-200/90 animate-fade-up delay-1")], [
          html.text(g_(
            i18n_ctx,
            "Astral is an independent instant messaging and VoIP platform. Built for friends, groups, and communities.",
          )),
        ]),
        html.div(
          [
            attribute.class(
              "flex flex-col items-center justify-center gap-4 pt-5 sm:flex-row sm:items-stretch animate-fade-up delay-2",
            ),
          ],
          [
            platform_download_button.render_with_overlay(ctx),
            html.a(
              [
                attribute.href(ctx.app_endpoint <> "/channels/@me"),
                attribute.class(
                  "hidden sm:inline-flex items-center justify-center gap-3 rounded-2xl border border-white/25 bg-white/10 px-8 md:px-10 text-lg md:text-xl font-semibold text-white backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/20 shadow-lg",
                ),
              ],
              [html.text(g_(i18n_ctx, "Open in Browser"))],
            ),
          ],
        ),
      ]),
    ],
  )
}
