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
import astral_marketing/pages/layout
import astral_marketing/pages/layout/meta.{PageMeta}
import astral_marketing/web.{type Context, href}
import gleam/list
import lustre/attribute
import lustre/element
import lustre/element/html
import wisp

fn tr(ctx: Context, ru: String, en: String) -> String {
  case ctx.locale {
    locale.Ru -> ru
    _ -> en
  }
}

pub fn render(req: wisp.Request, ctx: Context) -> wisp.Response {
  let content = [
    html.main(
      [
        attribute.class(
          "relative isolate overflow-hidden px-6 pb-20 pt-40 md:pb-24 md:pt-44 mt-16 md:mt-20",
        ),
      ],
      [
        html.div(
          [
            attribute.class(
              "pointer-events-none absolute -top-24 left-0 h-96 w-96 rounded-full bg-indigo-500/18 blur-3xl",
            ),
          ],
          [],
        ),
        html.div(
          [
            attribute.class(
              "pointer-events-none absolute right-0 top-24 h-[28rem] w-[28rem] rounded-full bg-cyan-400/12 blur-3xl",
            ),
          ],
          [],
        ),
        html.div(
          [attribute.class("mx-auto flex w-full max-w-6xl flex-col gap-8")],
          [
            html.section(
              [
                attribute.class(
                  "rounded-[32px] border border-white/12 bg-[linear-gradient(180deg,rgba(9,12,21,0.88),rgba(9,12,21,0.62))] px-6 py-8 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-3xl md:px-10 md:py-12",
                ),
              ],
              [
                html.div([attribute.class("mx-auto max-w-3xl text-center")], [
                  html.div([attribute.class("mb-5 flex justify-center")], [
                    html.span(
                      [
                        attribute.class(
                          "inline-flex items-center gap-2 rounded-full border border-indigo-300/35 bg-indigo-500/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-100",
                        ),
                      ],
                      [
                        icons.sparkle([attribute.class("h-4 w-4")]),
                        html.text(tr(ctx, "AI Agent", "AI Agent")),
                      ],
                    ),
                  ]),
                  html.h1(
                    [
                      attribute.class(
                        "text-balance text-4xl font-black tracking-tight text-white md:text-6xl",
                      ),
                    ],
                    [
                      html.text(tr(
                        ctx,
                        "AI Agent в Astral",
                        "AI Agent in Astral",
                      )),
                    ],
                  ),
                  html.p(
                    [
                      attribute.class(
                        "mx-auto mt-5 max-w-2xl text-base leading-relaxed text-zinc-300 md:text-lg",
                      ),
                    ],
                    [
                      html.text(tr(
                        ctx,
                        "AI Agent помогает быстро писать черновики, краткие ответы и идеи прямо в чате через команду /ai.",
                        "AI Agent helps you create drafts, short replies, and ideas directly in chat with the /ai command.",
                      )),
                    ],
                  ),
                  html.div(
                    [
                      attribute.class(
                        "mt-8 flex flex-col justify-center gap-3 sm:flex-row",
                      ),
                    ],
                    [
                      html.a(
                        [
                          attribute.href(ctx.app_endpoint <> "/login"),
                          attribute.class(
                            "inline-flex items-center justify-center gap-3 rounded-2xl border border-indigo-200/45 bg-white px-8 py-4 text-base font-bold text-black transition-all duration-300 hover:-translate-y-0.5 hover:bg-zinc-200",
                          ),
                        ],
                        [
                          icons.arrow_right([
                            attribute.class("h-4 w-4 text-indigo-600"),
                          ]),
                          html.text(tr(ctx, "Открыть Astral", "Open Astral")),
                        ],
                      ),
                      html.a(
                        [
                          href(ctx, "/download"),
                          attribute.class(
                            "inline-flex items-center justify-center gap-3 rounded-2xl border border-white/12 bg-white/6 px-8 py-4 text-base font-semibold text-zinc-100 transition-colors hover:bg-white/12",
                          ),
                        ],
                        [
                          icons.devices([attribute.class("h-5 w-5")]),
                          html.text(tr(
                            ctx,
                            "Скачать приложение",
                            "Download app",
                          )),
                        ],
                      ),
                    ],
                  ),
                ]),
              ],
            ),
            html.section([attribute.class("grid gap-6 md:grid-cols-2")], [
              info_card(
                ctx,
                icons.shield_check([attribute.class("h-5 w-5")]),
                tr(ctx, "Кто подходит", "Who qualifies"),
                [
                  tr(
                    ctx,
                    "Вы вошли в Astral и используете свежую web-, Windows- или Android-сборку.",
                    "You are signed in to Astral and use a recent web, Windows, or Android build.",
                  ),
                  tr(
                    ctx,
                    "В настройках виден блок Messages & Media -> AI Assistant.",
                    "The Messages & Media -> AI Assistant block is visible in Settings.",
                  ),
                  tr(
                    ctx,
                    "У вас есть OpenRouter API key для этого устройства.",
                    "You have an OpenRouter API key for this device.",
                  ),
                ],
              ),
              info_card(
                ctx,
                icons.chat_centered_text([attribute.class("h-5 w-5")]),
                tr(ctx, "Как включить", "How to enable"),
                [
                  tr(
                    ctx,
                    "Откройте Settings -> Messages & Media -> AI Assistant.",
                    "Open Settings -> Messages & Media -> AI Assistant.",
                  ),
                  tr(
                    ctx,
                    "Вставьте OpenRouter API Key и при необходимости поменяйте модель.",
                    "Paste your OpenRouter API Key and change the model if needed.",
                  ),
                  tr(
                    ctx,
                    "Вернитесь в чат и используйте /ai <ваш запрос>.",
                    "Return to chat and use /ai <your prompt>.",
                  ),
                ],
              ),
            ]),
            html.section(
              [
                attribute.class(
                  "rounded-[32px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-6 py-8 shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur-3xl md:px-8",
                ),
              ],
              [
                html.h2(
                  [attribute.class("text-2xl font-bold text-white md:text-3xl")],
                  [html.text(tr(ctx, "Что важно знать", "What to know first"))],
                ),
                html.div([attribute.class("mt-6 grid gap-4 md:grid-cols-3")], [
                  bullet_card(
                    ctx,
                    tr(ctx, "Локальный ключ", "Local key"),
                    tr(
                      ctx,
                      "OpenRouter API key хранится локально на этом устройстве, а не в аккаунте Astral.",
                      "Your OpenRouter API key is stored locally on this device, not in your Astral account.",
                    ),
                  ),
                  bullet_card(
                    ctx,
                    tr(ctx, "Команда /ai", "/ai command"),
                    tr(
                      ctx,
                      "AI Agent работает через /ai в чате, без отдельного окна и лишних переключений.",
                      "AI Agent works through /ai in chat, without a separate window or extra switching.",
                    ),
                  ),
                  bullet_card(
                    ctx,
                    tr(ctx, "Если блока нет", "If the block is missing"),
                    tr(
                      ctx,
                      "Обновите приложение или зайдите через web-версию. Если AI Assistant все еще не виден, ваша сборка еще не подходит.",
                      "Update the app or use the web build. If AI Assistant still is not visible, your build is not ready yet.",
                    ),
                  ),
                ]),
              ],
            ),
          ],
        ),
      ],
    ),
  ]

  layout.render(
    req,
    ctx,
    PageMeta(
      title: tr(ctx, "AI Agent в Astral", "AI Agent in Astral"),
      description: tr(
        ctx,
        "Как работает AI Agent в Astral, кому он доступен и как включить /ai.",
        "How AI Agent works in Astral, who qualifies, and how to enable /ai.",
      ),
      og_type: "website",
    ),
    content,
  )
  |> element.to_document_string_tree
  |> wisp.html_response(200)
}

