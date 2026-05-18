// Copyright (C) 2026 Astral Contributors – AGPL-3.0-or-later
#pragma once

#include <userver/server/handlers/http_handler_base.hpp>
#include "tenor_client.hpp"

namespace astral::tenor {

/// Handles GET /tenor/search, /tenor/featured, /tenor/trending-gifs, /tenor/suggest
/// Dispatches to TenorClient with caching.
class TenorProxyHandler final
    : public userver::server::handlers::HttpHandlerBase {
 public:
  static constexpr std::string_view kName = "tenor-proxy-handler";

  TenorProxyHandler(const userver::components::ComponentConfig& config,
                    const userver::components::ComponentContext& ctx);

  std::string HandleRequestThrow(
      const userver::server::http::HttpRequest& request,
      userver::server::request::RequestContext& context) const override;

  static userver::yaml_config::Schema GetStaticConfigSchema();

 private:
  const TenorClient& tenor_client_;
};

}  // namespace astral::tenor
