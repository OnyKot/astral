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

import astral_marketing/i18n
import astral_marketing/web.{type Context}
import kielet.{gettext as g_}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html

/// Renders a self-contained AI assistant chat widget.
/// The widget is a floating button that opens a chat modal.
/// All logic is inline vanilla JS — no framework dependency.
pub fn ai_chat_widget(locale: String) -> Element(a) {
  let is_ru = locale == "ru" || locale == "ru-RU"
  let placeholder = case is_ru {
    True -> "Задайте вопрос об Astral..."
    False -> "Ask about Astral..."
  }
  let title = case is_ru {
    True -> "ИИ-ассистент"
    False -> "AI Assistant"
  }
  let subtitle = case is_ru {
    True -> "Спросите что угодно об Astral"
    False -> "Ask anything about Astral"
  }
  let send_label = case is_ru {
    True -> "Отправить"
    False -> "Send"
  }
  let thinking_label = case is_ru {
    True -> "Думаю..."
    False -> "Thinking..."
  }
  let powered_label = case is_ru {
    True -> "Работает на Grok"
    False -> "Powered by Grok"
  }
  let connection_error_label = case is_ru {
    True -> "Ошибка соединения"
    False -> "Connection error"
  }

  html.div([attribute.id("ai-assistant-root")], [
    // Styles
    element.element(
      "style",
      [],
      [
        element.text(
          "
#ai-fab{position:fixed;bottom:20px;right:20px;z-index:9999;width:52px;height:52px;border-radius:16px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 32px rgba(79,70,229,.4);transition:transform .15s}
#ai-fab:hover{transform:scale(1.08)}
#ai-modal{display:none;position:fixed;bottom:20px;right:20px;z-index:9999;width:380px;max-width:calc(100vw - 40px);height:520px;max-height:calc(100vh - 40px);border-radius:20px;border:1px solid rgba(255,255,255,.1);background:linear-gradient(180deg,rgba(15,17,28,.98),rgba(8,10,18,.98));box-shadow:0 25px 80px rgba(0,0,0,.6);flex-direction:column;overflow:hidden;backdrop-filter:blur(24px)}
#ai-modal.open{display:flex}
#ai-header{padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.03)}
#ai-badge{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#4f46e5,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff}
#ai-title{font-weight:600;font-size:14px;color:#e2e8f0;margin-left:8px}
#ai-close{background:rgba(255,255,255,.08);border:none;border-radius:8px;width:28px;height:28px;color:#94a3b8;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center}
#ai-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
#ai-empty{text-align:center;color:#64748b;font-size:13px;margin-top:40px}
#ai-empty b{color:#e2e8f0;display:block;margin-bottom:4px;font-size:15px}
.ai-msg{max-width:85%;padding:10px 14px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
.ai-msg-user{align-self:flex-end;border-radius:16px 16px 4px 16px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff}
.ai-msg-bot{align-self:flex-start;border-radius:16px 16px 16px 4px;background:rgba(255,255,255,.06);color:#e2e8f0;border:1px solid rgba(255,255,255,.06)}
#ai-input-area{padding:12px 14px;border-top:1px solid rgba(255,255,255,.08);display:flex;gap:8px}
#ai-input{flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px 14px;color:#e2e8f0;font-size:13px;outline:none}
#ai-send{background:linear-gradient(135deg,#4f46e5,#7c3aed);border:none;border-radius:12px;padding:10px 16px;color:#fff;font-weight:600;font-size:13px;cursor:pointer}
#ai-send:disabled{opacity:.4;cursor:not-allowed}
#ai-powered{font-size:10px;color:#475569;text-align:center;padding:0 0 8px}
@media(max-width:480px){#ai-modal{width:calc(100vw - 16px);right:8px;bottom:8px;height:calc(100vh - 80px)}}
",
        ),
      ],
    ),
    // FAB button
    html.button(
      [
        attribute.id("ai-fab"),
        attribute.type_("button"),
        attribute.attribute("aria-label", title),
        attribute.attribute("onclick", "document.getElementById('ai-modal').classList.add('open');this.style.display='none'"),
      ],
      [
        element.element(
          "svg",
          [
            attribute.attribute("width", "24"),
            attribute.attribute("height", "24"),
            attribute.attribute("viewBox", "0 0 24 24"),
            attribute.attribute("fill", "none"),
            attribute.attribute("stroke", "currentColor"),
            attribute.attribute("stroke-width", "2"),
          ],
          [
            element.element(
              "path",
              [attribute.attribute("d", "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z")],
              [],
            ),
          ],
        ),
      ],
    ),
    // Modal
    html.div([attribute.id("ai-modal")], [
      html.div([attribute.id("ai-header")], [
        html.div([
          attribute.style("display", "flex"),
          attribute.style("align-items", "center"),
        ], [
          html.div([attribute.id("ai-badge")], [html.text("AI")]),
          html.span([attribute.id("ai-title")], [html.text(title)]),
        ]),
        html.button(
          [
            attribute.id("ai-close"),
            attribute.type_("button"),
            attribute.attribute("onclick", "document.getElementById('ai-modal').classList.remove('open');document.getElementById('ai-fab').style.display='flex'"),
          ],
          [html.text("\u{00d7}")],
        ),
      ]),
      html.div([attribute.id("ai-msgs")], [
        html.div([attribute.id("ai-empty")], [
          html.text("\u{1f4da}"),
          html.br([]),
          html.b([], [html.text(subtitle)]),
        ]),
      ]),
      html.div([attribute.id("ai-input-area")], [
        html.input([
          attribute.id("ai-input"),
          attribute.type_("text"),
          attribute.placeholder(placeholder),
          attribute.attribute("onkeydown", "if(event.key==='Enter')document.getElementById('ai-send').click()"),
        ]),
        html.button(
          [
            attribute.id("ai-send"),
            attribute.type_("button"),
          ],
          [html.text(send_label)],
        ),
      ]),
      html.div([attribute.id("ai-powered")], [html.text(powered_label)]),
    ]),
    // Script
    element.element(
      "script",
      [],
      [
        element.text(
          "
(function(){
var msgs=document.getElementById('ai-msgs');
var input=document.getElementById('ai-input');
var btn=document.getElementById('ai-send');
var history=[];
function addMsg(role,text){
  var d=document.createElement('div');
  d.className='ai-msg '+(role==='user'?'ai-msg-user':'ai-msg-bot');
  d.textContent=text;
  msgs.appendChild(d);
  msgs.scrollTop=msgs.scrollHeight;
  var empty=document.getElementById('ai-empty');
  if(empty)empty.remove();
}
btn.onclick=async function(){
  var t=input.value.trim();
  if(!t)return;
  input.value='';
  addMsg('user',t);
  history.push({role:'user',content:t});
  btn.disabled=true;
  addMsg('assistant','" <> thinking_label <> "');
  try{
    var r=await fetch('/docs/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:t,history:history.slice(-6)})});
    var d=await r.json();
    msgs.lastChild.textContent=d.reply||d.error||'Error';
    history.push({role:'assistant',content:d.reply||''});
  }catch(e){msgs.lastChild.textContent='" <> connection_error_label <> "';}
  btn.disabled=false;
  input.focus();
};
})();
",
        ),
      ],
    ),
  ])
}

pub fn hero_section(
  ctx: Context,
  title: String,
  subtitle: String,
  search_action: String,
  search_placeholder: String,
  search_value: String,
) -> Element(a) {
  let i18n_ctx = i18n.get_context(ctx.i18n_db, ctx.locale)

  html.section(
    [
      attribute.class("marketing-shell text-white"),
    ],
    [
      html.div([attribute.class("mx-auto max-w-4xl text-center")], [
        html.div(
          [
            attribute.class("motion-reveal motion-delay-1 mb-5 flex justify-center"),
          ],
          [
            html.span(
              [
                attribute.class(
                  "marketing-kicker",
                ),
              ],
              [html.text(g_(i18n_ctx, "Help Center"))],
            ),
          ],
        ),
        html.h1(
          [
            attribute.class("motion-reveal motion-delay-2 marketing-title mb-4 md:mb-5"),
          ],
          [
            html.text(title),
          ],
        ),
        html.p(
          [
            attribute.class("motion-reveal motion-delay-3 marketing-subtitle mb-8 md:mb-10 mx-auto max-w-2xl"),
          ],
          [
            html.text(subtitle),
          ],
        ),
        html.form(
          [
            attribute.method("GET"),
            attribute.action(search_action),
            attribute.class("motion-reveal motion-delay-4 mx-auto max-w-2xl"),
          ],
          [
            html.div([attribute.class("relative flex items-center")], [
              html.input([
                attribute.type_("text"),
                attribute.name("q"),
                attribute.value(search_value),
                attribute.placeholder(search_placeholder),
                attribute.class(
                  "liquid-glass w-full rounded-full border border-white/12 bg-white/6 px-5 py-4 pr-24 text-base text-white shadow-[0_20px_60px_rgba(0,0,0,0.35)] outline-none placeholder:text-white/60 focus-visible:ring-2 focus-visible:ring-white/40 sm:pr-28 sm:text-lg",
                ),
              ]),
              html.button(
                [
                  attribute.type_("submit"),
                  attribute.class(
                    "liquid-glass absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-5 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.03] md:text-base",
                  ),
                ],
                [html.text(g_(i18n_ctx, "Search"))],
              ),
            ]),
          ],
        ),
      ]),
    ],
  )
}
