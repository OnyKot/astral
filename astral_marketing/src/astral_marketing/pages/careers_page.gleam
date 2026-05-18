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
    page_main(ctx),
  ]

  layout.render(
    req,
    ctx,
    PageMeta(
      title: g_(i18n_ctx, "Careers at Astral"),
      description: g_(
        i18n_ctx,
        "Join the Astral community and help build the future of communication through independent and community contributions.",
      ),
      og_type: "website",
    ),
    content,
  )
  |> element.to_document_string_tree
  |> wisp.html_response(200)
}

fn page_main(ctx: Context) -> Element(a) {
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
    community_team_section(ctx),
    contribute_section(ctx),
    future_section(ctx),
    cta_section(ctx),
  ])
}

fn hero_section(ctx: Context) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  html.section(
    [
      attribute.class(
        "relative z-10 px-6 pt-48 md:pt-60 pb-16 md:pb-20 text-white",
      ),
    ],
    [
      html.div([attribute.class("mx-auto max-w-5xl text-center")], [
        html.div([attribute.class("mb-6 flex justify-center")], [
          html.div(
            [
              attribute.class(
                "inline-flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-2xl border border-white/12 bg-[linear-gradient(180deg,rgba(99,102,241,0.28),rgba(34,211,238,0.14))] shadow-[0_18px_50px_rgba(0,0,0,0.42)] backdrop-blur-2xl",
              ),
            ],
            [
              icons.astral_staff([
                attribute.class("h-9 w-9 md:h-10 md:w-10 text-white"),
              ]),
            ],
          ),
        ]),
        html.h1([attribute.class("hero text-balance")], [
          html.text(g_(i18n_ctx, "Join the team behind Astral")),
        ]),
        html.p(
          [
            attribute.class("body-lg mx-auto mt-5 max-w-3xl text-zinc-200/90"),
          ],
          [
            html.text(g_(
              i18n_ctx,
              "Help us build a different kind of communication platform - independent, community-funded, and built with care.",
            )),
          ],
        ),
        html.div(
          [
            attribute.class(
              "mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row",
            ),
          ],
          [
            html.a(
              [
                attribute.href("mailto:careers@astraof.com"),
                attribute.class(
                  "inline-flex items-center justify-center rounded-2xl border border-indigo-200/45 bg-white px-8 py-4 text-base md:text-lg font-black tracking-wide text-black transition-all duration-300 hover:-translate-y-0.5 hover:bg-zinc-200 shadow-[0_18px_45px_rgba(255,255,255,0.18)]",
                ),
              ],
              [html.text("careers@astraof.com")],
            ),
            html.a(
              [
                attribute.href("/docs"),
                attribute.class(
                  "inline-flex items-center justify-center gap-2 rounded-2xl border border-white/14 bg-white/6 px-8 py-4 text-base md:text-lg font-semibold text-white transition-colors hover:bg-white/10",
                ),
              ],
              [
                icons.chats_circle([attribute.class("h-5 w-5 text-white")]),
                html.span([], [html.text(g_(i18n_ctx, "Join Astral HQ"))]),
              ],
            ),
          ],
        ),
      ]),
    ],
  )
}