fn info_card(
  ctx: Context,
  icon: element.Element(a),
  title: String,
  items: List(String),
) -> element.Element(a) {
  html.section(
    [
      attribute.class(
        "rounded-[28px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-2xl",
      ),
    ],
    [
      html.div([attribute.class("mb-4 flex items-center gap-3 text-white")], [
        html.div(
          [
            attribute.class(
              "flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/8 text-indigo-200",
            ),
          ],
          [icon],
        ),
        html.h3([attribute.class("text-xl font-semibold")], [html.text(title)]),
      ]),
      html.ul(
        [
          attribute.class(
            "space-y-3 text-sm leading-relaxed text-zinc-300 md:text-base",
          ),
        ],
        items
          |> list.map(fn(item) {
            html.li([attribute.class("flex gap-3")], [
              html.span([attribute.class("mt-1 text-indigo-300")], [
                html.text("•"),
              ]),
              html.span([], [html.text(item)]),
            ])
          }),
      ),
      html.p([attribute.class("mt-4 text-xs text-zinc-500")], [
        html.text(tr(
          ctx,
          "Если вы видите AI Assistant в настройках, значит этот билд уже подходит.",
          "If you can see AI Assistant in settings, this build already qualifies.",
        )),
      ]),
    ],
  )
}

fn bullet_card(_ctx: Context, title: String, body: String) -> element.Element(a) {
  html.div(
    [
      attribute.class(
        "rounded-[24px] border border-white/10 bg-black/20 p-5 text-left",
      ),
    ],
    [
      html.h3([attribute.class("text-base font-semibold text-white")], [
        html.text(title),
      ]),
      html.p([attribute.class("mt-2 text-sm leading-relaxed text-zinc-300")], [
        html.text(body),
      ]),
    ],
  )
}
