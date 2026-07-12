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
import astral_marketing/locale
import astral_marketing/web.{type Context, href}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html

fn tr(ctx: Context, ru: String, en: String) -> String {
  case ctx.locale {
    locale.Ru -> ru
    _ -> en
  }
}

pub fn render(ctx: Context) -> Element(a) {
  let help_data = help_center.load_help_articles(ctx.locale)
  let bug_article_href =
    help_center.article_href(ctx.locale, help_data, "1447264362996695040")

  html.footer(
    [
      attribute.class(
        "marketing-footer border-t border-white/8 bg-[hsl(var(--background))] px-4 py-20 text-white md:px-8 md:py-24",
      ),
    ],
    [
      html.div([attribute.class("mx-auto max-w-7xl")], [
        html.div(
          [attribute.class("grid grid-cols-1 gap-12 md:gap-16 md:grid-cols-4")],
          [
            html.div([attribute.class("md:col-span-1")], [
              html.span(
                [
                  attribute.class(
                    "text-4xl md:text-5xl font-black tracking-tight text-white leading-none",
                  ),
                ],
                [html.text("Astral")],
              ),
            ]),
            html.div(
              [
                attribute.class(
                  "grid grid-cols-1 gap-8 md:gap-12 sm:grid-cols-3 md:col-span-3",
                ),
              ],
              [
                html.div([], [
                  html.h3([attribute.class("title mb-4 md:mb-6 text-white")], [
                    html.text("Astral"),
                  ]),
                  html.ul([attribute.class("space-y-3")], [
                    html.li([], [
                      html.a(
                        [
                          href(ctx, "/download"),
                          attribute.class(
                            "body-lg text-zinc-300 hover:text-white hover:underline transition-colors",
                          ),
                        ],
                        [html.text(tr(ctx, "Скачать", "Download"))],
                      ),
                    ]),
                    html.li([], [
                      html.a(
                        [
                          href(ctx, "/help"),
                          attribute.class(
                            "body-lg text-zinc-300 hover:text-white hover:underline transition-colors",
                          ),
                        ],
                        [html.text(tr(ctx, "Помощь", "Help Center"))],
                      ),
                    ]),
                    html.li([], [
                      html.a(
                        [
                          href(ctx, "/status"),
                          attribute.class(
                            "body-lg text-zinc-300 hover:text-white hover:underline transition-colors",
                          ),
                        ],
                        [html.text(tr(ctx, "Статус", "Status"))],
                      ),
                    ]),
                    html.li([], [
                      html.a(
                        [
                          href(ctx, "/careers"),
                          attribute.class(
                            "body-lg text-zinc-300 hover:text-white hover:underline transition-colors",
                          ),
                        ],
                        [html.text(tr(ctx, "Карьера", "Careers"))],
                      ),
                    ]),
                    html.li([], [
                      html.a(
                        [
                          href(ctx, "/philosophy"),
                          attribute.class(
                            "body-lg text-zinc-300 hover:text-white hover:underline transition-colors",
                          ),
                        ],
                        [html.text(tr(ctx, "Философия", "Philosophy"))],
                      ),
                    ]),
                  ]),
                ]),
                html.div([], [
                  html.h3([attribute.class("title mb-4 md:mb-6 text-white")], [
                    html.text(tr(ctx, "Документы", "Policies")),
                  ]),
                  html.ul([attribute.class("space-y-3")], [
                    html.li([], [
                      html.a(
                        [
                          href(ctx, "/terms"),
                          attribute.class(
                            "body-lg text-zinc-300 hover:text-white hover:underline transition-colors",
                          ),
                        ],
                        [html.text(tr(ctx, "Условия использования", "Terms of Service"))],
                      ),
                    ]),
                    html.li([], [
                      html.a(
                        [
                          href(ctx, "/privacy"),
                          attribute.class(
                            "body-lg text-zinc-300 hover:text-white hover:underline transition-colors",
                          ),
                        ],
                        [html.text(tr(ctx, "Политика конфиденциальности", "Privacy Policy"))],
                      ),
                    ]),
                    html.li([], [
                      html.a(
                        [
                          href(ctx, "/guidelines"),
                          attribute.class(
                            "body-lg text-zinc-300 hover:text-white hover:underline transition-colors",
                          ),
                        ],
                        [html.text(tr(ctx, "Правила сообщества", "Community Guidelines"))],
                      ),
                    ]),
                    html.li([], [
                      html.a(
                        [
                          href(ctx, "/security"),
                          attribute.class(
                            "body-lg text-zinc-300 hover:text-white hover:underline transition-colors",
                          ),
                        ],
                        [html.text(tr(ctx, "Безопасность", "Security Bug Bounty"))],
                      ),
                    ]),
                    html.li([], [
                      html.a(
                        [
                          href(ctx, "/company-information"),
                          attribute.class(
                            "body-lg text-zinc-300 hover:text-white hover:underline transition-colors",
                          ),
                        ],
                        [html.text(tr(ctx, "О проекте", "About Astral"))],
                      ),
                    ]),
                  ]),
                ]),
                html.div([], [
                  html.h3([attribute.class("title mb-4 md:mb-6 text-white")], [
                    html.text(tr(ctx, "Контакты", "Connect")),
                  ]),
                  html.ul([attribute.class("space-y-3")], [
                    html.li([], [
                      html.a(
                        [
                          attribute.href("mailto:press@astraof.com"),
                          attribute.class(
                            "body-lg text-zinc-300 hover:text-white hover:underline transition-colors",
                          ),
                        ],
                        [html.text("press@astraof.com")],
                      ),
                    ]),
                    html.li([], [
                      html.a(
                        [
                          attribute.href("mailto:support@astraof.com"),
                          attribute.class(
                            "body-lg text-zinc-300 hover:text-white hover:underline transition-colors",
                          ),
                        ],
                        [html.text("support@astraof.com")],
                      ),
                    ]),
                    html.li([], [
                      html.a(
                        [
                          href(ctx, bug_article_href),
                          attribute.class(
                            "body-lg text-zinc-300 hover:text-white hover:underline transition-colors",
                          ),
                        ],
                        [html.text(tr(ctx, "Сообщить об ошибке", "Report a bug"))],
                      ),
                    ]),
                  ]),
                ]),
              ],
            ),
          ],
        ),
        html.div([attribute.class("mt-12 border-t border-zinc-700/70 pt-8")], [
          html.div([attribute.class("flex flex-col gap-2")], [
            html.p([attribute.class("body-sm text-zinc-400")], [
              html.text("© Astral Platform"),
            ]),
            html.p([attribute.class("body-sm text-zinc-400")], [
              html.text(tr(
                ctx,
                "Этот продукт использует GeoLite2 Data, созданные MaxMind и доступные на ",
                "This product includes GeoLite2 Data created by MaxMind, available from ",
              )),
              html.a(
                [
                  attribute.href("https://www.maxmind.com"),
                  attribute.target("_blank"),
                  attribute.rel("noopener noreferrer"),
                  attribute.class("hover:underline"),
                ],
                [html.text("MaxMind")],
              ),
              html.text("."),
            ]),
          ]),
        ]),
      ]),
    ],
  )
}