fn contribute_section(ctx: Context) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  html.section(
    [
      attribute.class("relative z-10 px-6 py-20 md:py-28"),
    ],
    [
      html.div([attribute.class("mx-auto max-w-7xl")], [
        html.div([attribute.class("mb-16 md:mb-20 text-center")], [
          html.h2(
            [
              attribute.class(
                "display mb-6 md:mb-8 text-zinc-100 text-4xl md:text-5xl lg:text-6xl",
              ),
            ],
            [html.text(g_(i18n_ctx, "Ways to contribute"))],
          ),
          html.p(
            [
              attribute.class(
                "lead mx-auto max-w-3xl text-zinc-300/90 text-xl md:text-2xl",
              ),
            ],
            [
              html.text(g_(
                i18n_ctx,
                "Astral grows with direct community contribution. Pick the path that fits how you like to help.",
              )),
            ],
          ),
        ]),
        html.div(
          [
            attribute.class("grid gap-8 md:gap-10 grid-cols-1 md:grid-cols-2"),
          ],
          [
            support_card.render(
              ctx,
              "code",
              g_(i18n_ctx, "Product improvements"),
              g_(
                i18n_ctx,
                "Share ideas and practical feedback that helps us ship better features faster.",
              ),
              g_(i18n_ctx, "Contact product team"),
              "mailto:product@astraof.com",
            ),
            support_card.render(
              ctx,
              "translate",
              g_(i18n_ctx, "Localization"),
              g_(
                i18n_ctx,
                "Help translate Astral and its docs so it feels native everywhere.",
              ),
              "i18n@astraof.com",
              "mailto:i18n@astraof.com",
            ),
            support_card.render(
              ctx,
              "chat-centered-text",
              g_(i18n_ctx, "Community"),
              g_(
                i18n_ctx,
                "Share feedback, report bugs, and help make Astral welcoming for everyone.",
              ),
              g_(i18n_ctx, "Join Astral HQ"),
              "/docs",
            ),
            support_card.render(
              ctx,
              "bug",
              g_(i18n_ctx, "Security reports"),
              g_(
                i18n_ctx,
                "Report vulnerabilities and help us keep the platform secure.",
              ),
              g_(i18n_ctx, "Security Bug Bounty"),
              "/security",
            ),
            support_card.render(
              ctx,
              "shield-check",
              g_(i18n_ctx, "Trust & safety"),
              g_(
                i18n_ctx,
                "Report people or communities so we can keep Astral safe for everyone.",
              ),
              "safety@astraof.com",
              "mailto:safety@astraof.com",
            ),
            support_card.render(
              ctx,
              "Astral-partner",
              g_(i18n_ctx, "Become a Astral Partner"),
              g_(
                i18n_ctx,
                "If you're a creator or community owner, explore the Partner program and its perks.",
              ),
              g_(i18n_ctx, "Learn about Partners"),
              "/partners",
            ),
          ],
        ),
      ]),
    ],
  )
}

fn community_team_section(ctx: Context) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  html.section(
    [
      attribute.class("relative z-10 px-6 py-20 md:py-28"),
    ],
    [
      html.div([attribute.class("mx-auto max-w-7xl")], [
        html.div([attribute.class("mb-16 md:mb-20 text-center")], [
          html.h2(
            [
              attribute.class(
                "display mb-6 md:mb-8 text-zinc-100 text-4xl md:text-5xl lg:text-6xl",
              ),
            ],
            [
              html.text(g_(i18n_ctx, "Astral Community Team")),
            ],
          ),
          html.p(
            [
              attribute.class(
                "lead lead-soft mx-auto max-w-3xl text-zinc-300/90 text-xl md:text-2xl",
              ),
            ],
            [
              html.text(g_(
                i18n_ctx,
                "A non-paid role for recurring contributors who help shape Astral alongside the core team.",
              )),
            ],
          ),
        ]),
        html.div(
          [
            attribute.class(
              "flex flex-wrap justify-center gap-3 sm:gap-4 md:gap-5 lg:gap-6 max-w-5xl mx-auto",
            ),
          ],
          [
            community_pill(
              ctx,
              icons.code_icon([
                attribute.class("h-6 w-6 md:h-7 md:w-7 text-indigo-200"),
              ]),
              g_(i18n_ctx, "Software development"),
            ),
            community_pill(
              ctx,
              icons.translate([
                attribute.class("h-6 w-6 md:h-7 md:w-7 text-indigo-200"),
              ]),
              g_(i18n_ctx, "Translation & localization"),
            ),
            community_pill(
              ctx,
              icons.palette([
                attribute.class("h-6 w-6 md:h-7 md:w-7 text-indigo-200"),
              ]),
              g_(i18n_ctx, "Design & branding"),
            ),
            community_pill(
              ctx,
              icons.shield_check([
                attribute.class("h-6 w-6 md:h-7 md:w-7 text-indigo-200"),
              ]),
              g_(i18n_ctx, "Trust & safety"),
            ),
          ],
        ),
        html.div([attribute.class("mt-10 md:mt-12 text-center")], [
          html.a(
            [
              attribute.href("mailto:careers@astraof.com"),
              attribute.class(
                "label inline-flex items-center justify-center rounded-2xl border border-white/14 bg-white/6 px-8 py-4 text-base md:text-lg text-white shadow-[0_18px_50px_rgba(0,0,0,0.35)] transition hover:bg-white/10",
              ),
            ],
            [html.text("careers@astraof.com")],
          ),
        ]),
      ]),
    ],
  )
}

