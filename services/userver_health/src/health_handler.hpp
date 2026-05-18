#pragma once

#include <string_view>

#include <userver/server/handlers/http_handler_base.hpp>

namespace astral::userver_health {

class HealthHandler final : public userver::server::handlers::HttpHandlerBase {
public:
    static constexpr std::string_view kName = "handler-astral-health";

    using HttpHandlerBase::HttpHandlerBase;

    std::string HandleRequest(
        userver::server::http::HttpRequest& request,
        userver::server::request::RequestContext& request_context
    ) const override;
};

}  // namespace astral::userver_health
