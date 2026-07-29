// Astral SDK — Cache module (re-exports from astral::common)
//
// Provides thread-safe LRU and TTL caches.
// Re-exports from astral::common for SDK users.
//
// Usage:
//   #include <astral/sdk/cache.hpp>
//
//   auto cache = std::make_shared<astral::common::TtlCache<Invite>>(
//       std::chrono::seconds(60)
//   );
//   cache->Put("code123", invite);
//   auto invite = cache->Get("code123");

#ifndef ASTRAL_SDK_CACHE_HPP
#define ASTRAL_SDK_CACHE_HPP

#include <astral/common/ttl_cache.hpp>

namespace astral::sdk::cache {

// Re-export from common for SDK users
template <typename Value>
using TtlCache = astral::common::TtlCache<Value>;

}  // namespace astral::sdk::cache

#endif  // ASTRAL_SDK_CACHE_HPP