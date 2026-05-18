#pragma once

#include <chrono>
#include <string>
#include <string_view>

#include <astral/common/ttl_cache.hpp>

#include <userver/clients/http/component.hpp>
#include <userver/components/component_config.hpp>
#include <userver/components/component_context.hpp>
#include <userver/components/loggable_component_base.hpp>

namespace astral::userver_invites {

struct UpstreamResponse final {
    int status{502};
    std::string body;
    bool cache_hit{false};
};

class InviteUpstreamClient final : public userver::components::LoggableComponentBase {
public:
    static constexpr std::string_view kName = "invite-upstream-client";

    InviteUpstreamClient(const userver::components::ComponentConfig& config,
                         const userver::components::ComponentContext& context);

    UpstreamResponse GetInvite(std::string_view invite_code) const;

    static userver::yaml_config::Schema GetStaticConfigSchema();

private:
    struct CachedResponse final {
        int status{200};
        std::string body;
    };

    static std::string EnvOr(std::string_view name, std::string fallback);
    static std::string TrimTrailingSlash(std::string value);
    static std::string EncodePathSegment(std::string_view value);

    userver::clients::http::Client& http_client_;
    std::string endpoint_;
    std::chrono::milliseconds timeout_;
    std::chrono::milliseconds success_cache_ttl_;
    std::chrono::milliseconds negative_cache_ttl_;
    mutable astral::common::TtlCache<CachedResponse> cache_;
};

}  // namespace astral::userver_invites
