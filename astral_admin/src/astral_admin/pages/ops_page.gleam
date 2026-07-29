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
import astral_admin/web.{type Context, type Session, prepend_base_path}
import gleam/option.{type Option, None, Some}
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
  let proxy_base = prepend_base_path(ctx, "/api-proxy/ops")
  let content = render_dashboard(proxy_base)

  let html =
    layout.page(
      "Деплой и поддержка",
      "ops",
      ctx,
      session,
      current_admin,
      flash_data,
      content,
    )
  wisp.html_response(element.to_document_string(html), 200)
}

fn render_dashboard(proxy_base: String) {
  h.div([a.class("max-w-7xl mx-auto space-y-6")], [
    h.div(
      [a.class("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between")],
      [
        h.div([], [
          ui.heading_page("Деплой / CI / Updater"),
          ui.text_small_muted(
            "Сводка продакшена, волны rollout, smoke-checks и инструменты поддержки.",
          ),
        ]),
        h.div([a.class("flex flex-wrap gap-2")], [
          action_button("Обновить", "ops-refresh", "secondary"),
          action_button("Smoke-check", "ops-smoke", "secondary"),
          action_button("Копировать debug bundle", "ops-copy", "secondary"),
        ]),
      ],
    ),
    alert_banner(),
    h.div(
      [a.class("grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3")],
      [
        stat_card("Deploy SHA", "ops-deploy-sha", "text-sky-300"),
        stat_card("Волна rollout", "ops-rollout-wave", "text-violet-300"),
        stat_card("Покрытие", "ops-rollout-percent", "text-emerald-300"),
        stat_card("SHA mismatch", "ops-sha-mismatch", "text-amber-300"),
      ],
    ),
    h.div(
      [a.class("grid grid-cols-1 lg:grid-cols-2 gap-4")],
      [
        panel("Health probes", "ops-health-panel"),
        panel("API runtime", "ops-runtime-panel"),
      ],
    ),
    h.div(
      [a.class("grid grid-cols-1 lg:grid-cols-2 gap-4")],
      [
        panel("Deploy state", "ops-deploy-panel"),
        panel("Release / version.json (live)", "ops-release-live-panel"),
      ],
    ),
    h.div(
      [a.class("grid grid-cols-1 lg:grid-cols-2 gap-4")],
      [
        panel("Release waves (.release-waves.json)", "ops-waves-panel"),
        panel("Release policy", "ops-policy-panel"),
      ],
    ),
    h.div(
      [a.class("grid grid-cols-1 lg:grid-cols-2 gap-4")],
      [
        panel("Status summary (API)", "ops-status-panel"),
        panel("Файлы на сервере", "ops-files-panel"),
      ],
    ),
    support_section(),
    h.div([a.id("ops-action-log"), a.class("hidden rounded-xl border border-zinc-800 bg-zinc-950/80 p-4")], [
      h.pre([a.id("ops-action-output"), a.class("text-xs text-zinc-300 whitespace-pre-wrap font-mono")], [
        element.text(""),
      ]),
    ]),
    h.script([], dashboard_script(proxy_base)),
  ])
}

fn alert_banner() -> element.Element(a) {
  h.div(
    [
      a.id("ops-alert"),
      a.class("hidden rounded-xl border px-4 py-3 text-sm"),
    ],
    [element.text("")],
  )
}

fn stat_card(label: String, id: String, value_class: String) -> element.Element(a) {
  h.div(
    [a.class("rounded-xl border border-zinc-800/80 bg-zinc-950/65 px-4 py-3")],
    [
      h.div(
        [
          a.class(
            "text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-zinc-500",
          ),
        ],
        [element.text(label)],
      ),
      h.div(
        [a.id(id), a.class("mt-2 text-base font-semibold " <> value_class)],
        [element.text("—")],
      ),
    ],
  )
}

