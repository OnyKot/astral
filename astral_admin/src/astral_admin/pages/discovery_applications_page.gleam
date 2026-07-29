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
import astral_admin/api/discovery_applications
import astral_admin/components/flash
import astral_admin/components/layout
import astral_admin/components/ui
import astral_admin/web.{type Context, type Session, action, href}
import gleam/int
import gleam/list
import gleam/option
import gleam/string
import lustre/attribute as a
import lustre/element
import lustre/element/html as h
import wisp.{type Request, type Response}

const status_filter_options = [
  #("pending", "Ожидают"),
  #("approved", "Одобрены"),
  #("rejected", "Отклонены"),
  #("withdrawn", "Отозваны"),
]

fn parse_status(value: String) -> option.Option(String) {
  case value {
    "pending" | "approved" | "rejected" | "withdrawn" -> option.Some(value)
    _ -> option.None
  }
}

fn status_label(status: String) -> String {
  case status {
    "pending" -> "Ожидает"
    "approved" -> "Одобрен"
    "rejected" -> "Отклонён"
    "withdrawn" -> "Отозван"
    _ -> status
  }
}

fn status_pill_class(status: String) -> String {
  case status {
    "pending" -> "bg-yellow-500/10 border-yellow-500/40 text-yellow-300"
    "approved" -> "bg-green-500/10 border-green-500/40 text-green-300"
    "rejected" -> "bg-red-500/10 border-red-500/40 text-red-300"
    "withdrawn" -> "bg-zinc-500/10 border-zinc-500/40 text-zinc-300"
    _ -> "bg-zinc-700/40 border-zinc-700 text-zinc-300"
  }
}

fn truncate(text: String, max: Int) -> String {
  case string.length(text) > max {
    True -> string.slice(text, 0, max) <> "…"
    False -> text
  }
}

pub fn view(
  ctx: Context,
  session: Session,
  current_admin: option.Option(common.UserLookupResult),
  flash_data: option.Option(flash.Flash),
  status_filter: option.Option(String),
) -> Response {
  let normalized_filter = case status_filter {
    option.Some(s) -> parse_status(s)
    option.None -> option.Some("pending")
  }

  let result =
    discovery_applications.list_applications(ctx, session, normalized_filter)

  let content = case result {
    Ok(response) -> {
      let total = list.length(response.applications)
      h.div([a.class("max-w-7xl mx-auto")], [
        ui.flex_row_between([
          ui.heading_page("Заявки в Discovery"),
          h.span([a.class("body-sm text-zinc-400")], [
            element.text(int.to_string(total) <> " в очереди"),
          ]),
        ]),
        filter_chips(ctx, normalized_filter),
        case list.is_empty(response.applications) {
          True -> empty_state(normalized_filter)
          False ->
            h.div(
              [a.class("mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3")],
              list.map(response.applications, fn(app) {
                render_application_card(ctx, app, normalized_filter)
              }),
            )
        },
      ])
    }
    Error(err) -> error_view(err)
  }

  let html =
    layout.page(
      "Заявки в Discovery",
      "discovery-applications",
      ctx,
      session,
      current_admin,
      flash_data,
      h.div([], [content, discovery_applications_script()]),
    )
  wisp.html_response(element.to_document_string(html), 200)
}

fn filter_chips(
  ctx: Context,
  current: option.Option(String),
) -> element.Element(a) {
  let all_chip = case current {
    option.None -> chip_active("Все", "/discovery-applications", ctx)
    _ -> chip_inactive("Все", "/discovery-applications?all=1", ctx)
  }

  let chips =
    list.map(status_filter_options, fn(opt) {
      let #(value, label) = opt
      case current == option.Some(value) {
        True ->
          chip_active(label, "/discovery-applications?status=" <> value, ctx)
        False ->
          chip_inactive(label, "/discovery-applications?status=" <> value, ctx)
      }
    })

  h.div([a.class("mt-4 flex items-center gap-2 flex-wrap")], [all_chip, ..chips])
}

fn chip_active(label: String, url: String, ctx: Context) -> element.Element(a) {
  h.a(
    [
      href(ctx, url),
      a.class(
        "px-3 py-1.5 bg-indigo-500/15 text-indigo-200 border border-indigo-500/40 rounded-full text-sm",
      ),
    ],
    [element.text(label)],
  )
}

