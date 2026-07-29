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

import astral_admin/api/common.{type UserLookupResult}
import astral_admin/avatar
import astral_admin/components/flash
import astral_admin/components/icons_meta
import astral_admin/components/ui
import astral_admin/navigation
import astral_admin/user
import astral_admin/web.{type Context, type Session, cache_busted_asset, href}
import gleam/list
import gleam/option.{type Option}
import gleam/string
import lustre/attribute as a
import lustre/element
import lustre/element/html as h

pub fn build_head(title: String, ctx: Context) -> element.Element(a) {
  build_head_with_refresh(title, ctx, False)
}

pub fn build_head_with_refresh(
  title: String,
  ctx: Context,
  auto_refresh: Bool,
) -> element.Element(a) {
  let refresh_meta = case auto_refresh {
    True -> [
      h.meta([a.attribute("http-equiv", "refresh"), a.attribute("content", "3")]),
    ]
    False -> []
  }

  h.head([], [
    h.meta([a.attribute("charset", "UTF-8")]),
    h.meta([
      a.attribute("name", "viewport"),
      a.attribute("content", "width=device-width, initial-scale=1.0"),
    ]),
    ..list.append(
      refresh_meta,
      list.append(
        [
          h.title([], title <> " ~ Astral Admin"),
          h.link([
            a.rel("stylesheet"),
            a.href(cache_busted_asset(ctx, "/static/app.css")),
          ]),
        ],
        icons_meta.build_icon_links(ctx.cdn_endpoint),
      ),
    )
  ])
}

pub fn page(
  title: String,
  active_page: String,
  ctx: Context,
  session: Session,
  current_admin: Option(UserLookupResult),
  flash_data: Option(flash.Flash),
  content: element.Element(a),
) {
  page_with_refresh(
    title,
    active_page,
    ctx,
    session,
    current_admin,
    flash_data,
    content,
    False,
  )
}

pub fn page_with_refresh(
  title: String,
  active_page: String,
  ctx: Context,
  session: Session,
  current_admin: Option(UserLookupResult),
  flash_data: Option(flash.Flash),
  content: element.Element(a),
  auto_refresh: Bool,
) {
  let admin_acls = admin_acls_from(current_admin)

  h.html(
    [a.attribute("lang", "ru"), a.attribute("data-base-path", ctx.base_path)],
    [
      build_head_with_refresh(title, ctx, auto_refresh),
      h.body([a.class("min-h-screen overflow-hidden text-zinc-100")], [
        h.div([a.class("flex h-screen")], [
          sidebar(ctx, active_page, admin_acls),
          h.div(
            [
              a.attribute("data-sidebar-overlay", ""),
              a.class("fixed inset-0 bg-black/50 z-30 hidden lg:hidden"),
            ],
            [],
          ),
          h.div(
            [
              a.class("flex-1 flex flex-col w-full h-screen overflow-y-auto"),
            ],
            [
              header(ctx, session, current_admin),
              h.main(
                [
                  a.class(
                    "flex-1 p-4 sm:p-6 lg:p-8 text-[0.95rem] leading-6 text-zinc-100",
                  ),
                ],
                [
                  h.div([a.class("w-full max-w-[1400px] mx-auto")], [
                    case flash_data {
                      option.Some(_) ->
                        h.div([a.class("mb-6")], [flash.view(flash_data)])
                      option.None -> element.none()
                    },
                    content,
                  ]),
                ],
              ),
            ],
          ),
        ]),
        command_palette(ctx, admin_acls),
        sidebar_interaction_script(),
      ]),
    ],
  )
}

