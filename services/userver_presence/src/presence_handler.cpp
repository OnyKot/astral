#include <presence_handler.hpp>

#include <algorithm>
#include <cctype>
#include <string>

#include <userver/formats/json/serialize.hpp>
#include <userver/formats/json/value_builder.hpp>
#include <userver/http/content_type.hpp>
#include <userver/logging/log.hpp>
#include <userver/server/http/http_request.hpp>
#include <userver/server/http/http_response.hpp>
#include <userver/server/http/http_status.hpp>
#include <userver/server/request/request_context.hpp>

namespace astral::userver_presence {

namespace {

// Guild ids are snowflakes — decimal digits only, 64-bit. Validate aggressively
// so we don't forward arbitrary client input to the gateway.
bool IsValidGuildId(std::string_view s) {
    if (s.empty() || s.size() > 20) return false;
    return std::all_of(s.begin(), s.end(),
                       [](unsigned char c) { return std::isdigit(c) != 0; });
}

constexpr std::chrono::seconds kCacheTtl{3};

}  // namespace

PresenceHandler::PresenceHandler(const userver::components::ComponentConfig& config,
                                 const userver::components::ComponentContext& context)
    : HttpHandlerBase(config, context),
      rpc_(context.FindComponent<GatewayRpcClient>()),
      cache_(kCacheTtl) {}

std::string PresenceHandler::HandleRequest(
    userver::server::http::HttpRequest& request,
    userver::server::request::RequestContext&
) const {
    auto& response = request.GetHttpResponse();
    response.SetContentType(userver::http::content_type::kApplicationJson);
    response.SetHeader(std::string_view{"Access-Control-Allow-Origin"}, "*");
    // Advise clients/CDNs we refresh every few seconds.
    response.SetHeader(std::string_view{"Cache-Control"}, "public, max-age=3");

    // The router binds the path param as :guild_id — static_config below.
    const auto guild_id = request.GetPathArg("guild_id");
    if (!IsValidGuildId(guild_id)) {
        response.SetStatus(userver::server::http::HttpStatus::kBadRequest);
        userver::formats::json::ValueBuilder err;
        err["error"] = "invalid guild_id";
        return userver::formats::json::ToString(err.ExtractValue());
    }

    GuildCounts counts;
    bool not_found = false;
    if (auto cached = cache_.Get(guild_id); cached.has_value()) {
        counts = cached->counts;
        not_found = cached->not_found;
    } else {
        // Do not forward uncached guild ids to the privileged gateway RPC.
        // This endpoint now serves only cache hits to avoid attacker-controlled
        // guild ids reaching atom-based process naming in the gateway.
        not_found = true;
    }

    if (not_found) {
        response.SetStatus(userver::server::http::HttpStatus::kNotFound);
        userver::formats::json::ValueBuilder err;
        err["error"] = "guild not found";
        return userver::formats::json::ToString(err.ExtractValue());
    }

    userver::formats::json::ValueBuilder body;
    body["guild_id"]       = guild_id;
    body["member_count"]   = counts.member_count;
    body["presence_count"] = counts.presence_count;
    return userver::formats::json::ToString(body.ExtractValue());
}

}  // namespace astral::userver_presence