fn chip_inactive(label: String, url: String, ctx: Context) -> element.Element(a) {
  h.a(
    [
      href(ctx, url),
      a.class(
        "px-3 py-1.5 bg-zinc-950 text-zinc-300 border border-zinc-700 rounded-full text-sm hover:bg-zinc-900 hover:text-zinc-100 transition-colors",
      ),
    ],
    [element.text(label)],
  )
}

fn empty_state(current: option.Option(String)) -> element.Element(a) {
  let message = case current {
    option.Some("pending") -> "Очередь пуста — все заявки разобраны."
    option.Some(s) -> "Нет заявок со статусом " <> status_label(s) <> "."
    option.None -> "Заявок нет."
  }
  h.div(
    [
      a.class(
        "mt-8 bg-zinc-950/80 border border-zinc-800 rounded-xl p-12 text-center",
      ),
    ],
    [
      h.div([a.class("text-base text-zinc-300")], [element.text(message)]),
    ],
  )
}

fn render_application_card(
  ctx: Context,
  app: discovery_applications.DiscoveryApplication,
  _filter: option.Option(String),
) -> element.Element(a) {
  let category = option.unwrap(app.category, "—") |> string.replace("_", " ")
  let description = option.unwrap(app.description, "(no description)")

  h.div(
    [
      a.class(
        "bg-zinc-950/80 border border-zinc-800 rounded-xl shadow-xs p-6 flex flex-col gap-4",
      ),
    ],
    [
      h.div([a.class("flex items-start justify-between gap-3")], [
        h.div([a.class("flex flex-col gap-1")], [
          h.a(
            [
              href(ctx, "/guilds/" <> app.guild_id),
              a.class(
                "text-base font-semibold text-zinc-100 hover:text-indigo-300 underline-offset-2 hover:underline",
              ),
            ],
            [element.text("Guild " <> app.guild_id)],
          ),
          h.div([a.class("text-xs text-zinc-500")], [
            element.text("Категория: " <> category),
          ]),
        ]),
        h.span(
          [
            a.class(
              "px-2.5 py-0.5 rounded-full text-xs font-semibold border "
              <> status_pill_class(app.status),
            ),
          ],
          [element.text(status_label(app.status))],
        ),
      ]),
      h.div([a.class("text-sm text-zinc-300 leading-relaxed")], [
        element.text(truncate(description, 260)),
      ]),
      case list.is_empty(app.tags) {
        True -> element.none()
        False ->
          h.div([a.class("flex flex-wrap gap-1.5")], [
            list_tags(app.tags),
          ])
      },
      h.div([a.class("text-xs text-zinc-500 flex flex-col gap-0.5")], [
        h.div([], [
          element.text(
            "Подал: "
            <> app.submitted_by
            <> " · "
            <> format_date(app.submitted_at),
          ),
        ]),
        case app.reviewed_at {
          option.Some(reviewed_at) ->
            h.div([], [
              element.text(
                "Рассмотрено: "
                <> format_date(reviewed_at)
                <> case app.reviewed_by {
                  option.Some(rid) -> " (" <> rid <> ")"
                  option.None -> ""
                },
              ),
            ])
          option.None -> element.none()
        },
        case app.review_note {
          option.Some(note) ->
            h.div([a.class("text-zinc-400 italic")], [
              element.text("«" <> note <> "»"),
            ])
          option.None -> element.none()
        },
      ]),
      action_buttons(ctx, app),
    ],
  )
}

fn list_tags(tags: List(String)) -> element.Element(a) {
  element.fragment(
    list.map(tags, fn(tag) {
      h.span(
        [
          a.class(
            "px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-300 rounded-full text-[11px]",
          ),
        ],
        [element.text(tag)],
      )
    }),
  )
}