fn sidebar(ctx: Context, active_page: String, admin_acls: List(String)) {
  h.div(
    [
      a.attribute("data-sidebar", ""),
      a.class(
        "fixed inset-y-0 left-0 z-40 w-64 h-screen bg-zinc-950/92 text-zinc-100 flex flex-col transform -translate-x-full transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-auto border-r border-zinc-800/80 backdrop-blur",
      ),
    ],
    [
      h.div(
        [
          a.class("px-5 py-5 border-b border-zinc-800/80 space-y-3"),
        ],
        [
          h.a(
            [href(ctx, "/dashboard"), a.class("flex items-start gap-3 min-w-0")],
            [
              h.div(
                [
                  a.class(
                    "w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center text-indigo-200 text-sm font-semibold",
                  ),
                ],
                [
                  element.text("A"),
                ],
              ),
              h.div([a.class("min-w-0")], [
                h.h1([a.class("text-sm font-semibold tracking-tight")], [
                  element.text("Astral Admin"),
                ]),
                h.div(
                  [
                    a.class(
                      "text-[0.72rem] uppercase tracking-[0.18em] text-zinc-500",
                    ),
                  ],
                  [
                    element.text("Панель управления"),
                  ],
                ),
              ]),
            ],
          ),
          h.button(
            [
              a.type_("button"),
              a.attribute("data-sidebar-close", ""),
              a.class(
                "lg:hidden inline-flex items-center justify-center p-1.5 rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus:outline-none",
              ),
              a.attribute("aria-label", "Закрыть меню"),
            ],
            [element.text("Закрыть")],
          ),
        ],
      ),
      h.nav(
        [
          a.class(
            "flex-1 overflow-y-auto px-3 py-4 space-y-0.5 sidebar-scrollbar",
          ),
        ],
        admin_sidebar(ctx, active_page, admin_acls),
      ),
      sidebar_footer(ctx),
      h.script(
        [a.attribute("defer", "defer")],
        "(function(){var el=document.querySelector('[data-active]');if(el)el.scrollIntoView({block:'nearest'});})();",
      ),
    ],
  )
}

fn admin_sidebar(
  ctx: Context,
  active_page: String,
  admin_acls: List(String),
) -> List(element.Element(a)) {
  navigation.accessible_sections(admin_acls)
  |> list.map(fn(section) {
    let items =
      list.map(section.items, fn(item) {
        sidebar_item(
          ctx,
          item.title,
          item.path,
          item.active_key,
          active_page == item.active_key,
        )
      })

    sidebar_section(section.title, items)
  })
}

fn sidebar_section(title: String, items: List(element.Element(a))) {
  h.div([a.class("mb-6")], [
    h.div(
      [
        a.class(
          "text-zinc-500 text-[0.7rem] font-semibold uppercase tracking-[0.18em] px-3 mb-1.5",
        ),
      ],
      [
        element.text(title),
      ],
    ),
    h.div([a.class("space-y-0.5")], items),
  ])
}

fn sidebar_item(
  ctx: Context,
  title: String,
  path: String,
  active_key: String,
  active: Bool,
) {
  let classes = case active {
    True ->
      "flex items-center justify-between gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-sm font-medium text-indigo-200 transition-colors"
    False ->
      "flex items-center justify-between gap-2 rounded-lg border border-transparent px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-900/80 hover:text-zinc-100"
  }

  let attrs = case active {
    True -> [
      href(ctx, path),
      a.class(classes),
      a.attribute("data-active", ""),
      a.attribute("aria-current", "page"),
    ]
    False -> [href(ctx, path), a.class(classes)]
  }

  h.a(attrs, [
    h.span([a.class("truncate")], [element.text(title)]),
    h.span(
      [
        a.attribute("data-queue-badge", active_key),
        a.attribute("style", "display:none"),
        a.class(
          "items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[0.6875rem] font-semibold bg-red-500/80 text-white",
        ),
      ],
      [],
    ),
  ])
}

fn sidebar_footer(ctx: Context) {
  h.div([a.class("border-t border-zinc-800/80 px-4 py-4 space-y-2")], [
    h.div([a.class("flex items-center justify-between gap-3")], [
      h.div(
        [a.class("text-[0.7rem] uppercase tracking-[0.18em] text-zinc-500")],
        [
          element.text("Система"),
        ],
      ),
      metrics_status_badge(ctx),
    ]),
    h.div([a.class("text-xs text-zinc-400")], [
      element.text(case ctx.metrics_endpoint {
        option.Some(_) -> "Метрики включены"
        option.None -> "Метрики выключены"
      }),
    ]),
    h.div([a.class("text-xs text-zinc-500 truncate")], [
      element.text(ctx.api_endpoint),
    ]),
  ])
}

