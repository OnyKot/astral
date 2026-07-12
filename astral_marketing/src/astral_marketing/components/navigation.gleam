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

import astral_marketing/icons
import astral_marketing/locale
import astral_marketing/web.{type Context, href}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import wisp.{type Request}

fn tr(ctx: Context, ru: String, en: String) -> String {
  case ctx.locale {
    locale.Ru -> ru
    _ -> en
  }
}

pub fn render(ctx: Context, _req: Request) -> Element(a) {
  html.nav(
    [
      attribute.id("navbar"),
      attribute.class("nav-shell fixed left-0 right-0 top-0 z-[1000]"),
    ],
    [
      html.div([attribute.class("px-4 pt-4 md:px-6 md:pt-6")], [
        html.div(
          [
            attribute.class(
              "nav-card mx-auto max-w-7xl px-4 py-3 md:px-6 md:py-4",
            ),
          ],
          [
            html.div(
              [attribute.class("flex items-center justify-between gap-6")],
              [
                html.a(
                  [
                    href(ctx, "/"),
                    attribute.class(
                      "nav-brand inline-flex items-start text-[1.75rem] leading-none tracking-tight text-[hsl(var(--foreground))] font-accent",
                    ),
                    attribute.attribute("aria-label", "Astral home"),
                  ],
                  [
                    html.text("Astral"),
                    html.sup([attribute.class("text-xs")], [html.text("R")]),
                  ],
                ),
                html.div(
                  [attribute.class("hidden md:flex items-center gap-6")],
                  [
                    nav_link(href(ctx, "/"), tr(ctx, "Главная", "Home"), True),
                    nav_link(href(ctx, "/download"), tr(ctx, "Скачать", "Download"), False),
                    nav_link(href(ctx, "/status"), tr(ctx, "Статус", "Status"), False),
                    nav_link(href(ctx, "/help"), tr(ctx, "Помощь", "Help"), False),
                    nav_link(
                      href(ctx, "/company-information"),
                      tr(ctx, "О проекте", "About"),
                      False,
                    ),
                  ],
                ),
                html.div([attribute.class("flex items-center gap-3")], [
                  html.a(
                    [
                      attribute.href(ctx.app_endpoint <> "/login"),
                      attribute.class(
                        "nav-cta hidden md:inline-flex items-center justify-center px-5 py-2.5 text-sm text-[hsl(var(--foreground))]",
                      ),
                    ],
                    [html.text(tr(ctx, "Открыть Astral", "Open Astral"))],
                  ),
                  html.button(
                    [
                      attribute.type_("button"),
                      attribute.id("nav-open"),
                      attribute.attribute("aria-controls", "nav-drawer"),
                      attribute.attribute("aria-expanded", "false"),
                      attribute.attribute("aria-label", "Open menu"),
                      attribute.class(
                        "nav-icon-btn flex h-10 w-10 items-center justify-center text-white md:hidden cursor-pointer",
                      ),
                    ],
                    [icons.menu([attribute.class("h-6 w-6")])],
                  ),
                ]),
              ],
            ),
          ],
        ),
      ]),
      html.div(
        [
          attribute.id("nav-backdrop"),
          attribute.attribute("aria-hidden", "true"),
          attribute.class(
            "fixed inset-0 z-[1001] bg-black/55 opacity-0 pointer-events-none md:hidden",
          ),
        ],
        [],
      ),
      html.div(
        [
          attribute.id("nav-drawer"),
          attribute.attribute("aria-hidden", "true"),
          attribute.class(
            "nav-drawer-panel fixed right-0 top-0 bottom-0 z-[1002] w-[min(88vw,360px)] overflow-hidden translate-x-full md:hidden",
          ),
        ],
        [
          html.div([attribute.class("relative flex h-full flex-col overflow-y-auto p-5")], [
            html.div([attribute.class("mb-6 flex items-center justify-between")], [
              html.a(
                [
                  href(ctx, "/"),
                  attribute.class(
                    "nav-brand inline-flex items-start text-[1.75rem] leading-none tracking-tight text-[hsl(var(--foreground))] font-accent",
                  ),
                  attribute.attribute("aria-label", "Astral home"),
                ],
                [
                  html.text("Astral"),
                  html.sup([attribute.class("text-xs")], [html.text("R")]),
                ],
              ),
              html.button(
                [
                  attribute.type_("button"),
                  attribute.id("nav-close"),
                  attribute.attribute("aria-label", "Close menu"),
                  attribute.class(
                    "nav-icon-btn flex h-10 w-10 items-center justify-center text-white cursor-pointer",
                  ),
                ],
                [icons.x([attribute.class("h-5 w-5")])],
              ),
            ]),
            html.div([attribute.class("flex flex-1 flex-col gap-3")], [
              drawer_link(href(ctx, "/"), tr(ctx, "Главная", "Home")),
              drawer_link(href(ctx, "/download"), tr(ctx, "Скачать", "Download")),
              drawer_link(href(ctx, "/status"), tr(ctx, "Статус", "Status")),
              drawer_link(href(ctx, "/help"), tr(ctx, "Помощь", "Help")),
              drawer_link(
                href(ctx, "/company-information"),
                tr(ctx, "О проекте", "About"),
              ),
            ]),
            html.a(
              [
                attribute.href(ctx.app_endpoint <> "/login"),
                attribute.class(
                  "nav-drawer-link nav-cta mt-6 inline-flex items-center justify-center px-6 py-4 text-base text-[hsl(var(--foreground))]",
                ),
              ],
              [html.text(tr(ctx, "Открыть Astral", "Open Astral"))],
            ),
          ]),
        ],
      ),
    ],
  )
}

fn nav_link(href_attr: attribute.Attribute(a), label: String, active: Bool) -> Element(a) {
  let class_name = case active {
    True ->
      "nav-link-fx is-active text-sm text-[hsl(var(--foreground))]"
    False ->
      "nav-link-fx text-sm text-[hsl(var(--muted-foreground))]"
  }

  html.a([href_attr, attribute.class(class_name)], [html.text(label)])
}

fn drawer_link(href_attr: attribute.Attribute(a), label: String) -> Element(a) {
  html.a(
    [
      href_attr,
      attribute.class(
        "nav-drawer-link drawer-link-fx px-1 py-4 text-base text-[hsl(var(--foreground))]",
      ),
    ],
    [html.text(label)],
  )
}
