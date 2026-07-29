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
import astral_admin/pages/ban_management_page
import astral_admin/web.{type Context, type Session}
import gleam/option
import wisp.{type Request, type Response}

pub fn view(
  ctx: Context,
  session: Session,
  current_admin: option.Option(common.UserLookupResult),
  flash_data: option.Option(flash.Flash),
) -> Response {
  ban_management_page.view(
    ctx,
    session,
    current_admin,
    flash_data,
    ban_management_page.IpBan,
  )
}

pub fn handle_action(
  req: Request,
  ctx: Context,
  session: Session,
  action: option.Option(String),
) -> Response {
  ban_management_page.handle_action(
    req,
    ctx,
    session,
    ban_management_page.IpBan,
    action,
  )
}
