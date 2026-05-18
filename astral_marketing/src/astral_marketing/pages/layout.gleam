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

import astral_marketing/components/footer
import astral_marketing/components/navigation
import astral_marketing/locale
import astral_marketing/pages/layout/icons
import astral_marketing/pages/layout/meta
import astral_marketing/pages/layout/scripts
import astral_marketing/web.{type Context, cache_busted_asset}
import gleam/list
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import wisp

pub type PageMeta =
  meta.PageMeta

pub fn default_page_meta() -> PageMeta {
  meta.default_page_meta()
}

pub fn article_page_meta(title: String, description: String) -> PageMeta {
  meta.article_page_meta(title, description)
}

pub fn format_page_title(base_title: String) -> String {
  meta.format_page_title(base_title)
}

fn build_common_head_elements(
  ctx: Context,
  page_meta: PageMeta,
) -> List(Element(a)) {
  [
    html.meta([attribute.attribute("charset", "UTF-8")]),
    html.meta([
      attribute.name("viewport"),
      attribute.attribute("content", "width=device-width, initial-scale=1.0"),
    ]),
  ]
  |> list.append(meta.build_meta_tags(ctx, page_meta))
  |> list.append([
    html.title([], page_meta.title),
    html.link([
      attribute.rel("stylesheet"),
      attribute.href(cache_busted_asset(ctx, "/static/app.css")),
    ]),
  ])
  |> list.append(icons.build_icon_links(ctx.app_endpoint))
}

pub fn render(
  req: wisp.Request,
  ctx: Context,
  page_meta: PageMeta,
  content: List(Element(a)),
) -> Element(a) {
  html.html(
    [attribute.attribute("lang", locale.get_code_from_locale(ctx.locale))],
    [
      html.head(
        [],
        build_common_head_elements(ctx, page_meta)
          |> list.append([scripts.main_page_script(), scripts.download_script()]),
      ),
      html.body(
        [
          attribute.class(
            "marketing-body flex min-h-screen flex-col bg-[#09090b] font-sans text-white",
          ),
        ],
        [
          navigation.render(ctx, req),
          html.div(
            [
              attribute.id("page-shell"),
              attribute.class("marketing-page flex grow flex-col"),
            ],
            [
              html.div([attribute.class("flex grow flex-col")], content),
              footer.render(ctx),
            ],
          ),
        ],
      ),
    ],
  )
}

pub fn docs_layout(
  req: wisp.Request,
  ctx: Context,
  page_meta: PageMeta,
  page_title: String,
  content: List(Element(a)),
) -> Element(a) {
  html.html(
    [attribute.attribute("lang", locale.get_code_from_locale(ctx.locale))],
    [
      html.head(
        [],
        build_common_head_elements(ctx, page_meta)
          |> list.append([scripts.docs_page_script()]),
      ),
      html.body([attribute.class("bg-[#f6f7fb] text-zinc-900")], [
        navigation.render(ctx, req),
        html.main(
          [
            attribute.class(
              "min-h-screen bg-gradient-to-b from-[#f8f9ff] to-[#f1f3f9] text-zinc-900 px-6 pb-16 pt-32 md:pt-36",
            ),
          ],
          [
            html.article(
              [
                attribute.class(
                  "prose prose-lg mx-auto max-w-4xl rounded-2xl border border-zinc-200/80 bg-white/95 p-6 shadow-sm md:p-10 prose-headings:text-zinc-900 prose-p:text-zinc-700 prose-li:text-zinc-700 prose-strong:text-zinc-900 prose-a:text-[#4641D9] hover:prose-a:text-[#3d38c7]",
                ),
              ],
              [
                html.h1([attribute.class("mb-2 text-4xl font-bold")], [
                  html.text(page_title),
                ]),
                ..content
              ],
            ),
          ],
        ),
        footer.render(ctx),
      ]),
    ],
  )
}
