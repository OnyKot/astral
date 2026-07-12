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
import astral_marketing/components/platform_download_button.{Light}
import astral_marketing/components/pwa_install_dialog
import astral_marketing/icons
import astral_marketing/locale
import astral_marketing/pages/layout
import astral_marketing/pages/layout/meta.{PageMeta}
import astral_marketing/web.{type Context}
import gleam/list
import gleam/option.{Some}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import wisp

const windows_version = "1.5.0"

const android_version = "1.5.0"

fn tr(ctx: Context, ru: String, en: String) -> String {
  case ctx.locale {
    locale.Ru -> ru
    _ -> en
  }
}

pub fn render(req: wisp.Request, ctx: Context) -> wisp.Response {
  let content = [
    hero_section(ctx),
  ]

  layout.render(
    req,
    ctx,
    PageMeta(
      title: tr(ctx, "Скачать Astral", "Download Astral"),
      description: tr(
        ctx,
        "Скачайте Astral для Windows и Android. На iPhone, iPad, macOS и Linux можно сразу работать через браузер.",
        "Download Astral for Windows and Android APK. Use Astral on the web from any browser.",
      ),
      og_type: "website",
    ),
    content,
  )
  |> element.to_document_string_tree
  |> wisp.html_response(200)
}

fn hero_section(ctx: Context) -> Element(a) {
  hero_base.render(hero_base.HeroConfig(
    icon: icons.download([
      attribute.class("h-14 w-14 md:h-18 md:w-18 text-white"),
    ]),
    title: tr(ctx, "Скачать Astral", "Download Astral"),
    description: tr(
      ctx,
      "Установщик для Windows и APK для Android уже доступны",
      "Windows installer and Android APK are available now",
    ),
    extra_content: download_grid(ctx),
    custom_padding: hero_base.default_padding(),
  ))
}

