#include "invite_handler.hpp"

#include <algorithm>
#include <cctype>
#include <string>

#include <userver/http/content_type.hpp>
#include <userver/logging/log.hpp>
#include <userver/server/http/http_request.hpp>
#include <userver/server/http/http_response.hpp>
#include <userver/server/http/http_status.hpp>

namespace astral::userver_invites {

namespace {

bool IsValidInviteCode(std::string_view value) {
    if (value.empty() || value.size() > 128) return false;
    return std::all_of(value.begin(), value.end(), [](unsigned char c) {
        return std::isalnum(c) != 0 || c == '-' || c == '_' || c == '.' || c == '~';
    });
}

userver::server::http::HttpStatus ToHttpStatus(int status) {
    using userver::server::http::HttpStatus;
    switch (status) {
        case 200:
            return HttpStatus::kOk;
        case 400:
            return HttpStatus::kBadRequest;
        case 401:
            return HttpStatus::kUnauthorized;
        case 403:
            return HttpStatus::kForbidden;
        case 404:
            return HttpStatus::kNotFound;
        case 429:
            return HttpStatus::kTooManyRequests;
        case 500:
            return HttpStatus::kInternalServerError;
        case 502:
            return HttpStatus::kBadGateway;
        case 503:
            return HttpStatus::kServiceUnavailable;
        case 504:
            return HttpStatus::kGatewayTimeout;
        default:
            if (status >= 200 && status < 300) return HttpStatus::kOk;
            if (status >= 400 && status < 500) return HttpStatus::kBadRequest;
            return HttpStatus::kBadGateway;
    }
}

}  // namespace

InviteHandler::InviteHandler(const userver::components::ComponentConfig& config,
                             const userver::components::ComponentContext& context)
    : HttpHandlerBase(config, context),
      upstream_(context.FindComponent<InviteUpstreamClient>()) {}

std::string InviteHandler::HandleRequest(
    userver::server::http::HttpRequest& request,
    userver::server::request::RequestContext&) const {
    auto& response = request.GetHttpResponse();
    response.SetContentType(userver::http::content_type::kApplicationJson);
    response.SetHeader(std::string_view{"Access-Control-Allow-Origin"}, "*");

    const auto invite_code = request.GetPathArg("invite_code");
    if (!IsValidInviteCode(invite_code)) {
        response.SetStatus(userver::server::http::HttpStatus::kBadRequest);
        response.SetHeader(std::string_view{"Cache-Control"}, "no-store");
        return R"({"code":"INPUT_VALIDATION_ERROR","message":"Invalid invite code"})";
    }

    try {
        const auto upstream = upstream_.GetInvite(invite_code);
        response.SetStatus(ToHttpStatus(upstream.status));
        if (upstream.status == 200) {
            response.SetHeader(std::string_view{"Cache-Control"}, "public, max-age=2");
        } else if (upstream.status == 404) {
            response.SetHeader(std::string_view{"Cache-Control"}, "public, max-age=5");
        } else {
            response.SetHeader(std::string_view{"Cache-Control"}, "no-store");
        }
        response.SetHeader(std::string_view{"X-Astral-Invite-Fast-Path"}, upstream.cache_hit ? "hit" : "miss");
        return upstream.body.empty() ? "{}" : upstream.body;
    } catch (const std::exception& ex) {
        LOG_WARNING() << "invite fast path failed for " << invite_code << ": " << ex.what();
        response.SetStatus(userver::server::http::HttpStatus::kBadGateway);
        response.SetHeader(std::string_view{"Cache-Control"}, "no-store");
        return R"({"code":502,"message":"Invite service unavailable"})";
    }
}

}  // namespace astral::userver_invites
