// Copyright (C) 2026 Astral Contributors – AGPL-3.0-or-later
#pragma once

#include <string>
#include <chrono>
#include <optional>
#include <stdexcept>
#include <string_view>
#include <vector>

#include <userver/clients/http/component.hpp>
#include <userver/components/component_config.hpp>
#include <userver/components/component_context.hpp>
#include <userver/components/loggable_component_base.hpp>
#include <userver/formats/json/value.hpp>

#include <astral/common/ttl_cache.hpp>

namespace astral::tenor {

class MissingApiKey final : public std::runtime_error {
 public:
  using std::runtime_error::runtime_error;
};

struct TenorGif final {
  std::string id;
  std::string title;
  std::string url;
  std::string src;
  std::string proxy_src;
  int width{0};
  int height{0};
};

/// Component that proxies requests to Giphy API (v1).
/// Despite the "tenor" naming convention, the Node backend actually uses
/// Giphy under the hood. We mirror that behavior here.
class TenorClient final
    : public userver::components::LoggableComponentBase {
 public:
  static constexpr std::string_view kName = "tenor-client";

  TenorClient(const userver::components::ComponentConfig& config,
              const userver::components::ComponentContext& ctx);

  /// Search GIFs by query + locale.  Cached 30 s per (q, locale).
  std::string Search(std::string_view q, std::string_view locale) const;

  /// Featured GIFs for a locale.  Cached 5 min per locale.
  std::string Featured(std::string_view locale) const;

  /// Trending GIFs for a locale.  Cached 5 min per locale.
  std::string TrendingGifs(std::string_view locale) const;

  /// Search suggestions.  Cached 30 s per (q, locale).
  std::string Suggest(std::string_view q, std::string_view locale) const;

  static userver::yaml_config::Schema GetStaticConfigSchema();

 private:
  std::string FetchFromTenor(std::string_view path,
                             std::string_view extra_params) const;
  userver::formats::json::Value FetchJson(std::string_view path,
                                           std::string_view extra_params) const;
  std::vector<TenorGif> FetchAndTransformGifs(
      std::string_view path,
      std::string_view extra_params) const;
  std::vector<std::string> FetchTrendingSearches() const;
  std::optional<TenorGif> TransformGif(
      const userver::formats::json::Value& input) const;
  std::string SerializeGifs(const std::vector<TenorGif>& gifs) const;
  std::string SerializeFeatured(const std::vector<TenorGif>& gifs,
                                const std::vector<std::string>& searches) const;
  std::string GetExternalMediaProxyUrl(const std::string& input_url) const;

  userver::clients::http::Client& http_client_;
  std::string api_key_;
  std::string base_url_;
  std::string media_endpoint_;
  std::string media_endpoint_host_;
  std::string media_endpoint_port_;
  bool media_endpoint_is_valid_{false};
  std::string media_proxy_secret_key_;

  // Caches keyed by "query|locale" or just "locale"
  mutable common::TtlCache<std::string> search_cache_;
  mutable common::TtlCache<std::string> suggest_cache_;
  mutable common::TtlCache<std::string> featured_cache_;
  mutable common::TtlCache<std::string> trending_cache_;
  mutable common::TtlCache<std::vector<std::string>> trending_searches_cache_;
};

}  // namespace astral::tenor
