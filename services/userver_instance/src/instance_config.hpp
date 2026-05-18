#pragma once

#include <optional>
#include <string>

namespace astral::userver_instance {

// Snapshot of ENV values that form the /instance response. Populated once at
// startup — same lifecycle as Node's Config.endpoints / Config.captcha etc.
// No DB, no hot reload — matches the Node contract: a client bootstrap
// payload read from process env at startup.
struct InstanceConfig final {
    // endpoints
    std::string api_client;
    std::string api_public;
    std::string gateway;
    std::string media;
    std::string cdn;
    std::string marketing;
    std::string admin;
    std::string invite;
    std::string gift;
    std::string web_app;

    // captcha
    std::string captcha_provider;
    std::optional<std::string> hcaptcha_site_key;
    std::optional<std::string> turnstile_site_key;

    // features (booleans)
    bool sms_mfa_enabled{false};
    bool voice_enabled{false};
    bool stripe_enabled{false};
    bool self_hosted{false};

    // push
    std::optional<std::string> public_vapid_key;

    // music
    std::optional<std::string> spotify_client_id;

    // api_code_version — same constant as Node
    // (astral_api/src/constants/API.ts: API_CODE_VERSION = 1).
    int api_code_version{1};

    // Load from process env. Variable names mirror astral_api/src/Config.ts.
    static InstanceConfig LoadFromEnv();
};

}  // namespace astral::userver_instance
