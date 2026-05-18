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
import astral_marketing/i18n
import astral_marketing/markdown_utils
import astral_marketing/pages/layout
import astral_marketing/web.{type Context}
import gleam/list
import lustre/attribute
import lustre/element
import lustre/element/html
import wisp

// Inline, page-scoped stylesheet. We deliberately do not use the site's
// `.policy-prose` / `.marketing-panel` / `.motion-reveal` hooks — none of
// those animate/fade a 67 KB article cleanly, and Apple-style editorial
// typography wants its own narrow, airy column.
const manifesto_css = "
html{scroll-behavior:smooth;}
.astral-manifesto{
  --ink:#f5f5f7;
  --muted:#a1a1aa;
  --dim:#71717a;
  --rule:rgba(255,255,255,0.09);
  --rule-strong:rgba(255,255,255,0.18);
  --accent:#a5b4fc;
  --accent-dim:rgba(165,180,252,0.35);
  font-family:system-ui,-apple-system,'SF Pro Text','Inter','Helvetica Neue',sans-serif;
  color:var(--ink);
  font-size:18px;
  line-height:1.72;
  letter-spacing:-0.003em;
  -webkit-font-smoothing:antialiased;
  position:relative;
}
.astral-manifesto::before{
  content:'';position:absolute;top:0;left:50%;transform:translateX(-50%);
  width:100%;max-width:1400px;height:520px;pointer-events:none;z-index:-1;
  background:radial-gradient(ellipse 600px 260px at 50% 80px,rgba(165,180,252,0.08),transparent 70%);
}
.astral-manifesto ::selection{background:rgba(165,180,252,0.3);color:#fff;}
/* ── HERO ─────────────────────────────────────────────── */
.astral-manifesto .ap-hero{text-align:center;padding:72px 0 64px;}
.astral-manifesto .ap-eyebrow{
  font-size:11px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;
  color:var(--accent);margin-bottom:24px;display:block;
}
.astral-manifesto .ap-title{
  font-family:'New York','Times New Roman',Georgia,serif;
  font-weight:500;font-size:96px;line-height:0.96;letter-spacing:-0.037em;
  margin:0 0 24px;color:#fff;
  background:linear-gradient(180deg,#ffffff 0%,#d4d4d8 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
}
@media(max-width:640px){.astral-manifesto .ap-title{font-size:60px;}}
.astral-manifesto .ap-lede{
  font-style:italic;font-size:21px;line-height:1.55;color:#c4c4c8;
  max-width:560px;margin:0 auto;font-family:'New York','Times New Roman',Georgia,serif;
  font-weight:400;
}
.astral-manifesto .ap-meta{
  margin-top:40px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;
  color:var(--dim);
}
.astral-manifesto .ap-meta::before,.astral-manifesto .ap-meta::after{
  content:'';display:inline-block;width:40px;height:1px;background:var(--rule-strong);
  vertical-align:middle;margin:0 16px;
}
/* ── TABLE OF CONTENTS ───────────────────────────────── */
.astral-manifesto .ap-toc{
  max-width:680px;margin:72px auto 0;padding:28px 0;
  border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);
}
.astral-manifesto .ap-toc-label{
  font-size:10px;font-weight:600;letter-spacing:0.3em;text-transform:uppercase;
  color:var(--dim);margin-bottom:16px;display:block;text-align:center;
}
.astral-manifesto .ap-toc ol{
  list-style:none;padding:0;margin:0;
  display:grid;grid-template-columns:1fr 1fr;gap:8px 32px;
}
@media(max-width:640px){.astral-manifesto .ap-toc ol{grid-template-columns:1fr;}}
.astral-manifesto .ap-toc li{
  counter-increment:ap-toc;
  font-size:14px;line-height:1.4;
  display:flex;gap:14px;align-items:baseline;
}
.astral-manifesto .ap-toc li::before{
  content:counter(ap-toc,upper-roman)'.';
  font-family:'New York','Times New Roman',Georgia,serif;
  font-size:13px;color:var(--accent);flex-shrink:0;min-width:26px;font-style:italic;
}
.astral-manifesto .ap-toc{counter-reset:ap-toc;}
.astral-manifesto .ap-toc a{
  color:#d4d4d8;text-decoration:none;
  transition:color 0.2s ease;
}
.astral-manifesto .ap-toc a:hover{color:#fff;}
/* ── BODY ─────────────────────────────────────────────── */
.astral-manifesto .ap-body{max-width:680px;margin:0 auto;padding:0 4px;}
.astral-manifesto .ap-body>div>p{margin:0 0 22px;color:#e4e4e7;}
/* Drop cap on the preface opening paragraph */
.astral-manifesto .ap-body>div>p:first-of-type::first-letter{
  font-family:'New York','Times New Roman',Georgia,serif;
  float:left;font-size:76px;line-height:0.88;font-weight:500;
  color:#fff;padding:6px 12px 0 0;margin-top:4px;
}
.astral-manifesto .ap-body h2{
  font-family:'New York','Times New Roman',Georgia,serif;
  font-weight:500;font-size:44px;line-height:1.1;letter-spacing:-0.026em;
  color:#fff;margin:112px 0 32px;padding-top:40px;position:relative;
}
.astral-manifesto .ap-body h2::before{
  content:'';position:absolute;top:0;left:0;width:60px;height:2px;
  background:linear-gradient(90deg,var(--accent) 0%,transparent 100%);
}
.astral-manifesto .ap-body h2:first-child{margin-top:32px;padding-top:0;}
.astral-manifesto .ap-body h2:first-child::before{display:none;}
.astral-manifesto .ap-body h3{
  font-weight:600;font-size:22px;line-height:1.3;letter-spacing:-0.012em;
  color:#fff;margin:64px 0 18px;
}
.astral-manifesto .ap-body strong{font-weight:600;color:#fff;}
.astral-manifesto .ap-body em{color:var(--muted);}
/* Small-caps labels for 'Что это значит / Как это выглядит / Чего мы не делаем' */
.astral-manifesto .ap-body p>em:first-child{
  display:block;font-style:normal;
  font-size:10px;font-weight:600;letter-spacing:0.26em;text-transform:uppercase;
  color:var(--accent);margin:24px 0 8px;
}
.astral-manifesto .ap-body p:has(>em:first-child){
  padding-left:20px;border-left:2px solid var(--rule-strong);
}
/* Ornamental HR — three dots */
.astral-manifesto .ap-body hr{
  border:0;margin:88px 0;
  text-align:center;overflow:visible;height:1px;position:relative;
}
.astral-manifesto .ap-body hr::after{
  content:'· · ·';display:block;position:absolute;top:-12px;left:50%;
  transform:translateX(-50%);
  color:var(--dim);font-size:22px;letter-spacing:0.7em;
  padding:0 18px;
}
.astral-manifesto .ap-body hr::before{
  content:'';display:block;position:absolute;top:0;left:10%;right:10%;
  height:1px;background:linear-gradient(90deg,transparent,var(--rule-strong) 50%,transparent);
}
.astral-manifesto .ap-body ul,.astral-manifesto .ap-body ol{
  margin:4px 0 26px;padding-left:28px;
}
.astral-manifesto .ap-body li{margin:0 0 12px;color:#e4e4e7;}
.astral-manifesto .ap-body ul li::marker{color:#52525b;}
.astral-manifesto .ap-body ol li::marker{color:var(--accent);font-weight:600;}
.astral-manifesto .ap-body a{
  color:var(--accent);text-decoration:underline;
  text-decoration-color:var(--accent-dim);text-underline-offset:3px;
  transition:text-decoration-color 0.15s ease;
}
.astral-manifesto .ap-body a:hover{text-decoration-color:var(--accent);}
/* Anchor offset for sticky nav */
.astral-manifesto .ap-body h2,.astral-manifesto .ap-body h3{scroll-margin-top:120px;}
/* ── FOOTER ──────────────────────────────────────────── */
.astral-manifesto .ap-footer{
  max-width:680px;margin:128px auto 0;padding:40px 0 0;
  border-top:1px solid var(--rule);text-align:center;
}
.astral-manifesto .ap-footer-mark{
  font-family:'New York','Times New Roman',Georgia,serif;
  font-size:18px;letter-spacing:0.4em;color:var(--accent);
  margin-bottom:16px;
}
.astral-manifesto .ap-footer-meta{
  font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:var(--dim);
}
.astral-manifesto .ap-footer-meta span{margin:0 10px;color:#3f3f46;}
/* Back-to-top pill */
.astral-manifesto .ap-top{
  display:inline-block;margin-top:24px;padding:10px 20px;
  font-size:11px;letter-spacing:0.22em;text-transform:uppercase;
  color:var(--muted);text-decoration:none;
  border:1px solid var(--rule-strong);border-radius:999px;
  transition:all 0.2s ease;
}
.astral-manifesto .ap-top:hover{color:#fff;border-color:var(--accent);}
"

pub fn render(req: wisp.Request, ctx: Context) -> wisp.Response {
  let _ = i18n.get_context(ctx.i18n_db, ctx.locale)
  let help_data = help_center.load_help_articles(ctx.locale)
  let title = "Философия"
  let eyebrow = "Манифест · v 1.0"
  let subtitle =
    "Публичный документ о том, во что мы верим, когда делаем Astral."

  let markdown_element =
    markdown_utils.load_markdown_with_fallback("priv/philosophy", ctx.locale)
    |> markdown_utils.render_markdown_to_element(ctx, help_data)

  let toc_entries = [
    #("#часть-i-почему-astral-существует", "Почему Astral существует"),
    #("#часть-ii-десять-принципов", "Десять принципов"),
    #("#часть-iii-чем-astral-не-является", "Чем Astral не является"),
    #("#часть-iv-plutonium-и-вопрос-денег", "Plutonium и вопрос денег"),
    #("#часть-v-платформа-и-ощущение", "Платформа и ощущение"),
    #("#часть-vi-приватность-и-данные", "Приватность и данные"),
    #("#часть-vii-модерация-и-безопасность", "Модерация и безопасность"),
    #("#часть-viii-разработчики-и-боты", "Разработчики и боты"),
    #("#часть-ix-что-мы-обещаем--и-чего-не-обещаем", "Что мы обещаем"),
    #("#часть-x-как-этот-документ-меняется", "Как документ меняется"),
  ]
  let toc_items =
    toc_entries
    |> list.map(fn(entry) {
      let #(href, label) = entry
      html.li([], [
        html.a([attribute.href(href)], [html.text(label)]),
      ])
    })

  let content = [
    html.style([], manifesto_css),
    html.main(
      [
        attribute.class("astral-manifesto"),
        attribute.id("top"),
        attribute.style("padding", "128px 24px 96px"),
      ],
      [
        html.header([attribute.class("ap-hero")], [
          html.span([attribute.class("ap-eyebrow")], [html.text(eyebrow)]),
          html.h1([attribute.class("ap-title")], [html.text(title)]),
          html.p([attribute.class("ap-lede")], [html.text(subtitle)]),
          html.p([attribute.class("ap-meta")], [html.text("ASTRAOF.COM")]),
        ]),
        html.nav([attribute.class("ap-toc")], [
          html.span([attribute.class("ap-toc-label")], [html.text("Содержание")]),
          html.ol([], toc_items),
        ]),
        html.div([attribute.class("ap-body")], [markdown_element]),
        html.footer([attribute.class("ap-footer")], [
          html.p([attribute.class("ap-footer-mark")], [html.text("A S T R A L")]),
          html.p([attribute.class("ap-footer-meta")], [
            html.text("Версия 1.0"),
            html.span([], [html.text("·")]),
            html.text("Апрель 2026"),
            html.span([], [html.text("·")]),
            html.text("astraof.com"),
          ]),
          html.a([attribute.class("ap-top"), attribute.href("#top")], [
            html.text("Наверх"),
          ]),
        ]),
      ],
    ),
  ]

  layout.render(req, ctx, layout.article_page_meta(title, subtitle), content)
  |> element.to_document_string_tree
  |> wisp.html_response(200)
}
