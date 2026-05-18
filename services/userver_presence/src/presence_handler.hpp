// GET /guilds/:guild_id/counts  →  {"member_count":N,"presence_count":M}
//
// New C++-only endpoint (not mirrored in Node, but the underlying gateway RPC
// IS what Node calls to fill the same data into /invites and /status/summary).
// Uses an in-process TTL cache to absorb burst traffic without hammering the
// Erlang gateway.

#pragma once

#include <chrono>
#include <string>
#include <string_view>

#include <astral/common/ttl_cache.hpp>
#include <gateway_rpc_client.hpp>

#include <userver/components/component_context.hpp>
#include <userver/server/handlers/http_handler_base.hpp>

namespace astral::userver_presence {

struct CachedCounts final {
    GuildCounts counts;
    bool not_found{false};  // negative caching to keep upstream traffic bounded
};

class PresenceHandler final : public userver::server::handlers::HttpHandlerBase {
public:
    static constexpr std::string_view kName = "handler-astral-presence";

    PresenceHandler(const userver::components::ComponentConfig& config,
                    const userver::components::ComponentContext& context);

    std::string HandleRequest(
        userver::server::http::HttpRequest& request,
        userver::server::request::RequestContext& request_context
    ) const override;

private:
    const GatewayRpcClient& rpc_;
    mutable astral::common::TtlCache<CachedCounts> cache_;
};

}  // namespace astral::userver_presence
