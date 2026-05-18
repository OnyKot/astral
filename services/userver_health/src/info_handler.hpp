#pragma once

#include <string_view>

#include <userver/server/handlers/http_handler_base.hpp>

namespace astral::userver_health {

// GET /info — exposes version/build/commit/uptime as JSON.
// Intended for ops + any other service that wants to discover build metadata
// of a running instance without relying on logs.
class InfoHandler final : public userver::server::handlers::HttpHandlerBase {
public:
    static constexpr std::string_view kName = "handler-astral-info";

    using HttpHandlerBase::HttpHandlerBase;

    std::string HandleRequest(
        userver::server::http::HttpRequest& request,
        userver::server::request::RequestContext& request_context
    ) const override;
};

}  // namespace astral::userver_health