fn metrics_status_badge(ctx: Context) -> element.Element(a) {
  case ctx.metrics_endpoint {
    option.Some(_) -> ui.badge("METRICS ON", ui.BadgeSuccess)
    option.None -> ui.badge("METRICS OFF", ui.BadgeWarning)
  }
}

fn header(
  ctx: Context,
  session: Session,
  current_admin: Option(UserLookupResult),
) {
  h.header(
    [
      a.class(
        "bg-zinc-950/75 backdrop-blur-xl border-b border-zinc-800/80 px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4 sticky top-0 z-20",
      ),
    ],
    [
      h.div([a.class("flex items-center gap-3 min-w-0")], [
        h.button(
          [
            a.type_("button"),
            a.attribute("data-sidebar-toggle", ""),
            a.class(
              "lg:hidden inline-flex items-center justify-center p-2 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-900 focus:outline-none",
            ),
            a.attribute("aria-label", "Открыть меню"),
          ],
          [
            element.element(
              "svg",
              [
                a.attribute("xmlns", "http://www.w3.org/2000/svg"),
                a.attribute("viewBox", "0 0 24 24"),
                a.class("w-5 h-5"),
                a.attribute("fill", "none"),
                a.attribute("stroke", "currentColor"),
                a.attribute("stroke-width", "2"),
              ],
              [
                element.element(
                  "line",
                  [
                    a.attribute("x1", "3"),
                    a.attribute("y1", "6"),
                    a.attribute("x2", "21"),
                    a.attribute("y2", "6"),
                  ],
                  [],
                ),
                element.element(
                  "line",
                  [
                    a.attribute("x1", "3"),
                    a.attribute("y1", "12"),
                    a.attribute("x2", "21"),
                    a.attribute("y2", "12"),
                  ],
                  [],
                ),
                element.element(
                  "line",
                  [
                    a.attribute("x1", "3"),
                    a.attribute("y1", "18"),
                    a.attribute("x2", "21"),
                    a.attribute("y2", "18"),
                  ],
                  [],
                ),
              ],
            ),
          ],
        ),
        render_user_info(ctx, session, current_admin),
      ]),
      h.div([a.class("flex items-center gap-2")], [
        metrics_status_badge(ctx),
        recently_viewed_dropdown(),
        h.a(
          [
            href(ctx, "/logout"),
            a.class(
              "px-3.5 py-1.5 text-sm font-medium text-zinc-300 hover:text-zinc-100 border border-zinc-700 rounded-lg hover:border-zinc-600 hover:bg-zinc-900 transition-colors",
            ),
          ],
          [element.text("Выйти")],
        ),
      ]),
    ],
  )
}

fn recently_viewed_dropdown() -> element.Element(a) {
  h.div([a.class("relative"), a.attribute("data-recent-root", "")], [
    h.button(
      [
        a.type_("button"),
        a.attribute("data-recent-toggle", ""),
        a.class(
          "px-3.5 py-1.5 text-sm font-medium text-zinc-300 hover:text-zinc-100 border border-zinc-700 rounded-lg hover:border-zinc-600 hover:bg-zinc-900 transition-colors flex items-center gap-2",
        ),
      ],
      [
        element.text("Недавнее"),
        h.span([a.class("text-xs text-zinc-500")], [element.text("▾")]),
      ],
    ),
    h.div(
      [
        a.attribute("data-recent-menu", ""),
        a.class(
          "hidden absolute right-0 mt-2 w-72 max-h-80 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/95 shadow-2xl backdrop-blur z-30",
        ),
      ],
      [
        h.div(
          [
            a.class(
              "px-4 py-2 text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800",
            ),
          ],
          [
            element.text("Недавно просмотренные"),
          ],
        ),
        h.div(
          [
            a.attribute("data-recent-list", ""),
            a.class("py-1"),
          ],
          [],
        ),
      ],
    ),
  ])
}

