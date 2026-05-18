#include <instance_config.hpp>

#include <algorithm>
#include <cstdlib>
#include <cstring>
#include <string>
#include <string_view>

namespace astral::userver_instance {

namespace {

// Small ENV helpers — userver has its own env helpers, but we intentionally
// stay on the C stdlib here so this snapshot stays trivial and testable.
std::string EnvOr(const char* name, std::string fallback = {}) {
    const char* value = std::getenv(name);
    if (value == nullptr || *value == '\0') {
        return fallback;
    }
    return std::string{value};
}

std::optional<std::string> EnvOpt(const char* name) {
    const char* value = std::getenv(name);
    if (value == nullptr || *value == '\0') {
        return std::nullopt;
    }
    return std::string{value};
}

bool EnvBool(const char* name) {
    const char* value = std::getenv(name);
    if (value == nullptr) return false;
    std::string v{value};
    std::transform(v.begin(), v.end(), v.begin(), [](unsigned char c) { return std::tolower(c); });
    return v == "1" || v == "true" || v == "yes" || v == "on";
}

// Join two path segments with a single '/'. Mirrors the Node helper
// `appendPath(base, path)` used for marketing/admin endpoints.
std::string AppendPath(std::string base, std::string_view suffix) {
    if (suffix.empty()) return base;
    if (!base.empty() && base.back() == '/') base.pop_back();
    if (!suffix.empty() && suffix.front() == '/') {
        base.append(suffix);
    } else {
        base.push_back('/');
        base.append(suffix);
    }
    return base;
}

// Normalize captcha provider string the same way Node does
// (default "none" when unset or unknown).
std::string NormalizeCaptchaProvider(std::string raw) {
    std::transform(raw.begin(), raw.end(), raw.begin(), [](unsigned char c) { return std::tolower(c); });
    if (raw == "hcaptcha" || raw == "turnstile") return raw;
    return "none";
}

}  // namespace

InstanceConfig InstanceConfig::LoadFromEnv() {
    InstanceConfig c;

    // endpoints (mirror astral_api/src/Config.ts: loadConfig() start)
    c.api_public = EnvOr("ASTRAL_API_PUBLIC_ENDPOINT");
    c.api_client = EnvOr("ASTRAL_API_CLIENT_ENDPOINT", c.api_public);
    c.web_app    = EnvOr("ASTRAL_APP_ENDPOINT");
    c.gateway    = EnvOr("ASTRAL_GATEWAY_ENDPOINT");
    c.media      = EnvOr("ASTRAL_MEDIA_ENDPOINT");
    c.cdn        = EnvOr("ASTRAL_CDN_ENDPOINT");
    c.marketing  = AppendPath(EnvOr("ASTRAL_MARKETING_ENDPOINT"), EnvOr("ASTRAL_PATH_MARKETING"));
    c.admin      = AppendPath(EnvOr("ASTRAL_ADMIN_ENDPOINT"), EnvOr("ASTRAL_PATH_ADMIN"));
    c.invite     = EnvOr("ASTRAL_INVITE_ENDPOINT");
    c.gift       = EnvOr("ASTRAL_GIFT_ENDPOINT");

    // captcha
    c.captcha_provider  = NormalizeCaptchaProvider(EnvOr("CAPTCHA_PRIMARY_PROVIDER"));
    c.hcaptcha_site_key = EnvOpt("HCAPTCHA_SITE_KEY");
    c.turnstile_site_key = EnvOpt("TURNSTILE_SITE_KEY");

    // features
    c.sms_mfa_enabled = EnvBool("SMS_ENABLED");
    c.voice_enabled   = EnvBool("VOICE_ENABLED");
    c.stripe_enabled  = EnvBool("STRIPE_ENABLED");
    c.self_hosted     = EnvBool("SELF_HOSTED");

    // push / music
    c.public_vapid_key   = EnvOpt("VAPID_PUBLIC_KEY");
    c.spotify_client_id  = EnvOpt("SPOTIFY_CLIENT_ID");

    return c;
}

}  // namespace astral::userver_instance
