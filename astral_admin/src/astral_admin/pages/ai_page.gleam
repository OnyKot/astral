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

import astral_admin/api/common
import astral_admin/components/flash
import astral_admin/components/layout
import astral_admin/components/ui
import astral_admin/web.{type Context, type Session}
import gleam/option.{type Option}
import lustre/attribute as a
import lustre/element
import lustre/element/html as h
import wisp.{type Response}

pub fn view(
  ctx: Context,
  session: Session,
  current_admin: Option(common.UserLookupResult),
  flash_data: Option(flash.Flash),
) -> Response {
  let content = render_dashboard()

  let html =
    layout.page(
      "ИИ · Панель мониторинга",
      "ai",
      ctx,
      session,
      current_admin,
      flash_data,
      content,
    )
  wisp.html_response(element.to_document_string(html), 200)
}

fn stat_card(title: String, id: String, tone: String) -> element.Element(a) {
  let tone_class = case tone {
    "positive" -> "text-emerald-400"
    "danger" -> "text-rose-400"
    "warning" -> "text-amber-400"
    _ -> "text-zinc-100"
  }
  h.div(
    [
      a.class(
        "rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm p-5",
      ),
    ],
    [
      h.p([a.class("text-xs uppercase tracking-wider text-zinc-400 mb-2")], [
        element.text(title),
      ]),
      h.p([a.id(id), a.class("text-2xl font-bold " <> tone_class)], [
        element.text("—"),
      ]),
    ],
  )
}

