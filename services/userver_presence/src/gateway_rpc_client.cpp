#include <gateway_rpc_client.hpp>

#include <cstdlib>
#include <stdexcept>
#include <string>

#include <userver/clients/http/client.hpp>
#include <userver/clients/http/component.hpp>
#include <userver/components/component_config.hpp>
#include <userver/formats/json/serialize.hpp>
#include <userver/formats/json/value_builder.hpp>
#include <userver/yaml_config/merge_schemas.hpp>

namespace astral::userver_presence {

namespace {

std::string EnvOr(const char* name, const char* fallback) {
    const char* v = std::getenv(name);
    return (v == nullptr || *v == '\0') ? std::string{fallback} : std::string{v};
}

}  // namespace

GatewayRpcClient::GatewayRpcClient(const userver::components::ComponentConfig& config,
                                   const userver::components::ComponentContext& context)
    : ComponentBase(config, context),
      http_client_(
          context.FindComponent<userver::components::HttpClient>().GetHttpClient()) {
    // Endpoint + bearer secret read from env, exactly like Node's Config.gateway.
    const auto host   = EnvOr("ASTRAL_GATEWAY_RPC_HOST", "gateway");
    const auto port   = EnvOr("ASTRAL_GATEWAY_RPC_PORT", "8081");
    const auto secret = EnvOr("GATEWAY_RPC_SECRET", "");
    endpoint_      = "http://" + host + ":" + port + "/_rpc";
    bearer_header_ = "Bearer " + secret;
    timeout_       = std::chrono::milliseconds{config["timeout_ms"].As<int>(500)};
}

userver::yaml_config::Schema GatewayRpcClient::GetStaticConfigSchema() {
    return userver::yaml_config::MergeSchemas<userver::components::ComponentBase>(R"(
type: object
description: gateway-rpc-client component
additionalProperties: false
properties:
    timeout_ms:
        type: integer
        description: per-call timeout in milliseconds
        defaultDescription: "500"
)");
}

userver::formats::json::Value GatewayRpcClient::Call(
    const std::string& method,
    const userver::formats::json::Value& params) const {
    userver::formats::json::ValueBuilder body;
    body["method"] = method;
    body["params"] = params;
    const auto body_str = userver::formats::json::ToString(body.ExtractValue());

    const auto resp = http_client_.CreateRequest()
                          .post(endpoint_, body_str)
                          .timeout(timeout_)
                          .retry(2)
                          .headers({
                              {"Content-Type", "application/json"},
                              {"Authorization", bearer_header_},
                          })
                          .perform();

    const auto status = resp->status_code();
    const auto body_text = resp->body();
    // Try to parse JSON regardless of status — the gateway puts an `error`
    // field in non-2xx bodies that we want to map to specific exceptions.
    userver::formats::json::Value json;
    if (!body_text.empty()) {
        try {
            json = userver::formats::json::FromString(body_text);
        } catch (const std::exception&) {
            // fall through — we'll throw a generic runtime_error below
        }
    }

    if (status == 400 || status == 404) {
        // Gateway uses 400 for "guild not found" specifically. Promote both
        // to a typed exception that the handler turns into a clean 404.
        std::string msg = "not found";
        if (json.HasMember("error")) {
            msg = userver::formats::json::ToString(json["error"]);
        }
        throw GatewayNotFound("gateway: " + msg);
    }
    if (!resp->IsOk()) {
        throw std::runtime_error("gateway rpc: HTTP " + std::to_string(status));
    }
    if (body_text.empty()) {
        throw std::runtime_error("gateway rpc: empty body");
    }
    if (json.HasMember("error")) {
        throw std::runtime_error(
            "gateway rpc error: " + userver::formats::json::ToString(json["error"]));
    }
    if (!json.HasMember("result")) {
        throw std::runtime_error("gateway rpc: missing result");
    }
    return json["result"];
}

namespace {

// Helper: pull an integer out of a userver JSON Value. Works around a
// template-dispatch quirk where `.As<int64_t>()` called directly on
// operator[] failed to parse on the builder image's gcc. Using an explicit
// Value parameter keeps the name lookup non-dependent.
std::int64_t JsonAsI64(const userver::formats::json::Value& v, std::int64_t fallback) {
    try {
        return v.As<std::int64_t>();
    } catch (const std::exception&) {
        return fallback;
    }
}

}  // namespace

GuildCounts GatewayRpcClient::GetGuildCounts(const std::string& guild_id) const {
    userver::formats::json::ValueBuilder params;
    params["guild_id"] = guild_id;

    const userver::formats::json::Value result =
        Call("guild.get_counts", params.ExtractValue());

    GuildCounts out;
    out.member_count   = JsonAsI64(result["member_count"], 0);
    out.presence_count = JsonAsI64(result["presence_count"], 0);
    return out;
}

}  // namespace astral::userver_presence
