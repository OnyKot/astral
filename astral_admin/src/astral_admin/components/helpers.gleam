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

import lustre/attribute as a
import lustre/element
import lustre/element/html as h

pub fn compact_info(label: String, value: String) {
  h.div([], [
    h.span([a.class("text-zinc-500")], [element.text(label <> ": ")]),
    h.span([a.class("text-zinc-100")], [element.text(value)]),
  ])
}

pub fn compact_info_mono(label: String, value: String) {
  h.div([], [
    h.span([a.class("text-zinc-500")], [element.text(label <> ": ")]),
    h.span([a.class("text-zinc-100 font-mono")], [element.text(value)]),
  ])
}

pub fn compact_info_with_element(label: String, value: element.Element(a)) {
  h.div([], [
    h.span([a.class("text-zinc-500")], [element.text(label <> ": ")]),
    h.span([a.class("text-zinc-100")], [value]),
  ])
}

pub fn form_field(
  label: String,
  name: String,
  type_: String,
  placeholder: String,
  required: Bool,
  help: String,
) {
  h.div([a.class("space-y-1")], [
    h.label([a.class("text-sm text-zinc-300")], [
      element.text(label),
    ]),
    h.input([
      a.type_(type_),
      a.name(name),
      a.placeholder(placeholder),
      a.required(required),
      a.class(
        "w-full px-3 py-2.5 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
      ),
      case type_ == "number" {
        True -> a.attribute("step", "any")
        False -> a.class("")
      },
    ]),
    h.p([a.class("text-xs text-zinc-500")], [element.text(help)]),
  ])
}

pub fn form_field_with_value(
  label: String,
  name: String,
  type_: String,
  value: String,
  required: Bool,
  help: String,
) {
  h.div([a.class("space-y-1")], [
    h.label([a.class("text-sm text-zinc-300")], [
      element.text(label),
    ]),
    h.input([
      a.type_(type_),
      a.name(name),
      a.value(value),
      a.required(required),
      a.class(
        "w-full px-3 py-2.5 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
      ),
      case type_ == "number" {
        True -> a.attribute("step", "any")
        False -> a.class("")
      },
    ]),
    h.p([a.class("text-xs text-zinc-500")], [element.text(help)]),
  ])
}

pub fn info_item(label: String, value: String) {
  h.div([], [
    h.p([a.class("text-xs text-zinc-500")], [element.text(label)]),
    h.p([a.class("text-sm text-zinc-100")], [element.text(value)]),
  ])
}
