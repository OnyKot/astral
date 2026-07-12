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
import astral_marketing/icons
import astral_marketing/locale
import astral_marketing/pages/layout
import astral_marketing/pages/layout/meta.{PageMeta}
import astral_marketing/web.{type Context}
import lustre/attribute
import lustre/element.{none, to_document_string_tree, type Element}
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
    hero_section(ctx),
    product_section(ctx),
  ]

  layout.render(
    req,
    ctx,
    PageMeta(
      title: tr(ctx, "О проекте Astral", "About Astral"),
      description: tr(
        ctx,
        "Что мы строим, как развивается Astral и где найти официальные контакты проекта.",
        "What we are building, how Astral is evolving, and where to find official project contacts.",
      ),
      og_type: "article",
    ),
    content,
  )
  |> to_document_string_tree
  |> wisp.html_response(200)
}

fn hero_section(ctx: Context) -> Element(a) {
  hero_base.render(hero_base.HeroConfig(
    icon: icons.globe([attribute.class("h-14 w-14 md:h-18 md:w-18 text-white")]),
    title: tr(ctx, "О проекте Astral", "About Astral"),
    description: tr(
      ctx,
      "Мессенджер для сообществ, создателей и команд: быстрый, тёмный, сфокусированный и доступный на разных платформах.",
      "A messenger for communities, creators, and teams: fast, dark, focused, and available across platforms.",
    ),
    extra_content: none(),
    custom_padding: hero_base.default_padding(),
  ))
}

fn product_section(ctx: Context) -> Element(a) {
  html.section([attribute.class("company-product-section px-6 pb-16 md:pb-24")], [
    html.div([attribute.class("mx-auto max-w-7xl")], [
      html.div([attribute.class("company-product-grid")], [
        html.article([attribute.class("company-product-card company-product-card--hero")], [
          html.span([attribute.class("company-eyebrow")], [
            html.text(tr(ctx, "Продукт", "Product")),
          ]),
          html.h2([attribute.class("company-heading")], [
            html.text(tr(
              ctx,
              "Astral создаётся как мессенджер нового поколения",
              "Astral is built as a next-generation messenger",
            )),
          ]),
          html.p([attribute.class("company-lede")], [
            html.text(tr(
              ctx,
              "Мы объединяем личные сообщения, сообщества, голос, медиа и рабочие пространства в одном спокойном интерфейсе. Цель Astral — дать людям быстрый, красивый и сфокусированный способ общаться без визуального шума.",
              "We bring direct messages, communities, voice, media, and workspaces into one calm interface. Astral is designed to give people a fast, beautiful, and focused way to communicate without visual noise.",
            )),
          ]),
        ]),
        product_card(
          icons.chats_circle([attribute.class("h-7 w-7")]),
          tr(ctx, "Мессенджер в основе", "Messenger first"),
          tr(
            ctx,
            "Чаты, каналы, голос и присутствие ощущаются как единый поток, а не набор разрозненных экранов.",
            "Chats, channels, voice, and presence feel like one flow instead of disconnected screens.",
          ),
        ),
        product_card(
          icons.lightning([attribute.class("h-7 w-7")]),
          tr(ctx, "Скорость без тяжести", "Fast without weight"),
          tr(
            ctx,
            "Интерфейс должен реагировать быстро, читать легко и не мешать человеку делать главное.",
            "The interface should respond quickly, read clearly, and stay out of the user's way.",
          ),
        ),
        product_card(
          icons.devices([attribute.class("h-7 w-7")]),
          tr(ctx, "Доступен везде", "Available everywhere"),
          tr(
            ctx,
            "Windows и Android уже доступны, web-версия сохраняет доступ на остальных платформах.",
            "Windows and Android builds are available now, while the web app keeps Astral accessible elsewhere.",
          ),
        ),
        product_card(
          icons.shield_check([attribute.class("h-7 w-7")]),
          tr(ctx, "Доверие и безопасность", "Trust and safety"),
          tr(
            ctx,
            "Контакты, юридические запросы, безопасность и приватность вынесены в прозрачную систему обращений.",
            "Contacts, legal requests, security, and privacy are organized into clear communication channels.",
          ),
        ),
        html.article([attribute.class("company-product-card company-product-card--wide")], [
          html.h3([attribute.class("company-card-title")], [
            html.text(tr(ctx, "Официальная информация", "Official information")),
          ]),
          html.div([attribute.class("company-info-grid")], [
            info_item(tr(ctx, "Компания", "Company"), "Astral Platform AB"),
            info_item(tr(ctx, "Регистрационный номер", "Registration number"), "559537-3993"),
            info_item("VAT ID", "SE559537399301"),
            info_item(tr(ctx, "Сайт", "Website"), "https://astraof.com"),
            info_item("Email", "support@astraof.com"),
            info_item(tr(ctx, "Представитель", "Representative"), "Hampus Kraft, Founder & CEO"),
          ]),
        ]),
        html.article([attribute.class("company-product-card company-product-card--wide")], [
          html.h3([attribute.class("company-card-title")], [
            html.text(tr(ctx, "Контакты проекта", "Project contacts")),
          ]),
          html.div([attribute.class("company-contact-grid")], [
            contact_link("support@astraof.com", tr(ctx, "Поддержка и аккаунты", "Support and accounts")),
            contact_link("press@astraof.com", tr(ctx, "Пресса и медиа", "Press and media")),
            contact_link("privacy@astraof.com", tr(ctx, "Приватность и данные", "Privacy and data")),
            contact_link("safety@astraof.com", tr(ctx, "Доверие и безопасность", "Trust and safety")),
            contact_link("legal@astraof.com", tr(ctx, "Юридические запросы", "Legal requests")),
            contact_link("partners@astraof.com", tr(ctx, "Партнёрства", "Partnerships")),
          ]),
          html.p([attribute.class("company-note")], [
            html.text(tr(
              ctx,
              "Astral никогда не запрашивает пароль, полные данные карты или чувствительные данные безопасности по email.",
              "Astral will never request your password, full card details, or sensitive security credentials by email.",
            )),
          ]),
        ]),
      ]),
    ]),
  ])
}

fn product_card(icon: Element(a), title: String, body: String) -> Element(a) {
  html.article([attribute.class("company-product-card")], [
    html.div([attribute.class("company-icon")], [icon]),
    html.h3([attribute.class("company-card-title")], [html.text(title)]),
    html.p([attribute.class("company-card-body")], [html.text(body)]),
  ])
}

fn info_item(label: String, value: String) -> Element(a) {
  html.div([attribute.class("company-info-item")], [
    html.span([], [html.text(label)]),
    html.strong([], [html.text(value)]),
  ])
}

fn contact_link(email: String, label: String) -> Element(a) {
  html.a(
    [
      attribute.href("mailto:" <> email),
      attribute.class("company-contact-link"),
    ],
    [
      html.span([], [html.text(label)]),
      html.strong([], [html.text(email)]),
    ],
  )
}