fn render_user_info(
  ctx: Context,
  session: Session,
  current_admin: Option(UserLookupResult),
) {
  case current_admin {
    option.Some(admin_user) -> {
      h.a(
        [
          href(ctx, "/users/" <> session.user_id),
          a.class("flex items-center gap-3 hover:opacity-80 transition-opacity"),
        ],
        [
          render_avatar(
            ctx,
            admin_user.id,
            admin_user.avatar,
            admin_user.username,
          ),
          h.div([a.class("flex flex-col")], [
            h.div([a.class("text-sm font-medium text-zinc-100")], [
              element.text(
                admin_user.username
                <> "#"
                <> user.format_discriminator(admin_user.discriminator),
              ),
            ]),
            h.div([a.class("text-xs text-zinc-500")], [
              element.text("Админ"),
            ]),
          ]),
        ],
      )
    }
    option.None -> {
      h.div([a.class("text-sm text-zinc-400")], [
        element.text("Вход выполнен: "),
        h.a(
          [
            href(ctx, "/users/" <> session.user_id),
            a.class("text-indigo-300 hover:text-indigo-200 hover:underline"),
          ],
          [element.text(session.user_id)],
        ),
      ])
    }
  }
}

fn render_avatar(
  ctx: Context,
  user_id: String,
  avatar: Option(String),
  username: String,
) {
  h.img([
    a.src(avatar.get_user_avatar_url(
      ctx.media_endpoint,
      ctx.cdn_endpoint,
      user_id,
      avatar,
      True,
      ctx.asset_version,
    )),
    a.attribute(
      "onerror",
      avatar.get_user_avatar_fallback_onerror(
        ctx.cdn_endpoint,
        user_id,
        ctx.asset_version,
      ),
    ),
    a.alt(username <> "'s avatar"),
    a.class("w-10 h-10 rounded-full"),
  ])
}

fn sidebar_interaction_script() {
  h.script(
    [a.attribute("defer", "defer")],
    "
(function() {
  const sidebar = document.querySelector('[data-sidebar]');
  const overlay = document.querySelector('[data-sidebar-overlay]');
  const toggles = document.querySelectorAll('[data-sidebar-toggle]');
  const closes = document.querySelectorAll('[data-sidebar-close]');
  if (!sidebar || !overlay) return;

  const open = () => {
    sidebar.classList.remove('-translate-x-full');
    overlay.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  };

  const close = () => {
    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  };

  toggles.forEach((btn) => btn.addEventListener('click', () => {
    if (sidebar.classList.contains('-translate-x-full')) {
      open();
    } else {
      close();
    }
  }));

  closes.forEach((btn) => btn.addEventListener('click', close));
  overlay.addEventListener('click', close);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  const syncForDesktop = () => {
    if (window.innerWidth >= 1024) {
      overlay.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
      sidebar.classList.remove('-translate-x-full');
    } else {
      sidebar.classList.add('-translate-x-full');
    }
  };

  window.addEventListener('resize', syncForDesktop);
  syncForDesktop();

  // --- live queue counters --------------------------------------------
  // Polls /queue-counts.json every 30s and updates [data-queue-badge] spans.
  // Hides badges with 0 or missing values; shows red pill for non-zero.
  const basePath = document.documentElement.getAttribute('data-base-path') || '';
  const countsUrl = basePath + '/queue-counts.json';

  const updateBadges = (counts) => {
    document.querySelectorAll('[data-queue-badge]').forEach((badge) => {
      const key = badge.getAttribute('data-queue-badge');
      const value = counts && counts[key];
      if (typeof value === 'number' && value > 0) {
        badge.textContent = value > 99 ? '99+' : String(value);
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
        badge.textContent = '';
      }
    });
  };

  const fetchCounts = async () => {
    try {
      const resp = await fetch(countsUrl, { credentials: 'same-origin' });
      if (!resp.ok) return;
      const data = await resp.json();
      updateBadges(data);
    } catch (e) {
      // network errors are non-fatal — badges just stay stale
    }
  };

  fetchCounts();
  setInterval(fetchCounts, 30000);

  // --- recently viewed dropdown ----------------------------------------
  // Persists user/guild visits in localStorage and renders them in the
  // header dropdown. Records the current page on load if it matches a
  // /users/<id> or /guilds/<id> URL.
  const RECENT_KEY = 'astral.admin.recent.v1';
  const MAX_RECENTS = 12;

  const loadRecents = () => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    } catch (e) {
      return [];
    }
  };

  const saveRecents = (items) => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENTS)));
    } catch (e) {
      // quota or disabled storage — silently ignore
    }
  };

  const recordCurrentPage = () => {
    const path = window.location.pathname;
    const stripped = basePath ? path.replace(basePath, '') : path;
    const userMatch = stripped.match(/^\\/users\\/([0-9]+)\\/?$/);
    const guildMatch = stripped.match(/^\\/guilds\\/([0-9]+)\\/?$/);
    let entry = null;
    if (userMatch) {
      entry = { type: 'user', id: userMatch[1], path: path, label: 'User ' + userMatch[1] };
    } else if (guildMatch) {
      entry = { type: 'guild', id: guildMatch[1], path: path, label: 'Guild ' + guildMatch[1] };
    }
    if (!entry) return;
    const heading = document.querySelector('h1');
    if (heading && heading.textContent && heading.textContent.trim().length > 0 && heading.textContent.trim().length < 60) {
      entry.label = heading.textContent.trim();
    }
    const existing = loadRecents().filter((it) => !(it.type === entry.type && it.id === entry.id));
    existing.unshift({ ...entry, ts: Date.now() });
    saveRecents(existing);
  };

  const renderRecents = () => {
    const list = document.querySelector('[data-recent-list]');
    if (!list) return;
    const items = loadRecents();
    if (items.length === 0) {
      list.innerHTML = '<div class=\"px-4 py-4 text-xs text-zinc-500 text-center\">Пусто. Открой пользователя или сервер.</div>';
      return;
    }
    list.innerHTML = items.map((it) => {
      const tag = it.type === 'user' ? 'USER' : 'GUILD';
      return '<a href=\"' + it.path + '\" class=\"flex items-center justify-between gap-2 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900\">' +
        '<span class=\"truncate\">' + (it.label || it.path).replace(/[<>&\"']/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;','\"':'&quot;','\\'':'&#39;'}[c])) + '</span>' +
        '<span class=\"text-[10px] text-zinc-500 flex-shrink-0\">' + tag + '</span>' +
      '</a>';
    }).join('');
  };

  const recentToggle = document.querySelector('[data-recent-toggle]');
  const recentMenu = document.querySelector('[data-recent-menu]');
  const recentRoot = document.querySelector('[data-recent-root]');

  if (recentToggle && recentMenu && recentRoot) {
    recentToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasHidden = recentMenu.classList.contains('hidden');
      if (wasHidden) {
        renderRecents();
        recentMenu.classList.remove('hidden');
      } else {
        recentMenu.classList.add('hidden');
      }
    });
    document.addEventListener('click', (e) => {
      if (!recentRoot.contains(e.target)) {
        recentMenu.classList.add('hidden');
      }
    });
  }

  recordCurrentPage();
})();
    ",
  )
}