fn action_buttons(
  ctx: Context,
  app: discovery_applications.DiscoveryApplication,
) -> element.Element(a) {
  case app.status {
    "pending" ->
      h.div(
        [
          a.class(
            "pt-3 border-t border-zinc-800 flex items-center justify-end gap-2 flex-wrap",
          ),
        ],
        [
          h.form(
            [
              a.method("post"),
              action(ctx, "/discovery-applications?action=reject"),
              a.attribute("data-async", "true"),
              a.attribute("data-confirm", "Отклонить эту заявку?"),
            ],
            [
              h.input([
                a.type_("hidden"),
                a.name("guild_id"),
                a.value(app.guild_id),
              ]),
              h.input([
                a.type_("text"),
                a.name("review_note"),
                a.placeholder("Причина (опционально)"),
                a.class(
                  "px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200 mr-2 w-48",
                ),
              ]),
              h.button(
                [
                  a.type_("submit"),
                  a.class(
                    "px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors",
                  ),
                ],
                [element.text("Отклонить")],
              ),
            ],
          ),
          h.form(
            [
              a.method("post"),
              action(ctx, "/discovery-applications?action=approve"),
              a.attribute("data-async", "true"),
            ],
            [
              h.input([
                a.type_("hidden"),
                a.name("guild_id"),
                a.value(app.guild_id),
              ]),
              h.button(
                [
                  a.type_("submit"),
                  a.class(
                    "px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors",
                  ),
                ],
                [element.text("Одобрить")],
              ),
            ],
          ),
        ],
      )
    _ ->
      h.div(
        [
          a.class(
            "pt-3 border-t border-zinc-800 flex items-center justify-end gap-2",
          ),
        ],
        [
          h.form(
            [
              a.method("post"),
              action(ctx, "/discovery-applications?action=approve"),
              a.attribute("data-async", "true"),
              a.attribute("data-confirm", "Переоткрыть и одобрить эту заявку?"),
            ],
            [
              h.input([
                a.type_("hidden"),
                a.name("guild_id"),
                a.value(app.guild_id),
              ]),
              h.button(
                [
                  a.type_("submit"),
                  a.class(
                    "px-3 py-1.5 bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg text-sm hover:bg-zinc-700 transition-colors",
                  ),
                ],
                [element.text("Одобрить заново")],
              ),
            ],
          ),
        ],
      )
  }
}

fn format_date(iso: String) -> String {
  // The API returns ISO-8601; show the date portion only.
  string.slice(iso, 0, 10)
}

pub fn handle_action(
  req: Request,
  ctx: Context,
  session: Session,
  action_name: option.Option(String),
  background: Bool,
) -> Response {
  use form_data <- wisp.require_form(req)

  let guild_id =
    list.key_find(form_data.values, "guild_id") |> option.from_result
  let review_note =
    list.key_find(form_data.values, "review_note")
    |> option.from_result
    |> option.then(fn(value) {
      case string.trim(value) {
        "" -> option.None
        trimmed -> option.Some(trimmed)
      }
    })

  case action_name {
    option.Some("approve") ->
      handle_approve(ctx, session, guild_id, review_note, background)
    option.Some("reject") ->
      handle_reject(ctx, session, guild_id, review_note, background)
    _ ->
      case background {
        True -> wisp.json_response("{\"error\": \"Unknown action\"}", 400)
        False ->
          flash.redirect_with_error(
            ctx,
            "/discovery-applications",
            "Unknown action",
          )
      }
  }
}

fn handle_approve(
  ctx: Context,
  session: Session,
  guild_id: option.Option(String),
  review_note: option.Option(String),
  background: Bool,
) -> Response {
  case guild_id {
    option.Some(id) ->
      case
        discovery_applications.approve_application(
          ctx,
          session,
          id,
          review_note,
        )
      {
        Ok(_) ->
          case background {
            True -> wisp.json_response("{}", 204)
            False ->
              flash.redirect_with_success(
                ctx,
                "/discovery-applications",
                "Заявка одобрена для гильдии " <> id,
              )
          }
        Error(err) ->
          case background {
            True ->
              wisp.json_response(
                "{\"error\": \"" <> api_error_message(err) <> "\"}",
                400,
              )
            False ->
              flash.redirect_with_error(
                ctx,
                "/discovery-applications",
                api_error_message(err),
              )
          }
      }
    option.None ->
      case background {
        True -> wisp.json_response("{\"error\": \"Missing guild_id\"}", 400)
        False ->
          flash.redirect_with_error(
            ctx,
            "/discovery-applications",
            "Missing guild_id",
          )
      }
  }
}

