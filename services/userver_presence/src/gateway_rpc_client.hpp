// JSON-RPC client for Astral Gateway (Erlang/Cowboy at :8081/_rpc).
//
// Mirrors astral_api/src/infrastructure/GatewayRpcClient.ts:
//   POST /_rpc
//   Authorization: Bearer <GATEWAY_RPC_SECRET>
//   { "method": "...", "params": {...} }
// Response: { "result": {...} } or { "error": "..." }.

#pragma once

#include <optional>
#include <stdexcept>
#include <string>

#include <userver/clients/http/client.hpp>
#include <userver/components/component_base.hpp>
#include <userver/components/component_config.hpp>
#include <userver/components/component_context.hpp>
#include <userver/formats/json/value.hpp>

namespace astral::userver_presence {

struct GuildCounts final {
    std::int64_t member_count{0};
    std::int64_t presence_count{0};
};

// Thrown when the upstream itself reports the resource is missing
// (gateway returns HTTP 400 with `{"error":"Guild not found"}` for
// unknown guild_ids — Erlang gateway specific). We translate this to a
// 404 on our side instead of a 502.
class GatewayNotFound final : public std::runtime_error {
public:
    using std::runtime_error::runtime_error;
};

class GatewayRpcClient final : public userver::components::ComponentBase {
public:
    static constexpr std::string_view kName = "gateway-rpc-client";

    GatewayRpcClient(const userver::components::ComponentConfig& config,
                     const userver::components::ComponentContext& context);

    // Throws std::runtime_error on transport / protocol errors.
    GuildCounts GetGuildCounts(const std::string& guild_id) const;

    static userver::yaml_config::Schema GetStaticConfigSchema();

private:
    userver::formats::json::Value Call(
        const std::string& method,
        const userver::formats::json::Value& params) const;

    userver::clients::http::Client& http_client_;
    std::string endpoint_;       // e.g. http://gateway:8081/_rpc
    std::string bearer_header_;  // "Bearer <secret>" — built once in ctor
    std::chrono::milliseconds timeout_{500};
};

}  // namespace astral::userver_presence
