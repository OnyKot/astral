#include <instance_handler.hpp>

#include <userver/formats/json/serialize.hpp>
#include <userver/formats/json/value_builder.hpp>
#include <userver/http/content_type.hpp>
#include <userver/server/http/http_request.hpp>
#include <userver/server/http/http_response.hpp>
#include <userver/server/request/request_context.hpp>

namespace astral::userver_instance {

namespace {

void SetOpt(userver::formats::json::ValueBuilder& node,
            const std::string& key,
            const std::optional<std::string>& value) {
    if (value.has_value()) {
        node[key] = *value;
    } else {
        node[key] = nullptr;
    }
}

std::string BuildResponseBody(const InstanceConfig& c) {
    userver::formats::json::ValueBuilder root;

    root["api_code_version"] = c.api_code_version;

    // endpoints {...}
    {
        userver::formats::json::ValueBuilder endpoints;
        endpoints["api"]        = c.api_client;
        endpoints["api_client"] = c.api_client;
        endpoints["api_public"] = c.api_public;
        endpoints["gateway"]    = c.gateway;
        endpoints["media"]      = c.media;
        endpoints["cdn"]        = c.cdn;
        endpoints["marketing"]  = c.marketing;
        endpoints["admin"]      = c.admin;
        endpoints["invite"]     = c.invite;
        endpoints["gift"]       = c.gift;
        endpoints["webapp"]     = c.web_app;
        root["endpoints"] = endpoints.ExtractValue();
    }

    // captcha {...}
    {
        userver::formats::json::ValueBuilder captcha;
        captcha["provider"] = c.captcha_provider;
        SetOpt(captcha, "hcaptcha_site_key", c.hcaptcha_site_key);
        SetOpt(captcha, "turnstile_site_key", c.turnstile_site_key);
        root["captcha"] = captcha.ExtractValue();
    }

    // features {...}
    {
        userver::formats::json::ValueBuilder features;
        features["sms_mfa_enabled"] = c.sms_mfa_enabled;
        features["voice_enabled"]   = c.voice_enabled;
        features["stripe_enabled"]  = c.stripe_enabled;
        features["self_hosted"]     = c.self_hosted;
        root["features"] = features.ExtractValue();
    }

    // push {...}
    {
        userver::formats::json::ValueBuilder push;
        SetOpt(push, "public_vapid_key", c.public_vapid_key);
        root["push"] = push.ExtractValue();
    }

    // music {...}
    {
        userver::formats::json::ValueBuilder music;
        SetOpt(music, "spotify_client_id", c.spotify_client_id);
        root["music"] = music.ExtractValue();
    }

    return userver::formats::json::ToString(root.ExtractValue());
}

}  // namespace

InstanceHandler::InstanceHandler(const userver::components::ComponentConfig& config,
                                 const userver::components::ComponentContext& context)
    : HttpHandlerBase(config, context),
      config_(InstanceConfig::LoadFromEnv()),
      cached_body_(BuildResponseBody(config_)) {}

std::string InstanceHandler::HandleRequest(
    userver::server::http::HttpRequest& request,
    userver::server::request::RequestContext&
) const {
    auto& response = request.GetHttpResponse();
    response.SetContentType(userver::http::content_type::kApplicationJson);
    // Match Node: `ctx.header('Access-Control-Allow-Origin', '*')`.
    response.SetHeader(std::string_view{"Access-Control-Allow-Origin"}, "*");

    // The payload is immutable — precomputed once in the ctor.
    return cached_body_;
}

}  // namespace astral::userver_instance