fn handle_reject(
  ctx: Context,
  session: Session,
  guild_id: option.Option(String),
  review_note: option.Option(String),
  background: Bool,
) -> Response {
  case guild_id {
    option.Some(id) ->
      case
        discovery_applications.reject_application(ctx, session, id, review_note)
      {
        Ok(_) ->
          case background {
            True -> wisp.json_response("{}", 204)
            False ->
              flash.redirect_with_success(
                ctx,
                "/discovery-applications",
                "Заявка отклонена для гильдии " <> id,
              )
          }
        Error(err) ->
          case background {
            True ->
              wisp.json_response(
                "{\"error\": \"" <> api_error_message(err) <> "\"}",
                400,
              )
            False ->
              flash.redirect_with_error(
                ctx,
                "/discovery-applications",
                api_error_message(err),
              )
          }
      }
    option.None ->
      case background {
        True -> wisp.json_response("{\"error\": \"Missing guild_id\"}", 400)
        False ->
          flash.redirect_with_error(
            ctx,
            "/discovery-applications",
            "Missing guild_id",
          )
      }
  }
}

fn api_error_message(err: common.ApiError) -> String {
  case err {
    common.Unauthorized -> "Unauthorized"
    common.Forbidden(message) -> message
    common.NotFound -> "Не найдено"
    common.NetworkError -> "Network error"
    common.ServerError -> "Server error"
  }
}

fn error_view(err: common.ApiError) -> element.Element(a) {
  h.div([a.class("max-w-7xl mx-auto")], [
    h.div([a.class("bg-red-950/40 border border-red-900 rounded-lg p-8")], [
      h.div([a.class("text-sm text-red-200")], [
        element.text("Не удалось загрузить заявки: " <> api_error_message(err)),
      ]),
    ]),
  ])
}

fn discovery_applications_script() -> element.Element(a) {
  let js =
    "
(function () {
  const forms = document.querySelectorAll('form[data-async]');
  if (!forms.length) return;

  function showToast(message, variant) {
    const box = document.createElement('div');
    box.className = 'fixed left-4 right-4 bottom-4 z-50';
    box.innerHTML =
      '<div class=\"max-w-xl mx-auto\">' +
      '<div class=\"px-4 py-3 rounded-lg shadow border ' +
      (variant === 'success'
        ? 'bg-green-50 border-green-200 text-green-800'
        : 'bg-red-50 border-red-200 text-red-800') +
      '\">' +
      '<div class=\"text-sm font-semibold\">' +
      (variant === 'success' ? 'Saved' : 'Action error') +
      '</div>' +
      '<div class=\"text-sm mt-1 break-words\">' + (message || 'OK') + '</div>' +
      '</div></div>';
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 4200);
  }

  function setButtonLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      btn.dataset.originalText = btn.textContent;
      btn.textContent = 'Working...';
    } else if (btn.dataset.originalText) {
      btn.textContent = btn.dataset.originalText;
    }
  }

  async function submitForm(form) {
    const actionUrl = new URL(form.action, window.location.origin);
    actionUrl.searchParams.set('background', '1');
    const fd = new FormData(form);
    const body = new URLSearchParams();
    fd.forEach((v, k) => body.append(k, v));
    const resp = await fetch(actionUrl.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: body.toString(),
      credentials: 'same-origin',
    });
    if (!resp.ok && resp.status !== 204) {
      let txt = '';
      try { txt = await resp.text(); } catch (_) {}
      const error = new Error(txt || 'Request failed (' + resp.status + ')');
      error.status = resp.status;
      throw error;
    }
  }

  forms.forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const confirmMsg = form.getAttribute('data-confirm');
      if (confirmMsg && !window.confirm(confirmMsg)) return;
      const btn = form.querySelector('button[type=\"submit\"]');
      setButtonLoading(btn, true);
      submitForm(form)
        .then(() => window.location.reload())
        .catch((err) => {
          if (err && err.status === 400) {
            window.location.reload();
            return;
          }
          showToast(err && err.message ? err.message : String(err), 'error');
        })
        .finally(() => setButtonLoading(btn, false));
    });
  });
})();
"

  h.script([a.attribute("defer", "defer")], js)
}
