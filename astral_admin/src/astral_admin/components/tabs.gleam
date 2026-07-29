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

import astral_admin/web.{type Context, href}
import gleam/list
import lustre/attribute as a
import lustre/element
import lustre/element/html as h

pub type Tab {
  Tab(label: String, path: String, active: Bool)
}

pub fn render_tabs(ctx: Context, tabs: List(Tab)) -> element.Element(a) {
  h.div([a.class("border-b border-zinc-200 mb-6")], [
    h.nav(
      [a.class("flex gap-6 overflow-x-auto no-scrollbar -mb-px px-1")],
      list.map(tabs, fn(tab) { render_tab(ctx, tab) }),
    ),
  ])
}

fn render_tab(ctx: Context, tab: Tab) -> element.Element(a) {
  let class_active = case tab.active {
    True ->
      "border-b-2 border-indigo-500 text-zinc-900 font-medium text-sm pb-3 whitespace-nowrap"
    False ->
      "border-b-2 border-transparent text-zinc-500 hover:text-zinc-900 hover:border-zinc-300 text-sm pb-3 transition-colors whitespace-nowrap"
  }

  h.a([href(ctx, tab.path), a.class(class_active)], [element.text(tab.label)])
}
