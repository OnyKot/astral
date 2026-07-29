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
import gleam/option
import lustre/attribute as a
import lustre/element
import lustre/element/html as h
import wisp.{type Response}

pub fn view(
  ctx: Context,
  session: Session,
  current_admin: option.Option(common.UserLookupResult),
  flash_data: option.Option(flash.Flash),
) -> Response {
  let content = case ctx.metrics_endpoint {
    option.None -> render_not_configured()
    option.Some(_) -> render_dashboard(ctx)
  }

  let html =
    layout.page(
      "База данных",
      "database",
      ctx,
      session,
      current_admin,
      flash_data,
      content,
    )
  wisp.html_response(element.to_document_string(html), 200)
}

fn render_not_configured() {
  ui.stack("6", [
    ui.heading_page("База и Redis"),
    h.div([a.class("rounded-xl border border-zinc-800/80 bg-zinc-950/65 p-6")], [
      h.p([a.class("text-sm text-zinc-400")], [
        element.text(
          "Сервис метрик не настроен. Укажи ASTRAL_METRICS_HOST, чтобы открыть панель.",
        ),
      ]),
    ]),
  ])
}

fn render_dashboard(ctx: Context) {
  let proxy_endpoint = prepend_base_path(ctx, "/api/metrics")

  h.div([a.class("max-w-7xl mx-auto space-y-6")], [
    ui.heading_page("База и Redis"),
    ui.text_small_muted("Только чтение. Cassandra, DB pool, Redis."),
    section("Cassandra", "grid-cols-1 md:grid-cols-2 xl:grid-cols-5", [
      metric_card("P50 latency", "cass-p50", "text-emerald-300"),
      metric_card("P95 latency", "cass-p95", "text-amber-300"),
      metric_card("P99 latency", "cass-p99", "text-red-300"),
      metric_card("Ошибки", "cass-errors", "text-zinc-100"),
      metric_card("Замеры", "cass-count", "text-zinc-100"),
    ]),
    section("Соединения", "grid-cols-1 md:grid-cols-2 xl:grid-cols-4", [
      metric_card("Всего", "db-pool-total", "text-zinc-100"),
      metric_card("Свободно", "db-pool-idle", "text-zinc-100"),
      metric_card("В ожидании", "db-pool-waiting", "text-amber-300"),
      status_card("Redis", "redis-status"),
    ]),
    h.script([], render_dashboard_script(proxy_endpoint)),
  ])
}

fn section(
  title: String,
  grid_class: String,
  items: List(element.Element(a)),
) -> element.Element(a) {
  h.div([a.class("space-y-3")], [
    h.h2(
      [
        a.class(
          "text-[0.7rem] font-medium uppercase tracking-[0.18em] text-zinc-400",
        ),
      ],
      [
        element.text(title),
      ],
    ),
    h.div([a.class("grid gap-3 " <> grid_class)], items),
  ])
}

fn metric_card(
  label: String,
  id: String,
  value_class: String,
) -> element.Element(a) {
  h.div(
    [a.class("rounded-lg border border-zinc-800/80 bg-zinc-950/65 px-4 py-3")],
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
        [
          element.text("-"),
        ],
      ),
    ],
  )
}

fn status_card(label: String, id: String) -> element.Element(a) {
  h.div(
    [a.class("rounded-lg border border-zinc-800/80 bg-zinc-950/65 px-4 py-3")],
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
        [
          a.id(id),
          a.class(
            "mt-2 inline-flex items-center rounded-full border border-zinc-800/80 bg-zinc-900/90 px-2.5 py-1 text-xs font-medium text-zinc-300",
          ),
        ],
        [element.text("-")],
      ),
    ],
  )
}

fn render_dashboard_script(metrics_endpoint: String) -> String {
  "
  (async function() {
    const endpoint = '" <> metrics_endpoint <> "';
    if (!endpoint) return;

    const fetchJson = async (path) => {
      const response = await fetch(endpoint + path, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      return response.json();
    };

    const latestValue = (data) => {
      if (!Array.isArray(data) || data.length === 0) {
        return null;
      }

      const latest = data.reduce((acc, point) => {
        if (!acc) {
          return point;
        }
        return point.timestamp > acc.timestamp ? point : acc;
      }, null);

      return latest ? latest.value : null;
    };

    const formatNumber = (value) => {
      if (value === null || value === undefined || Number.isNaN(value)) {
        return '-';
      }
      return Number(value).toLocaleString('en-US');
    };

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = value;
      }
    };

    const setRedisStatus = (value) => {
      const el = document.getElementById('redis-status');
      if (!el) {
        return;
      }

      const isOnline = Number(value) > 0;
      el.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
      el.className =
        'mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ' +
        (isOnline
          ? 'border-emerald-900 bg-emerald-950/50 text-emerald-300'
          : 'border-red-900 bg-red-950/50 text-red-300');
    };

    try {
      const [latencyResp, errorResp, totalResp, idleResp, waitingResp, redisResp] = await Promise.all([
        fetchJson('/query/percentiles?metric=cassandra.query.latency_ms'),
        fetchJson('/query/aggregate?metric=cassandra.query.error'),
        fetchJson('/query?metric=db.pool.total'),
        fetchJson('/query?metric=db.pool.idle'),
        fetchJson('/query?metric=db.pool.waiting'),
        fetchJson('/query?metric=redis.connection.status')
      ]);

      const percentiles = latencyResp.percentiles;
      if (percentiles) {
        setText('cass-count', formatNumber(percentiles.count));
        setText('cass-p50', percentiles.p50.toFixed(1) + ' ms');
        setText('cass-p95', percentiles.p95.toFixed(1) + ' ms');
        setText('cass-p99', percentiles.p99.toFixed(1) + ' ms');
      }

      setText('cass-errors', formatNumber(errorResp.total ?? 0));
      setText('db-pool-total', formatNumber(latestValue(totalResp.data)));
      setText('db-pool-idle', formatNumber(latestValue(idleResp.data)));
      setText('db-pool-waiting', formatNumber(latestValue(waitingResp.data)));
      setRedisStatus(latestValue(redisResp.data));
    } catch (error) {
      console.error('Failed to load database control metrics:', error);
    }
  })();
  "
}