fn panel(title: String, id: String) -> element.Element(a) {
  h.div(
    [a.class("rounded-xl border border-zinc-800/80 bg-zinc-950/65 overflow-hidden")],
    [
      h.div(
        [a.class("border-b border-zinc-800/80 px-4 py-3")],
        [
          h.h2(
            [a.class("text-sm font-medium text-zinc-200")],
            [element.text(title)],
          ),
        ],
      ),
      h.pre(
        [
          a.id(id),
          a.class(
            "p-4 text-xs text-zinc-300 whitespace-pre-wrap font-mono max-h-96 overflow-auto",
          ),
        ],
        [element.text("Загрузка…")],
      ),
    ],
  )
}

fn action_button(label: String, id: String, tone: String) -> element.Element(a) {
  let class_name = case tone {
    "danger" ->
      "inline-flex items-center rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm font-medium text-red-200 hover:bg-red-950/70"
    _ ->
      "inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
  }

  h.button([a.type_("button"), a.id(id), a.class(class_name)], [element.text(label)])
}

fn support_section() -> element.Element(a) {
  h.div(
    [a.class("rounded-xl border border-zinc-800/80 bg-zinc-950/65 p-4 space-y-4")],
    [
      h.h2([a.class("text-sm font-medium text-zinc-200")], [
        element.text("Инструменты поддержки"),
      ]),
      h.p([a.class("text-xs text-zinc-500")], [
        element.text(
          "Действия с волнами работают только если на API включено ASTRAL_OPS_ACTIONS_ENABLED=1 и смонтирован репозиторий.",
        ),
      ]),
      h.div([a.class("flex flex-wrap gap-2")], [
        action_button("Advance wave", "ops-advance", "secondary"),
        action_button("Full rollout (100%)", "ops-full", "danger"),
        action_button("Rewrite version.json", "ops-write-version", "secondary"),
      ]),
      h.div([a.id("ops-links"), a.class("flex flex-wrap gap-3 text-sm")], []),
      h.div([a.id("ops-commands"), a.class("space-y-1")], []),
    ],
  )
}