fn admin_acls_from(current_admin: Option(UserLookupResult)) -> List(String) {
  case current_admin {
    option.Some(admin) -> admin.acls
    option.None -> []
  }
}

fn command_palette(ctx: Context, admin_acls: List(String)) -> element.Element(a) {
  // Build the command list from the navigation. Each entry is a JSON-encoded
  // payload that the JS palette consumes verbatim — no async fetch needed.
  let commands =
    navigation.accessible_sections(admin_acls)
    |> list.flat_map(fn(section) {
      list.map(section.items, fn(item) {
        "{\"title\":\""
        <> escape_json(item.title)
        <> "\",\"section\":\""
        <> escape_json(section.title)
        <> "\",\"path\":\""
        <> escape_json(ctx.base_path <> item.path)
        <> "\"}"
      })
    })
  let commands_json = "[" <> string_join(commands, ",") <> "]"

  h.div([], [
    h.div(
      [
        a.attribute("data-command-palette", ""),
        a.class(
          "fixed inset-0 z-50 hidden items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm",
        ),
      ],
      [
        h.div(
          [
            a.attribute("data-command-palette-panel", ""),
            a.class(
              "w-full max-w-xl mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden",
            ),
          ],
          [
            h.div([a.class("border-b border-zinc-800")], [
              h.input([
                a.type_("text"),
                a.attribute("data-command-palette-input", ""),
                a.attribute("placeholder", "Перейти к странице…"),
                a.attribute("autocomplete", "off"),
                a.attribute("spellcheck", "false"),
                a.class(
                  "w-full bg-transparent px-5 py-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none",
                ),
              ]),
            ]),
            h.div(
              [
                a.attribute("data-command-palette-list", ""),
                a.class("max-h-80 overflow-y-auto py-1"),
              ],
              [],
            ),
            h.div(
              [
                a.class(
                  "px-4 py-2 border-t border-zinc-800 text-[11px] text-zinc-500 flex items-center justify-between",
                ),
              ],
              [
                h.span([], [element.text("↵ открыть · Esc закрыть")]),
                h.span([], [element.text("⌘K / Ctrl+K")]),
              ],
            ),
          ],
        ),
      ],
    ),
    h.script(
      [
        a.attribute("type", "application/json"),
        a.attribute("data-command-palette-data", ""),
      ],
      commands_json,
    ),
    h.script([a.attribute("defer", "defer")], command_palette_js()),
  ])
}

