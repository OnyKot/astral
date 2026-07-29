// Astral SDK — Contracts: Invite data structures.
//
// Type-safe JSON schemas for API contracts.
// Compatible with nlohmann/json for serialization.
//
// Usage:
//   #include <astral/sdk/contracts/invite.hpp>
//
//   auto invite = contracts::Invite{
//       .code = "abc123",
//       .guild_id = "guild456",
//       .channel_id = "channel789",
//       .inviter_id = "user111",
//       .max_uses = 10,
//       .uses = 5,
//       .expires_at = std::nullopt,  // Never expires
//       .temporary = false
//   };
//
//   // Serialize to JSON
//   auto json = contracts::InviteResponse::ToJson(invite);
//
//   // Parse from JSON
//   auto parsed = nlohmann::json::parse(json);
//   auto invite = contracts::InviteResponse::FromJson(parsed);

#ifndef ASTRAL_SDK_CONTRACTS_INVITE_HPP
#define ASTRAL_SDK_CONTRACTS_INVITE_HPP

#include <nlohmann/json.hpp>

#include <chrono>
#include <optional>
#include <string>
#include <vector>

namespace astral::sdk::contracts {

// ============================================================================
// Invite entity (database model)
// ============================================================================

struct Invite {
    std::string code;
    std::string guild_id;
    std::string channel_id;
    std::string inviter_id;
    int max_uses;
    int uses;
    std::optional<std::chrono::system_clock::time_point> expires_at;
    bool temporary;
};

// ============================================================================
// API Response types
// ============================================================================

struct InviteResponse {
    std::string code;
    std::string guild_id;
    std::string channel_id;
    std::string inviter_id;
    std::string inviter;
    int max_uses;
    int uses;
    std::optional<std::string> expires_at;
    bool temporary;

    // Create from Invite entity
    static InviteResponse FromEntity(const Invite& invite);

    // Serialize to JSON
    nlohmann::json ToJson() const;

    // Parse from JSON
    static InviteResponse FromJson(const nlohmann::json& json);

    // Create error response
    static nlohmann::json ErrorResponse(int code, const std::string& message);
};

// ============================================================================
// Extended invite with guild info
// ============================================================================

struct InviteWithGuild {
    InviteResponse invite;
    std::string guild_name;
    std::string guild_icon;
    std::string guild_banner;
    std::string guild_description;
};

// ============================================================================
// Implementation
// ============================================================================

inline InviteResponse InviteResponse::FromEntity(const Invite& invite) {
    InviteResponse response;
    response.code = invite.code;
    response.guild_id = invite.guild_id;
    response.channel_id = invite.channel_id;
    response.inviter_id = invite.inviter_id;
    response.max_uses = invite.max_uses;
    response.uses = invite.uses;
    response.temporary = invite.temporary;

    // Format expires_at as ISO8601 string
    if (invite.expires_at) {
        auto time_t = std::chrono::system_clock::to_time_t(*invite.expires_at);
        char buf[64];
        std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S.000Z", std::gmtime(&time_t));
        response.expires_at = buf;
    }

    return response;
}

inline nlohmann::json InviteResponse::ToJson() const {
    nlohmann::json json;
    json["code"] = code;
    json["guild_id"] = guild_id;
    json["channel_id"] = channel_id;
    json["inviter_id"] = inviter_id;
    json["inviter"] = inviter;  // Populated from user service
    json["max_uses"] = max_uses;
    json["uses"] = uses;
    if (expires_at) json["expires_at"] = *expires_at;
    json["temporary"] = temporary;

    // Always include these fields for compatibility
    json["type"] = 0;  // 0 = GUILD
    json["approximate_presence_count"] = nullptr;
    json["approximate_member_count"] = nullptr;

    return json;
}

inline InviteResponse InviteResponse::FromJson(const nlohmann::json& json) {
    InviteResponse response;

    response.code = json.value("code", "");
    response.guild_id = json.value("guild_id", "");
    response.channel_id = json.value("channel_id", "");
    response.inviter_id = json.value("inviter_id", "");
    response.inviter = json.value("inviter", "");
    response.max_uses = json.value("max_uses", 0);
    response.uses = json.value("uses", 0);
    response.temporary = json.value("temporary", false);

    if (json.contains("expires_at") && !json["expires_at"].is_null()) {
        response.expires_at = json["expires_at"].get<std::string>();
    }

    return response;
}

inline nlohmann::json InviteResponse::ErrorResponse(int code, const std::string& message) {
    nlohmann::json json;
    json["code"] = code;
    json["message"] = message;
    return json;
}

// ============================================================================
// NLOHMANN_JSON Adapters (optional, for direct serialization)
// ============================================================================

// Enable ADL-based serialization for Invite
// Note: expires_at serialization requires custom adapter

}  // namespace astral::sdk::contracts

// Custom nlohmann_json adapter for std::optional<std::chrono::system_clock::time_point>
namespace nlohmann {

template<>
struct adl_serializer<std::chrono::system_clock::time_point> {
    static void to_json(json& j, const std::chrono::system_clock::time_point& tp) {
        auto time_t = std::chrono::system_clock::to_time_t(tp);
        char buf[64];
        std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", std::gmtime(&time_t));
        j = std::string(buf);
    }

    static void from_json(const json& j, std::chrono::system_clock::time_point& tp) {
        // Parse ISO8601 timestamp
        // For simplicity, return epoch - actual implementation would parse the string
        tp = std::chrono::system_clock::from_time_t(0);
    }
};

}  // namespace nlohmann

#endif  // ASTRAL_SDK_CONTRACTS_INVITE_HPP