fn download_grid(ctx: Context) -> Element(a) {
  html.div([attribute.class("mt-12 md:mt-16 w-full max-w-5xl mx-auto")], [
    html.div([attribute.class("mb-10 download-release-panel p-6 md:p-8")], [
      html.div([attribute.class("mb-7 flex flex-col gap-3 text-left md:flex-row md:items-end md:justify-between")], [
        html.div([], [
          html.span([attribute.class("marketing-kicker")], [
            html.text(tr(ctx, "Свежие сборки", "Fresh builds")),
          ]),
          html.h2([attribute.class("mt-4 text-2xl font-semibold text-white md:text-4xl")], [
            html.text("Astral for Windows + Android 1.5.0"),
          ]),
        ]),
        html.p([attribute.class("max-w-xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))] md:text-right md:text-base")], [
          html.text(tr(
            ctx,
            "Android APK отдается напрямую из статики лендинга. Windows-сборка остается доступной через основной download endpoint.",
            "Android APK is served directly from the landing static bundle. The Windows build remains available through the main download endpoint.",
          )),
        ]),
      ]),
      html.div(
        [
          attribute.class(
            "flex flex-col sm:flex-row flex-wrap gap-6 justify-center items-stretch sm:items-start",
          ),
        ],
        [
          html.div(
            [
              attribute.class(
                "flex flex-col items-stretch w-full sm:w-auto sm:items-start",
              ),
            ],
            [
              platform_download_button.render_desktop_button(
                ctx,
                platform_download_button.Windows,
                Light,
                Some("dl"),
                True,
                True,
              ),
              html.p(
                [
                  attribute.class(
                    "mt-3 text-xs text-[hsl(var(--muted-foreground))] text-center w-full",
                  ),
                ],
                [
                  html.text(
                    platform_download_button.get_system_requirements(
                      ctx,
                      platform_download_button.Windows,
                    )
                    <> " · v"
                    <> windows_version,
                  ),
                ],
              ),
            ],
          ),
          html.div(
            [
              attribute.class(
                "flex flex-col items-stretch w-full sm:w-auto sm:items-start",
              ),
            ],
            [
              platform_download_button.render_mobile_button(
                ctx,
                platform_download_button.Android,
                Light,
              ),
              html.p(
                [
                  attribute.class(
                    "mt-3 text-xs text-[hsl(var(--muted-foreground))] text-center w-full",
                  ),
                ],
                [
                  html.text(
                    platform_download_button.get_system_requirements(
                      ctx,
                      platform_download_button.Android,
                    )
                    <> " · v"
                    <> android_version,
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ]),

    html.div([attribute.class("marketing-panel max-w-3xl mx-auto text-center px-6 py-8 md:px-10 md:py-10")], [
      html.div([attribute.class("mb-8 grid gap-4 text-left md:grid-cols-3")], [
        detail_card(
          icons.windows([attribute.class("h-5 w-5 text-white")]),
          tr(ctx, "Нативные сборки", "Native now"),
          tr(
            ctx,
            "Установщик Windows и Android APK уже готовы для прямой загрузки.",
            "Windows installer and Android APK are ready for direct download.",
          ),
        ),
        detail_card(
          icons.globe([attribute.class("h-5 w-5 text-white")]),
          tr(ctx, "Веб-версия", "Web fallback"),
          tr(
            ctx,
            "На iPhone, iPad, macOS и Linux полноценно работает веб-версия без ожидания нативного клиента.",
            "iPhone, iPad, macOS, and Linux can use the full web app immediately.",
          ),
        ),
        detail_card(
          icons.chat_centered_text([attribute.class("h-5 w-5 text-white")]),
          tr(ctx, "Нужна другая платформа", "Need another build"),
          tr(
            ctx,
            "Напишите команде, какую платформу стоит поднять в очереди следующей.",
            "Tell the team which platform should move up the queue next.",
          ),
        ),
      ]),
      html.h3([attribute.class("text-lg md:text-xl font-semibold text-white")], [
        html.text(tr(ctx, "Используйте Astral в браузере на остальных устройствах", "Use Astral everywhere else in the browser")),
      ]),
      html.p(
        [
          attribute.class(
            "mt-3 text-sm md:text-base text-[hsl(var(--muted-foreground))] leading-relaxed",
          ),
        ],
        [
          html.text(tr(
            ctx,
            "Windows и Android уже доступны как отдельные сборки. На iPhone, iPad, macOS и Linux можно открыть Astral в браузере, пока нативные версии продолжают развиваться.",
            "Windows installer and Android APK are live. On iPhone, iPad, macOS, and Linux, open Astral in your browser while native builds continue.",
          )),
        ],
      ),
      html.ul(
        [
          attribute.class(
            "mt-4 text-sm md:text-base text-[hsl(var(--muted-foreground))] text-left mx-auto max-w-xl list-disc pl-6 space-y-2",
          ),
        ],
        [
          html.li([], [html.text(tr(ctx, "Добавьте Astral на домашний экран, чтобы убрать интерфейс браузера.", "Add Astral to your home screen to hide the browser UI."))]),
          html.li([], [html.text(tr(ctx, "Получайте бейджи уведомлений прямо на иконке приложения.", "See badge counts on the app icon."))]),
          html.li([], [html.text(tr(ctx, "Получайте push-уведомления, когда вы не в приложении.", "Get push notifications when you're away from the app."))]),
        ],
      ),
      html.div([attribute.class("mt-6 flex justify-center")], [
        pwa_install_dialog.render_trigger(ctx),
      ]),
      pwa_install_dialog.render_modal(ctx),
      html.p(
        [
          attribute.class(
            "mt-4 text-sm md:text-base text-[hsl(var(--muted-foreground))] leading-relaxed",
          ),
        ],
        [
          html.text(tr(
            ctx,
            "Если нужен самый быстрый старт, веб-версия работает сразу и без установки.",
            "If you only need the fastest start, the web app works immediately without any installation.",
          )),
        ],
      ),
      html.div([attribute.class("mt-10 rounded-[24px] border border-white/10 bg-black/20 p-6 md:p-8")], [
        html.h4(
          [attribute.class("text-base md:text-lg font-semibold text-white")],
          [
            html.text(tr(ctx, "Нужна следующая платформа?", "Need another platform next?")),
          ],
        ),
        html.p(
          [
            attribute.class(
              "mt-2 text-sm md:text-base text-[hsl(var(--muted-foreground))] leading-relaxed",
            ),
          ],
        [
          html.text(tr(
            ctx,
            "Напишите, какую нативную сборку вы хотите увидеть следующей, или отправьте проблемы, которые встретили в Windows и Android-версиях.",
            "Share which native build you want next, or send issues you hit in the Windows and Android releases.",
          )),
        ],
      ),
      html.div(
          [
            attribute.class("mt-5 grid grid-cols-1 gap-4"),
          ],
          [
            support_cta_button(
              "mailto:product@astraof.com",
              icons.chat_centered_text([attribute.class("h-6 w-6 shrink-0")]),
              tr(ctx, "Связаться с продуктовой командой", "Contact product team"),
              tr(ctx, "Роадмап, обратная связь и запросы по продукту", "Roadmap, feedback, and product requests"),
              True,
            ),
          ],
        ),
      ]),
    ]),
  ])
}

fn support_cta_button(
  href: String,
  icon: Element(a),
  title: String,
  helper: String,
  new_tab: Bool,
) -> Element(a) {
  let attrs = [
      attribute.href(href),
      attribute.class(
      "astral-button astral-button-secondary inline-flex flex-col items-center justify-center gap-1 px-6 py-5 md:px-8 md:py-6 text-white",
      ),
  ]

  let attrs = case new_tab {
    True ->
      attrs
      |> list.append([
        attribute.target("_blank"),
        attribute.rel("noopener noreferrer"),
      ])
    False -> attrs
  }

  html.a(attrs, [
    html.div([attribute.class("flex items-center gap-3")], [
      icon,
      html.span([attribute.class("text-base md:text-lg font-semibold")], [
        html.text(title),
      ]),
    ]),
    html.span([attribute.class("text-xs text-[hsl(var(--muted-foreground))]")], [
      html.text(helper),
    ]),
  ])
}

fn detail_card(icon: Element(a), title: String, description: String) -> Element(a) {
  html.div(
    [
      attribute.class(
        "marketing-panel reveal-card rounded-[24px] p-4 md:p-5",
      ),
    ],
    [
      html.div([attribute.class("inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/8")], [
        icon,
      ]),
      html.h4([attribute.class("mt-4 text-sm font-semibold text-white md:text-base")], [
        html.text(title),
      ]),
      html.p([attribute.class("mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]")], [
        html.text(description),
      ]),
    ],
  )
}
