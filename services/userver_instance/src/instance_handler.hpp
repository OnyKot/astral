#pragma once

#include <string_view>

#include <instance_config.hpp>

#include <userver/components/component_context.hpp>
#include <userver/server/handlers/http_handler_base.hpp>

namespace astral::userver_instance {

// GET /instance — 1-to-1 mirror of astral_api InstanceController.ts
// (the `/instance` route registered there).
//
// Response shape lives inline in the handler for now — once we have several
// services sharing it, move to services/common/contracts/.
class InstanceHandler final : public userver::server::handlers::HttpHandlerBase {
public:
    static constexpr std::string_view kName = "handler-astral-instance";

    InstanceHandler(const userver::components::ComponentConfig& config,
                    const userver::components::ComponentContext& context);

    std::string HandleRequest(
        userver::server::http::HttpRequest& request,
        userver::server::request::RequestContext& request_context
    ) const override;

private:
    InstanceConfig config_;
    std::string cached_body_;  // immutable after ctor — response never changes
};

}  // namespace astral::userver_instance