fn render_dashboard() -> element.Element(a) {
  ui.stack("6", [
    ui.heading_page("ИИ · Grok мониторинг"),
    h.p([a.class("text-sm text-zinc-400 -mt-4")], [
      element.text(
        "Реальные счётчики по вызовам Grok API: модерация, поиск, анализ репортов. Обновляются каждые 10 секунд.",
      ),
    ]),
    // Config status
    h.div(
      [
        a.id("ai-config"),
        a.class(
          "rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-5 flex flex-wrap gap-4 items-center",
        ),
      ],
      [
        h.span([a.class("text-sm text-zinc-400")], [element.text("Загрузка...")]),
      ],
    ),
    // Stats grid
    h.div([a.class("grid grid-cols-2 md:grid-cols-4 gap-4")], [
      stat_card("Всего запросов", "ai-stat-total", "neutral"),
      stat_card("Успешных", "ai-stat-success", "positive"),
      stat_card("Ошибок", "ai-stat-failed", "danger"),
      stat_card("Токенов (prompt+comp)", "ai-stat-tokens", "neutral"),
    ]),
    h.div([a.class("grid grid-cols-2 md:grid-cols-4 gap-4")], [
      stat_card("Модераций", "ai-stat-mod-calls", "neutral"),
      stat_card("Заблокировано", "ai-stat-mod-blocks", "warning"),
      stat_card("Расширений поиска", "ai-stat-search", "neutral"),
      stat_card("Анализов репортов", "ai-stat-reports", "neutral"),
    ]),
    // Last request + error
    h.div([a.class("grid grid-cols-1 md:grid-cols-2 gap-4")], [
      h.div(
        [a.class("rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4")],
        [
          h.p([a.class("text-xs uppercase tracking-wider text-zinc-400 mb-2")], [
            element.text("Последний запрос"),
          ]),
          h.p([a.id("ai-last-request"), a.class("text-sm text-zinc-200")], [
            element.text("—"),
          ]),
        ],
      ),
      h.div(
        [a.class("rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4")],
        [
          h.p([a.class("text-xs uppercase tracking-wider text-zinc-400 mb-2")], [
            element.text("Последняя ошибка"),
          ]),
          h.p(
            [
              a.id("ai-last-error"),
              a.class("text-sm text-rose-300 font-mono break-all"),
            ],
            [element.text("—")],
          ),
        ],
      ),
    ]),
    // Test moderation section
    h.div(
      [
        a.class(
          "rounded-xl border border-indigo-900/60 bg-indigo-950/20 p-5 space-y-4",
        ),
      ],
      [
        h.h2([a.class("text-lg font-semibold text-zinc-100")], [
          element.text("Проверка модерации"),
        ]),
        h.p([a.class("text-sm text-zinc-400")], [
          element.text(
            "Введите текст и посмотрите, что бы решил Grok. Результат не сохраняется.",
          ),
        ]),
        h.textarea(
          [
            a.id("ai-test-input"),
            a.attribute("rows", "3"),
            a.attribute("placeholder", "Введите текст для проверки..."),
            a.class(
              "w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-100 outline-none focus:border-indigo-500",
            ),
          ],
          "",
        ),
        h.button(
          [
            a.id("ai-test-btn"),
            a.attribute("type", "button"),
            a.class(
              "px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-500 transition-colors",
            ),
          ],
          [element.text("Проверить")],
        ),
        h.div(
          [
            a.id("ai-test-result"),
            a.class(
              "hidden rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm font-mono text-zinc-200 whitespace-pre-wrap",
            ),
          ],
          [],
        ),
      ],
    ),
    // Client-side polling + test handler
    h.script(
      [a.attribute("type", "text/javascript")],
      "
(function(){
  const basePath = document.documentElement.getAttribute('data-base-path') || '';
  const statsUrl = basePath + '/api-proxy/ai/stats';
  const testUrl = basePath + '/api-proxy/ai/test';

  function setText(id, v){ const el=document.getElementById(id); if(el) el.textContent = v; }

  async function loadStats(){
    try {
      const r = await fetch(statsUrl, { credentials: 'same-origin' });
      if (!r.ok) return;
      const d = await r.json();
      const cfg = d.config || {};
      const rt = d.runtime || {};
      const cfgEl = document.getElementById('ai-config');
      if (cfgEl) {
        const statusChip = (label, on) => '<span class=\"inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full '+(on?'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30':'bg-zinc-800 text-zinc-400 border border-zinc-700')+'\">'+ (on?'●':'○') +' '+label+'</span>';
        cfgEl.innerHTML = statusChip('Grok '+(cfg.enabled?'включён':'выключен'), !!cfg.enabled)
          + statusChip('Модерация', !!cfg.moderation_enabled)
          + statusChip('Поиск', !!cfg.search_enhancement_enabled)
          + '<span class=\"text-xs text-zinc-500 ml-auto\">Модель: <b class=\"text-zinc-300\">'+(cfg.model||'?')+'</b></span>';
      }
      setText('ai-stat-total', rt.requests_total ?? 0);
      setText('ai-stat-success', rt.requests_success ?? 0);
      setText('ai-stat-failed', rt.requests_failed ?? 0);
      setText('ai-stat-tokens', (rt.tokens_prompt ?? 0) + (rt.tokens_completion ?? 0));
      setText('ai-stat-mod-calls', rt.moderation_calls ?? 0);
      setText('ai-stat-mod-blocks', rt.moderation_blocks ?? 0);
      setText('ai-stat-search', rt.search_expansion_calls ?? 0);
      setText('ai-stat-reports', rt.report_analysis_calls ?? 0);
      setText('ai-last-request', rt.last_request_at || 'ни разу');
      setText('ai-last-error', rt.last_error || '—');
    } catch (e) { /* ignore */ }
  }
  loadStats();
  setInterval(loadStats, 10000);

  const btn = document.getElementById('ai-test-btn');
  if (btn) btn.addEventListener('click', async () => {
    const inp = document.getElementById('ai-test-input');
    const out = document.getElementById('ai-test-result');
    const text = inp.value.trim();
    if (!text || !out) return;
    out.classList.remove('hidden');
    out.textContent = 'Проверяю...';
    try {
      const r = await fetch(testUrl, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        credentials: 'same-origin',
        body: JSON.stringify({text}),
      });
      const d = await r.json();
      out.textContent = JSON.stringify(d, null, 2);
    } catch (e) {
      out.textContent = 'Ошибка: ' + e.message;
    }
  });
})();
",
    ),
  ])
}
