#include "invite_upstream_client.hpp"

#include <cstdlib>
#include <iomanip>
#include <sstream>
#include <stdexcept>

#include <userver/clients/http/client.hpp>
#include <userver/logging/log.hpp>
#include <userver/yaml_config/merge_schemas.hpp>

namespace astral::userver_invites {

namespace {

bool IsUnreserved(unsigned char c) {
    return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
           (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' ||
           c == '~';
}

}  // namespace

InviteUpstreamClient::InviteUpstreamClient(
    const userver::components::ComponentConfig& config,
    const userver::components::ComponentContext& context)
    : LoggableComponentBase(config, context),
      http_client_(context.FindComponent<userver::components::HttpClient>().GetHttpClient()),
      endpoint_(TrimTrailingSlash(
          EnvOr("ASTRAL_API_INTERNAL_ENDPOINT", "http://api:8080/v1"))),
      timeout_(std::chrono::milliseconds{config["timeout_ms"].As<int>(800)}),
      success_cache_ttl_(
          std::chrono::milliseconds{config["success_cache_ttl_ms"].As<int>(2000)}),
      negative_cache_ttl_(
          std::chrono::milliseconds{config["negative_cache_ttl_ms"].As<int>(5000)}),
      cache_(success_cache_ttl_) {}

std::string InviteUpstreamClient::EnvOr(std::string_view name, std::string fallback) {
    const std::string key{name};
    const char* value = std::getenv(key.c_str());
    if (value == nullptr || *value == '\0') return fallback;
    return std::string{value};
}

std::string InviteUpstreamClient::TrimTrailingSlash(std::string value) {
    while (value.size() > 1 && value.back() == '/') {
        value.pop_back();
    }
    return value;
}

std::string InviteUpstreamClient::EncodePathSegment(std::string_view value) {
    std::ostringstream out;
    for (unsigned char c : value) {
        if (IsUnreserved(c)) {
            out << c;
        } else {
            out << '%' << std::uppercase << std::hex << std::setw(2) << std::setfill('0')
                << static_cast<int>(c) << std::nouppercase << std::dec;
        }
    }
    return out.str();
}

UpstreamResponse InviteUpstreamClient::GetInvite(std::string_view invite_code) const {
    const std::string cache_key{invite_code};
    if (auto cached = cache_.Get(cache_key); cached.has_value()) {
        return UpstreamResponse{cached->status, cached->body, true};
    }

    const auto url = endpoint_ + "/invites/" + EncodePathSegment(invite_code);
    const auto resp = http_client_.CreateRequest()
                          .get(url)
                          .timeout(timeout_)
                          .retry(1)
                          .headers({{"User-Agent", "Astral-userver-invites/1.0"}})
                          .perform();

    const auto status = resp->status_code();
    const auto body = resp->body();
    if (status == 200) {
        cache_.Put(cache_key, CachedResponse{status, body}, success_cache_ttl_);
    } else if (status == 404) {
        cache_.Put(cache_key, CachedResponse{status, body}, negative_cache_ttl_);
    }

    if (status >= 500) {
        LOG_WARNING() << "invite upstream returned HTTP " << status
                      << " for " << invite_code;
    }

    return UpstreamResponse{status, body, false};
}

userver::yaml_config::Schema InviteUpstreamClient::GetStaticConfigSchema() {
    return userver::yaml_config::MergeSchemas<userver::components::LoggableComponentBase>(R"(
type: object
description: Node API upstream client for invite fast path
additionalProperties: false
properties:
    timeout_ms:
        type: integer
        description: upstream timeout in milliseconds
        defaultDescription: "800"
    success_cache_ttl_ms:
        type: integer
        description: successful response cache TTL in milliseconds
        defaultDescription: "2000"
    negative_cache_ttl_ms:
        type: integer
        description: 404 response cache TTL in milliseconds
        defaultDescription: "5000"
)");
}

}  // namespace astral::userver_invites
