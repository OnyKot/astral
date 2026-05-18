// Copyright (C) 2026 Astral Contributors – AGPL-3.0-or-later
#include "tenor_proxy_handler.hpp"

#include <userver/logging/log.hpp>
#include <userver/server/http/http_status.hpp>
#include <userver/yaml_config/merge_schemas.hpp>

namespace astral::tenor {

namespace {

constexpr std::string_view kJson = "application/json";
constexpr std::string_view kCorsHeader = "Access-Control-Allow-Origin";
constexpr std::string_view kCacheHeader = "Cache-Control";

std::string BadRequest(const char* message) {
  return std::string{"{\"code\":400,\"message\":\""} + message + "\"}";
}

}  // namespace

TenorProxyHandler::TenorProxyHandler(
    const userver::components::ComponentConfig& config,
    const userver::components::ComponentContext& ctx)
    : userver::server::handlers::HttpHandlerBase(config, ctx),
      tenor_client_(ctx.FindComponent<TenorClient>()) {}

std::string TenorProxyHandler::HandleRequestThrow(
    const userver::server::http::HttpRequest& request,
    userver::server::request::RequestContext& /*context*/) const {
  auto& response = request.GetHttpResponse();
  response.SetContentType(std::string{kJson});
  response.SetHeader(kCorsHeader, "*");

  const auto& path = request.GetRequestPath();
  const auto q = request.GetArg("q");
  auto locale = request.GetArg("locale");
  if (locale.empty()) locale = "en_US";

  try {
    if (path.find("/tenor/search") != std::string::npos) {
      if (q.empty()) {
        response.SetStatus(userver::server::http::HttpStatus::kBadRequest);
        return BadRequest("Missing required parameter: q");
      }
      response.SetHeader(kCacheHeader, "public, max-age=30");
      return tenor_client_.Search(q, locale);
    }

    if (path.find("/tenor/featured") != std::string::npos) {
      response.SetHeader(kCacheHeader, "public, max-age=300");
      return tenor_client_.Featured(locale);
    }

    if (path.find("/tenor/trending-gifs") != std::string::npos) {
      response.SetHeader(kCacheHeader, "public, max-age=300");
      return tenor_client_.TrendingGifs(locale);
    }

    if (path.find("/tenor/suggest") != std::string::npos) {
      if (q.empty()) {
        response.SetStatus(userver::server::http::HttpStatus::kBadRequest);
        return BadRequest("Missing required parameter: q");
      }
      response.SetHeader(kCacheHeader, "public, max-age=30");
      return tenor_client_.Suggest(q, locale);
    }

    response.SetStatus(userver::server::http::HttpStatus::kNotFound);
    return R"({"code":404,"message":"Unknown tenor endpoint"})";
  } catch (const MissingApiKey&) {
    response.SetStatus(userver::server::http::HttpStatus::kForbidden);
    return R"({"code":"MISSING_ACCESS","message":"Missing Access"})";
  } catch (const std::exception& ex) {
    LOG_WARNING() << "tenor upstream failed: " << ex.what();
    response.SetStatus(userver::server::http::HttpStatus::kBadGateway);
    return R"({"code":502,"message":"GIF provider unavailable"})";
  }
}

userver::yaml_config::Schema TenorProxyHandler::GetStaticConfigSchema() {
  return userver::yaml_config::MergeSchemas<
      userver::server::handlers::HttpHandlerBase>(R"(
type: object
description: Tenor GIF proxy handler with path-based dispatch
additionalProperties: false
properties: {}
)");
}

}  // namespace astral::tenor
