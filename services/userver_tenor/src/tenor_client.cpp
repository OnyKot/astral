// Copyright (C) 2026 Astral Contributors – AGPL-3.0-or-later
#include "tenor_client.hpp"

#include <algorithm>
#include <array>
#include <cctype>
#include <cstdlib>
#include <initializer_list>
#include <stdexcept>
#include <string_view>
#include <utility>

#include <fmt/format.h>
#include <openssl/evp.h>
#include <openssl/hmac.h>
#include <userver/clients/http/client.hpp>
#include <userver/formats/common/type.hpp>
#include <userver/formats/json/serialize.hpp>
#include <userver/formats/json/value_builder.hpp>
#include <userver/logging/log.hpp>
#include <userver/yaml_config/merge_schemas.hpp>

namespace astral::tenor {

namespace json = userver::formats::json;
namespace common = userver::formats::common;

namespace {

constexpr auto kSearchTtl = std::chrono::seconds{30};
constexpr auto kSuggestTtl = std::chrono::seconds{30};
constexpr auto kFeaturedTtl = std::chrono::minutes{5};
constexpr auto kTrendingTtl = std::chrono::minutes{5};
constexpr auto kRequestTimeout = std::chrono::seconds{5};
constexpr int kDefaultLimit = 50;
constexpr int kFeaturedLimit = 24;
constexpr int kSuggestLimit = 20;
const std::string kTrendingSearchesCacheKey{"trending-searches"};

std::string EnvOr(const char* name, std::string fallback = {}) {
  const char* value = std::getenv(name);
  if (value == nullptr || *value == '\0') {
    return fallback;
  }
  return std::string{value};
}

bool IsUnreserved(unsigned char c) {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
         (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' ||
         c == '~' || c == '/';
}

void AppendPercentEncodedByte(std::string& out, unsigned char c) {
  constexpr std::array<char, 16> kHex = {'0', '1', '2', '3', '4', '5',
                                         '6', '7', '8', '9', 'A', 'B',
                                         'C', 'D', 'E', 'F'};
  out.push_back('%');
  out.push_back(kHex[c >> 4]);
  out.push_back(kHex[c & 0x0F]);
}

std::string UrlEncodeComponent(std::string_view raw) {
  std::string out;
  out.reserve(raw.size() * 3);
  for (unsigned char c : raw) {
    if (IsUnreserved(c)) {
      out.push_back(static_cast<char>(c));
    } else {
      AppendPercentEncodedByte(out, c);
    }
  }
  return out;
}

std::string ToLowerCopy(std::string value) {
  std::transform(value.begin(), value.end(), value.begin(),
                 [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return value;
}

std::string NormalizeLocale(std::string locale) {
  if (locale.empty()) {
    return "en";
  }

  const auto underscore = locale.find('_');
  if (underscore != std::string::npos) {
    locale[underscore] = '-';
  }

  locale = ToLowerCopy(std::move(locale));
  const auto dash = locale.find('-');
  if (dash != std::string::npos) {
    locale.resize(dash);
  }
  if (locale.empty()) {
    locale = "en";
  }
  return locale;
}

std::optional<std::string> GetString(const json::Value& object, std::string_view key) {
  if (!object.HasMember(key)) {
    return std::nullopt;
  }

  const auto member = object[key];
  if (!member.IsString()) {
    return std::nullopt;
  }
  return member.As<std::string>();
}

json::Value GetMember(const json::Value& object, std::string_view key) {
  if (!object.HasMember(key)) {
    return json::Value{};
  }
  return object[key];
}

std::optional<int> ParseDimension(const std::optional<std::string>& value) {
  if (!value.has_value() || value->empty()) {
    return std::nullopt;
  }

  try {
    const auto parsed = std::stoi(*value);
    if (parsed >= 0) {
      return parsed;
    }
  } catch (const std::exception&) {
  }
  return std::nullopt;
}

std::string FirstNonEmptyString(
    std::initializer_list<std::optional<std::string>> values) {
  for (const auto& value : values) {
    if (value.has_value() && !value->empty()) {
      return *value;
    }
  }
  return {};
}

int FirstDimension(std::initializer_list<std::optional<int>> values, int fallback) {
  for (const auto& value : values) {
    if (value.has_value()) {
      return *value;
    }
  }
  return fallback;
}

std::string Base64UrlNoPadding(const unsigned char* data, std::size_t size) {
  const auto encoded_len = 4 * ((size + 2) / 3);
  std::string out(encoded_len, '\0');
  const auto written =
      EVP_EncodeBlock(reinterpret_cast<unsigned char*>(out.data()), data,
                      static_cast<int>(size));
  out.resize(static_cast<std::size_t>(written));

  for (char& ch : out) {
    if (ch == '+') {
      ch = '-';
    } else if (ch == '/') {
      ch = '_';
    }
  }

  while (!out.empty() && out.back() == '=') {
    out.pop_back();
  }
  return out;
}

std::string CreateSignature(std::string_view input, std::string_view secret) {
  std::array<unsigned char, EVP_MAX_MD_SIZE> digest{};
  unsigned int digest_len = 0;

  const auto* result = HMAC(
      EVP_sha256(), secret.data(), static_cast<int>(secret.size()),
      reinterpret_cast<const unsigned char*>(input.data()),
      input.size(), digest.data(), &digest_len);
  if (result == nullptr) {
    throw std::runtime_error("failed to sign media proxy url");
  }

  return Base64UrlNoPadding(digest.data(), digest_len);
}

std::string BuildGiphyUrl(std::string_view base_url,
                          std::string_view path,
                          std::string_view api_key,
                          std::string_view extra_params) {
  const auto encoded_api_key = UrlEncodeComponent(api_key);
  std::string url;
  url.reserve(base_url.size() + path.size() + encoded_api_key.size() +
              extra_params.size() + 16);
  url.append(base_url);
  url.append(path);
  url.append("?api_key=");
  url.append(encoded_api_key);
  if (!extra_params.empty()) {
    url.push_back('&');
    url.append(extra_params);
  }
  return url;
}

std::string MakeCacheKey(std::string_view left, std::string_view right) {
  std::string key;
  key.reserve(left.size() + 1 + right.size());
  key.append(left);
  key.push_back('\0');
  key.append(right);
  return key;
}

struct ParsedUrl final {
  std::string scheme;
  std::string host;
  std::string port;
  std::string path;
  std::string query;
};

std::optional<ParsedUrl> ParseUrl(std::string_view raw) {
  const auto scheme_pos = raw.find("://");
  if (scheme_pos == std::string_view::npos) {
    return std::nullopt;
  }

  ParsedUrl parsed;
  parsed.scheme = std::string(raw.substr(0, scheme_pos));

  std::string_view rest = raw.substr(scheme_pos + 3);
  const auto fragment_pos = rest.find('#');
  if (fragment_pos != std::string_view::npos) {
    rest = rest.substr(0, fragment_pos);
  }

  const auto authority_end = rest.find_first_of("/?");
  const std::string_view authority =
      authority_end == std::string_view::npos ? rest : rest.substr(0, authority_end);
  if (authority.empty()) {
    return std::nullopt;
  }

  const auto colon_pos = authority.rfind(':');
  if (colon_pos != std::string_view::npos && authority.find(']') == std::string_view::npos) {
    parsed.host = ToLowerCopy(std::string(authority.substr(0, colon_pos)));
    parsed.port = std::string(authority.substr(colon_pos + 1));
  } else {
    parsed.host = ToLowerCopy(std::string(authority));
  }

  if (authority_end == std::string_view::npos) {
    return parsed;
  }

  const std::string_view tail = rest.substr(authority_end);
  if (!tail.empty() && tail.front() == '/') {
    const auto query_pos = tail.find('?');
    parsed.path = std::string(tail.substr(1, query_pos == std::string_view::npos
                                               ? std::string_view::npos
                                               : query_pos - 1));
    if (query_pos != std::string_view::npos) {
      parsed.query = std::string(tail.substr(query_pos + 1));
    }
  } else if (!tail.empty() && tail.front() == '?') {
    parsed.query = std::string(tail.substr(1));
  }

  return parsed;
}

std::string BuildProxyPath(const ParsedUrl& input) {
  std::string out;
  out.reserve((input.query.size() + input.host.size() + input.port.size() +
               input.path.size()) * 3 + input.scheme.size() + 5);
  if (!input.query.empty()) {
    out += UrlEncodeComponent(input.query);
    out.push_back('/');
  }
  out += input.scheme;
  out.push_back('/');
  out += UrlEncodeComponent(input.host);
  if (!input.port.empty()) {
    out.push_back(':');
    out += UrlEncodeComponent(input.port);
  }
  out.push_back('/');
  out += UrlEncodeComponent(input.path);
  return out;
}

json::ValueBuilder MakeGifBuilder(const TenorGif& gif) {
  json::ValueBuilder node;
  node["id"] = gif.id;
  node["title"] = gif.title;
  node["url"] = gif.url;
  node["src"] = gif.src;
  node["proxy_src"] = gif.proxy_src;
  node["width"] = gif.width;
  node["height"] = gif.height;
  return node;
}

json::ValueBuilder MakeCategoryBuilder(std::string_view name,
                                       std::string_view src,
                                       std::string_view proxy_src) {
  json::ValueBuilder node;
  node["name"] = std::string{name};
  node["src"] = std::string{src};
  node["proxy_src"] = std::string{proxy_src};
  return node;
}

bool IsBlank(std::string_view value) {
  return std::all_of(value.begin(), value.end(), [](unsigned char c) {
    return std::isspace(c) != 0;
  });
}

}  // namespace

TenorClient::TenorClient(
    const userver::components::ComponentConfig& config,
    const userver::components::ComponentContext& ctx)
    : userver::components::LoggableComponentBase(config, ctx),
      http_client_(
          ctx.FindComponent<userver::components::HttpClient>().GetHttpClient()),
      api_key_(config["api_key"].As<std::string>("")),
      base_url_(
          config["base_url"].As<std::string>("https://api.giphy.com/v1")),
      media_endpoint_(EnvOr("ASTRAL_MEDIA_ENDPOINT", EnvOr("MEDIA_PROXY_ENDPOINT"))),
      media_proxy_secret_key_(EnvOr("MEDIA_PROXY_SECRET_KEY")),
      search_cache_(kSearchTtl),
      suggest_cache_(kSuggestTtl),
      featured_cache_(kFeaturedTtl),
      trending_cache_(kTrendingTtl),
      trending_searches_cache_(kTrendingTtl) {
  if (api_key_.empty()) {
    const char* env = std::getenv("GIPHY_API_KEY");
    if (!env) env = std::getenv("TENOR_API_KEY");
    if (env && *env != '\0') {
      api_key_ = env;
    }
  }

  if (media_endpoint_.empty() || media_proxy_secret_key_.empty()) {
    throw std::runtime_error(
        "TenorClient requires ASTRAL_MEDIA_ENDPOINT and MEDIA_PROXY_SECRET_KEY");
  }

  if (api_key_.empty()) {
    LOG_WARNING() << "TenorClient: no API key configured - requests will return 403";
  }
}

json::Value TenorClient::FetchJson(std::string_view path,
                                   std::string_view extra_params) const {
  if (api_key_.empty()) {
    throw MissingApiKey("GIF provider API key is missing");
  }

  const auto url = BuildGiphyUrl(base_url_, path, api_key_, extra_params);

  auto response =
      http_client_.CreateRequest()
          .get(url)
          .timeout(kRequestTimeout)
          .retry(1)
          .headers({{"User-Agent", "Astral"}})
          .perform();

  const auto status = response->status_code();
  const auto body = response->body();
  if (!response->IsOk()) {
    throw std::runtime_error(
        fmt::format("Giphy API returned HTTP {} for {}", status, path));
  }
  if (body.empty()) {
    throw std::runtime_error(fmt::format("Giphy API returned empty body for {}", path));
  }

  try {
    return json::FromString(body);
  } catch (const std::exception& ex) {
    throw std::runtime_error(
        fmt::format("failed to parse Giphy JSON for {}: {}", path, ex.what()));
  }
}

std::string TenorClient::FetchFromTenor(std::string_view path,
                                        std::string_view extra_params) const {
  return json::ToString(FetchJson(path, extra_params));
}

std::optional<TenorGif> TenorClient::TransformGif(
    const json::Value& input) const {
  if (!input.HasMember("id") || !input["id"].IsString()) {
    return std::nullopt;
  }

  TenorGif gif;
  gif.id = input["id"].As<std::string>();
  gif.title = GetString(input, "title").value_or("GIF");
  gif.url = GetString(input, "url").value_or(GetString(input, "bitly_url").value_or(""));

  const auto images = GetMember(input, "images");
  const auto preview = GetMember(images, "preview");
  const auto fixed_height = GetMember(images, "fixed_height");
  const auto original = GetMember(images, "original");
  const auto downsized = GetMember(images, "downsized");

  const std::string src = FirstNonEmptyString({
      GetString(preview, "mp4"),
      GetString(fixed_height, "mp4"),
      GetString(original, "mp4"),
      GetString(preview, "url"),
      GetString(fixed_height, "url"),
      GetString(downsized, "url"),
      GetString(original, "url"),
  });

  if (src.empty()) {
    return std::nullopt;
  }

  gif.src = src;
  gif.proxy_src = GetExternalMediaProxyUrl(gif.src);

  gif.width = FirstDimension({
      ParseDimension(GetString(preview, "width")),
      ParseDimension(GetString(fixed_height, "width")),
      ParseDimension(GetString(downsized, "width")),
      ParseDimension(GetString(original, "width")),
  }, 320);
  gif.height = FirstDimension({
      ParseDimension(GetString(preview, "height")),
      ParseDimension(GetString(fixed_height, "height")),
      ParseDimension(GetString(downsized, "height")),
      ParseDimension(GetString(original, "height")),
  }, 240);

  return gif;
}

std::vector<TenorGif> TenorClient::FetchAndTransformGifs(
    std::string_view path,
    std::string_view extra_params) const {
  const auto json = FetchJson(path, extra_params);
  const auto data = GetMember(json, "data");
  if (!data.IsArray()) {
    throw std::runtime_error(fmt::format("Giphy API payload for {} missing data array", path));
  }

  std::vector<TenorGif> gifs;
  gifs.reserve(data.GetSize());
  for (const auto& item : data) {
    if (auto gif = TransformGif(item); gif.has_value()) {
      gifs.push_back(std::move(*gif));
    }
  }
  return gifs;
}

std::vector<std::string> TenorClient::FetchTrendingSearches() const {
  if (auto cached = trending_searches_cache_.Get(kTrendingSearchesCacheKey)) {
    return *cached;
  }

  const auto json = FetchJson("/trending/searches", {});
  const auto data = GetMember(json, "data");
  if (!data.IsArray()) {
    throw std::runtime_error("Giphy trending/searches payload missing data array");
  }

  std::vector<std::string> searches;
  searches.reserve(data.GetSize());
  for (const auto& item : data) {
    if (!item.IsString()) {
      continue;
    }

    auto term = item.As<std::string>();
    if (IsBlank(term)) {
      continue;
    }
    searches.push_back(std::move(term));
  }

  trending_searches_cache_.Put(kTrendingSearchesCacheKey, searches);
  return searches;
}

std::string TenorClient::SerializeGifs(const std::vector<TenorGif>& gifs) const {
  json::ValueBuilder body{common::Type::kArray};
  for (const auto& gif : gifs) {
    body.PushBack(MakeGifBuilder(gif));
  }
  return json::ToString(body.ExtractValue());
}

std::string TenorClient::SerializeFeatured(
    const std::vector<TenorGif>& gifs,
    const std::vector<std::string>& searches) const {
  json::ValueBuilder root;

  {
    json::ValueBuilder gifs_node{common::Type::kArray};
    for (const auto& gif : gifs) {
      gifs_node.PushBack(MakeGifBuilder(gif));
    }
    root["gifs"] = gifs_node.ExtractValue();
  }

  {
    json::ValueBuilder categories_node{common::Type::kArray};
    if (!gifs.empty()) {
      const auto category_count = std::min<std::size_t>(searches.size(), kFeaturedLimit);
      for (std::size_t index = 0; index < category_count; ++index) {
        const auto& gif = gifs[index % gifs.size()];
        categories_node.PushBack(MakeCategoryBuilder(searches[index], gif.src, gif.proxy_src));
      }
    }
    root["categories"] = categories_node.ExtractValue();
  }

  return json::ToString(root.ExtractValue());
}

std::string TenorClient::GetExternalMediaProxyUrl(const std::string& input_url) const {
  const auto parsed_input = ParseUrl(input_url);
  const auto parsed_media = ParseUrl(media_endpoint_);
  if (!parsed_input.has_value() || !parsed_media.has_value()) {
    return input_url;
  }

  if (parsed_input->host == parsed_media->host && parsed_input->port == parsed_media->port) {
    return input_url;
  }

  const auto proxy_path = BuildProxyPath(*parsed_input);
  const auto signature = CreateSignature(proxy_path, media_proxy_secret_key_);
  return fmt::format("{}/external/{}/{}",
                     media_endpoint_, signature, proxy_path);
}

std::string TenorClient::Search(std::string_view q,
                                std::string_view locale) const {
  const auto lang = NormalizeLocale(std::string{locale});
  const auto key = MakeCacheKey(q, lang);
  if (auto cached = search_cache_.Get(key)) {
    return *cached;
  }

  const auto body = SerializeGifs(FetchAndTransformGifs(
      "/gifs/search",
      fmt::format("q={}&lang={}&limit={}&rating=pg-13",
                  UrlEncodeComponent(q), UrlEncodeComponent(lang),
                  kDefaultLimit)));
  search_cache_.Put(key, body);
  return body;
}

std::string TenorClient::Featured(std::string_view locale) const {
  const auto lang = NormalizeLocale(std::string{locale});
  if (auto cached = featured_cache_.Get(lang)) {
    return *cached;
  }

  const auto gifs = FetchAndTransformGifs(
      "/gifs/trending",
      fmt::format("lang={}&limit={}&rating=pg-13",
                  UrlEncodeComponent(lang), kFeaturedLimit));
  const auto searches = gifs.empty() ? std::vector<std::string>{} : FetchTrendingSearches();
  const auto body = SerializeFeatured(gifs, searches);
  featured_cache_.Put(lang, body);
  return body;
}

std::string TenorClient::TrendingGifs(std::string_view locale) const {
  const auto lang = NormalizeLocale(std::string{locale});
  if (auto cached = trending_cache_.Get(lang)) {
    return *cached;
  }

  const auto body = SerializeGifs(FetchAndTransformGifs(
      "/gifs/trending",
      fmt::format("lang={}&limit={}&rating=pg-13",
                  UrlEncodeComponent(lang), kDefaultLimit)));
  trending_cache_.Put(lang, body);
  return body;
}

std::string TenorClient::Suggest(std::string_view q,
                                 std::string_view locale) const {
  const auto lang = NormalizeLocale(std::string{locale});
  const auto key = MakeCacheKey(q, lang);
  if (auto cached = suggest_cache_.Get(key)) {
    return *cached;
  }

  const auto payload = FetchJson(
      "/gifs/search/tags",
      fmt::format("q={}&lang={}&limit={}",
                  UrlEncodeComponent(q), UrlEncodeComponent(lang), kSuggestLimit));
  const auto data = GetMember(payload, "data");
  if (!data.IsArray()) {
    throw std::runtime_error("Giphy suggest payload missing data array");
  }

  json::ValueBuilder body{common::Type::kArray};
  for (const auto& item : data) {
    if (!item.IsObject()) {
      continue;
    }
    const auto name = GetString(item, "name");
    if (!name.has_value() || IsBlank(*name)) {
      continue;
    }
    body.PushBack(std::move(*name));
  }

  const auto result = json::ToString(body.ExtractValue());
  suggest_cache_.Put(key, result);
  return result;
}

userver::yaml_config::Schema TenorClient::GetStaticConfigSchema() {
  return userver::yaml_config::MergeSchemas<
      userver::components::LoggableComponentBase>(R"(
type: object
description: Giphy API proxy client with TTL caching (tenor-compat naming)
additionalProperties: false
properties:
    api_key:
        type: string
        description: Giphy API key (overridden by GIPHY_API_KEY env)
        defaultDescription: ""
    base_url:
        type: string
        description: Giphy API v1 base URL
        defaultDescription: "https://api.giphy.com/v1"
)");
}

}  // namespace astral::tenor
