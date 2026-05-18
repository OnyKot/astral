#pragma once

#include <string>

#include "invite_upstream_client.hpp"

#include <userver/components/component_config.hpp>
#include <userver/components/component_context.hpp>
#include <userver/server/handlers/http_handler_base.hpp>

namespace astral::userver_invites {

class InviteHandler final : public userver::server::handlers::HttpHandlerBase {
public:
    static constexpr std::string_view kName = "handler-astral-invites";

    InviteHandler(const userver::components::ComponentConfig& config,
                  const userver::components::ComponentContext& context);

    std::string HandleRequest(userver::server::http::HttpRequest& request,
                              userver::server::request::RequestContext& context) const override;

private:
    const InviteUpstreamClient& upstream_;
};

}  // namespace astral::userver_invites