fn command_palette_js() -> String {
  "
(function() {
  const overlay = document.querySelector('[data-command-palette]');
  const panel = document.querySelector('[data-command-palette-panel]');
  const input = document.querySelector('[data-command-palette-input]');
  const list = document.querySelector('[data-command-palette-list]');
  const dataNode = document.querySelector('[data-command-palette-data]');
  if (!overlay || !panel || !input || !list || !dataNode) return;

  let commands = [];
  try {
    commands = JSON.parse(dataNode.textContent || '[]');
  } catch (e) {
    return;
  }

  let activeIndex = 0;
  let filtered = commands.slice();

  const escapeHtml = (s) => s.replace(/[&<>\"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\\'':'&#39;'}[c]));

  const render = () => {
    if (filtered.length === 0) {
      list.innerHTML = '<div class=\"px-4 py-6 text-sm text-zinc-500 text-center\">Ничего не найдено</div>';
      return;
    }
    list.innerHTML = filtered.map((cmd, idx) => {
      const cls = idx === activeIndex
        ? 'bg-indigo-500/20 text-indigo-200'
        : 'text-zinc-200 hover:bg-zinc-900';
      return '<button type=\"button\" data-cmd-idx=\"' + idx + '\" class=\"w-full text-left flex items-center justify-between gap-3 px-4 py-2.5 text-sm ' + cls + '\">' +
        '<span>' + escapeHtml(cmd.title) + '</span>' +
        '<span class=\"text-[11px] text-zinc-500\">' + escapeHtml(cmd.section) + '</span>' +
      '</button>';
    }).join('');
  };

  const filter = (q) => {
    const norm = q.trim().toLowerCase();
    if (!norm) {
      filtered = commands.slice();
    } else {
      filtered = commands.filter((cmd) => {
        return cmd.title.toLowerCase().includes(norm)
          || cmd.section.toLowerCase().includes(norm);
      });
    }
    activeIndex = 0;
    render();
  };

  const open = () => {
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    document.body.classList.add('overflow-hidden');
    input.value = '';
    filter('');
    setTimeout(() => input.focus(), 0);
  };

  const close = () => {
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
    document.body.classList.remove('overflow-hidden');
  };

  const navigateTo = (idx) => {
    const cmd = filtered[idx];
    if (cmd && cmd.path) {
      window.location.href = cmd.path;
    }
  };

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (overlay.classList.contains('hidden')) open(); else close();
    } else if (!overlay.classList.contains('hidden')) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filtered.length > 0) {
          activeIndex = (activeIndex + 1) % filtered.length;
          render();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filtered.length > 0) {
          activeIndex = (activeIndex - 1 + filtered.length) % filtered.length;
          render();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        navigateTo(activeIndex);
      }
    }
  });

  input.addEventListener('input', (e) => filter(e.target.value));

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cmd-idx]');
    if (btn) {
      const idx = parseInt(btn.getAttribute('data-cmd-idx'), 10);
      if (!isNaN(idx)) navigateTo(idx);
    }
  });
})();
  "
}

fn escape_json(s: String) -> String {
  s
  |> string.replace("\\", "\\\\")
  |> string.replace("\"", "\\\"")
}

fn string_join(items: List(String), sep: String) -> String {
  case items {
    [] -> ""
    [first, ..rest] ->
      list.fold(rest, first, fn(acc, item) { acc <> sep <> item })
  }
}