fn dashboard_script(proxy_base: String) -> String {
  "
  (function() {
    const base = '" <> proxy_base <> "';
    let lastSnapshot = null;

    const el = (id) => document.getElementById(id);
    const setText = (id, value) => { const node = el(id); if (node) node.textContent = value ?? '—'; };
    const setJson = (id, value) => {
      const node = el(id);
      if (node) node.textContent = value == null ? '—' : JSON.stringify(value, null, 2);
    };

    const showAlert = (message, tone) => {
      const node = el('ops-alert');
      if (!node) return;
      node.textContent = message;
      node.classList.remove('hidden');
      node.className = 'rounded-xl border px-4 py-3 text-sm ' + (
        tone === 'error' ? 'border-red-900/60 bg-red-950/30 text-red-200' :
        tone === 'warn' ? 'border-amber-900/60 bg-amber-950/30 text-amber-200' :
        'border-emerald-900/60 bg-emerald-950/30 text-emerald-200'
      );
    };

    const hideAlert = () => {
      const node = el('ops-alert');
      if (node) node.classList.add('hidden');
    };

    const fetchJson = async (path, options) => {
      const response = await fetch(base + path, {
        cache: 'no-store',
        headers: { 'accept': 'application/json' },
        ...options,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || ('HTTP ' + response.status));
      }
      return body;
    };

    const formatRollout = (snap) => {
      const rollout = snap?.release?.rollout_live || snap?.release?.version_live?.rollout;
      if (!rollout) return { wave: '—', percent: '—' };
      return {
        wave: rollout.wave + ' / ' + (rollout.wavesTotal ?? '?') + ' (' + (rollout.label || '') + ')',
        percent: (rollout.percent ?? '—') + '%',
      };
    };

    const renderSnapshot = (snap) => {
      lastSnapshot = snap;
      hideAlert();

      setText('ops-deploy-sha', snap.deploy?.sha || snap.release?.live_sha || '—');
      const rollout = formatRollout(snap);
      setText('ops-rollout-wave', rollout.wave);
      setText('ops-rollout-percent', rollout.percent);

      const mismatch = snap.release?.sha_mismatch;
      const mismatchEl = el('ops-sha-mismatch');
      if (mismatchEl) {
        if (mismatch === true) {
          mismatchEl.textContent = 'ДА';
          mismatchEl.className = 'mt-2 text-base font-semibold text-red-400';
          showAlert('SHA mismatch: deploy state не совпадает с live version.json', 'warn');
        } else if (mismatch === false) {
          mismatchEl.textContent = 'нет';
          mismatchEl.className = 'mt-2 text-base font-semibold text-emerald-300';
        } else {
          mismatchEl.textContent = 'n/a';
          mismatchEl.className = 'mt-2 text-base font-semibold text-zinc-400';
        }
      }

      setJson('ops-health-panel', snap.health);
      setJson('ops-runtime-panel', { ...snap.api_runtime, repo_root: snap.repo_root, generated_at: snap.generated_at });
      setJson('ops-deploy-panel', snap.deploy);
      setJson('ops-release-live-panel', snap.release?.version_live);
      setJson('ops-waves-panel', snap.release?.waves_state);
      setJson('ops-policy-panel', snap.release?.policy);
      setJson('ops-status-panel', snap.health?.api_status?.summary);
      setJson('ops-files-panel', snap.files);

      const links = el('ops-links');
      if (links && snap.links) {
        links.innerHTML = Object.entries(snap.links).map(([key, url]) =>
          '<a class=\"text-sky-400 hover:text-sky-300 underline\" target=\"_blank\" rel=\"noopener\" href=\"' + url + '\">' + key + '</a>'
        ).join('');
      }

      const commands = el('ops-commands');
      if (commands && Array.isArray(snap.support_commands)) {
        commands.innerHTML = snap.support_commands.map((cmd) =>
          '<code class=\"block text-xs font-mono text-zinc-400 bg-zinc-900/80 rounded px-2 py-1\">' + cmd + '</code>'
        ).join('');
      }
    };

    const showActionOutput = (data) => {
      const wrap = el('ops-action-log');
      const out = el('ops-action-output');
      if (wrap) wrap.classList.remove('hidden');
      if (out) out.textContent = JSON.stringify(data, null, 2);
      if (data.snapshot) renderSnapshot(data.snapshot);
    };

    const loadSnapshot = async () => {
      try {
        const snap = await fetchJson('/snapshot');
        renderSnapshot(snap);
      } catch (err) {
        showAlert('Не удалось загрузить snapshot: ' + err.message, 'error');
      }
    };

    const runSmoke = async () => {
      try {
        const result = await fetchJson('/smoke', { method: 'POST' });
        showActionOutput(result);
        showAlert(result.all_pass ? 'Smoke-check: все OK' : 'Smoke-check: есть ошибки', result.all_pass ? 'ok' : 'warn');
      } catch (err) {
        showAlert('Smoke-check failed: ' + err.message, 'error');
      }
    };

    const postAction = async (path, confirmText) => {
      if (confirmText && !window.confirm(confirmText)) return;
      try {
        const result = await fetchJson(path, { method: 'POST' });
        showActionOutput(result);
        showAlert('Команда выполнена: ' + path, result.ok === false ? 'error' : 'ok');
      } catch (err) {
        showAlert('Action failed: ' + err.message, 'error');
      }
    };

    el('ops-refresh')?.addEventListener('click', loadSnapshot);
    el('ops-smoke')?.addEventListener('click', runSmoke);
    el('ops-copy')?.addEventListener('click', async () => {
      if (!lastSnapshot) await loadSnapshot();
      if (!lastSnapshot) return;
      const bundle = JSON.stringify(lastSnapshot, null, 2);
      try {
        await navigator.clipboard.writeText(bundle);
        showAlert('Debug bundle скопирован в буфер (' + bundle.length + ' bytes)', 'ok');
      } catch {
        showActionOutput(lastSnapshot);
        showAlert('Clipboard недоступен — см. action log ниже', 'warn');
      }
    });
    el('ops-advance')?.addEventListener('click', () => postAction('/release/advance', 'Advance rollout wave?'));
    el('ops-full')?.addEventListener('click', () => postAction('/release/full', 'Вывести rollout на 100% для всех?'));
    el('ops-write-version')?.addEventListener('click', () => postAction('/release/write-version', 'Перезаписать dist/version.json?'));

    loadSnapshot();
    setInterval(loadSnapshot, 60000);
  })();
  "
}
