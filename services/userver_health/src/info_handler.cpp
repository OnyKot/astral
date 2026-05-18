#include <info_handler.hpp>

#include <astral/common/build_info.hpp>
#include <astral/common/uptime.hpp>

#include <userver/formats/json/serialize.hpp>
#include <userver/formats/json/value_builder.hpp>
#include <userver/http/content_type.hpp>
#include <userver/server/http/http_request.hpp>
#include <userver/server/http/http_response.hpp>
#include <userver/server/request/request_context.hpp>

namespace astral::userver_health {

std::string InfoHandler::HandleRequest(
    userver::server::http::HttpRequest& request,
    userver::server::request::RequestContext&
) const {
    request.GetHttpResponse().SetContentType(userver::http::content_type::kApplicationJson);

    userver::formats::json::ValueBuilder response;
    response["service"] = "astral-userver-health";
    response["framework"] = "userver";
    response["version"] = std::string{astral::common::kVersion};
    response["build_id"] = std::string{astral::common::kBuildId};
    response["commit"] = std::string{astral::common::kCommit};
    response["uptime_seconds"] = static_cast<std::int64_t>(
        astral::common::ProcessClock::UptimeSeconds().count()
    );

    return userver::formats::json::ToString(response.ExtractValue());
}

}  // namespace astral::userver_health