fn community_pill(ctx: Context, icon: Element(a), label: String) -> Element(a) {
  let _ = ctx

  html.div(
    [
      attribute.class(
        "inline-flex items-center gap-3 sm:gap-4 rounded-full bg-white/6 border border-white/12 px-5 sm:px-6 md:px-7 py-3.5 sm:py-4 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl",
      ),
    ],
    [
      icon,
      html.span(
        [
          attribute.class(
            "body-lg text-zinc-100 whitespace-nowrap text-base md:text-lg",
          ),
        ],
        [
          html.text(label),
        ],
      ),
    ],
  )
}

fn future_section(ctx: Context) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  html.section([attribute.class("relative z-10 px-6 py-20 md:py-28")], [
    html.div([attribute.class("mx-auto max-w-7xl text-center")], [
      html.h2(
        [
          attribute.class(
            "display mb-6 md:mb-8 text-zinc-100 text-4xl md:text-5xl lg:text-6xl",
          ),
        ],
        [html.text(g_(i18n_ctx, "The future of paid roles"))],
      ),
      html.p(
        [
          attribute.class(
            "lead lead-soft mx-auto max-w-3xl text-zinc-300/90 text-xl md:text-2xl mb-10 md:mb-12",
          ),
        ],
        [
          html.text(g_(
            i18n_ctx,
            "We're still building the business around Astral and aren't quite ready for paid roles yet.",
          )),
        ],
      ),
      html.div(
        [
          attribute.class(
            "mx-auto max-w-4xl rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/12 p-8 md:p-10 shadow-[0_22px_50px_rgba(0,0,0,0.35)] text-left",
          ),
        ],
        [
          html.p(
            [
              attribute.class(
                "body-lg text-zinc-100/90 leading-relaxed text-base md:text-lg mb-4 md:mb-5",
              ),
            ],
            [
              html.text(g_(
                i18n_ctx,
                "Right now we're focused on shipping a great product and keeping Astral independent and bootstrapped.",
              )),
            ],
          ),
          html.p(
            [
              attribute.class(
                "body-lg text-zinc-300 leading-relaxed text-base md:text-lg",
              ),
            ],
            [
              html.text(g_(
                i18n_ctx,
                "With your support, we hope to make this independent communication platform sustainable and start offering paid roles in the future.",
              )),
            ],
          ),
        ],
      ),
    ]),
  ])
}

fn cta_section(ctx: Context) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  html.section(
    [
      attribute.class("relative z-10 px-6 pb-24 md:pb-32"),
    ],
    [
      html.div(
        [
          attribute.class("mx-auto max-w-7xl"),
        ],
        [
          html.div(
            [
              attribute.class(
                "relative overflow-hidden rounded-3xl border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-6 py-20 md:px-10 md:py-24 text-center shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl",
              ),
            ],
            [
              html.div(
                [
                  attribute.class(
                    "pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl",
                  ),
                ],
                [],
              ),
              html.div(
                [
                  attribute.class(
                    "pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-cyan-400/14 blur-3xl",
                  ),
                ],
                [],
              ),
              html.h2(
                [
                  attribute.class(
                    "display mb-6 md:mb-8 text-4xl md:text-5xl lg:text-6xl",
                  ),
                ],
                [
                  html.text(g_(i18n_ctx, "Want to help build Astral?")),
                ],
              ),
              html.p(
                [
                  attribute.class(
                    "body-lg mb-8 md:mb-10 text-white/90 max-w-3xl mx-auto",
                  ),
                ],
                [
                  html.text(g_(
                    i18n_ctx,
                    "Share a bit about yourself, what you'd like to work on, and links to any relevant work.",
                  )),
                ],
              ),
              html.div(
                [
                  attribute.class(
                    "flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4",
                  ),
                ],
                [
                  html.a(
                    [
                      attribute.href("mailto:careers@astraof.com"),
                      attribute.class(
                        "label inline-flex items-center justify-center rounded-2xl bg-white px-8 py-4 text-black shadow-lg transition hover:bg-zinc-200",
                      ),
                    ],
                    [html.text("careers@astraof.com")],
                  ),
                  html.a(
                    [
                      attribute.href("/docs"),
                      attribute.class(
                        "label inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-8 py-4 text-white border border-white/18 hover:bg-white/16",
                      ),
                    ],
                    [
                      icons.chats_circle([
                        attribute.class("h-5 w-5 text-white"),
                      ]),
                      html.span([], [
                        html.text(g_(i18n_ctx, "Join Astral HQ community")),
                      ]),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  )
}

