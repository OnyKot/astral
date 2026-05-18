// Astral common — thread-safe in-memory TTL cache.
//
// Intentionally minimal: no background eviction thread, expiry is checked on
// Get(). Good enough for low-cardinality hot caches (per-guild presence
// counts, feature flags, etc.) where the number of keys stays bounded.
//
// If you need LRU, size bounds, or background sweep, graduate to
// `userver::cache::ExpirableLruCache` — this helper is for the simple case.

#pragma once

#include <chrono>
#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>

namespace astral::common {

template <typename Value>
class TtlCache final {
public:
    using Clock = std::chrono::steady_clock;

    explicit TtlCache(Clock::duration default_ttl) noexcept
        : default_ttl_(default_ttl) {}

    std::optional<Value> Get(const std::string& key) const {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = entries_.find(key);
        if (it == entries_.end()) return std::nullopt;
        if (Clock::now() >= it->second.expires_at) {
            entries_.erase(it);
            return std::nullopt;
        }
        return it->second.value;
    }

    void Put(const std::string& key, Value value) {
        Put(key, std::move(value), default_ttl_);
    }

    void Put(const std::string& key, Value value, Clock::duration ttl) {
        std::lock_guard<std::mutex> lock(mutex_);
        entries_[key] = Entry{std::move(value), Clock::now() + ttl};
    }

    void Invalidate(const std::string& key) {
        std::lock_guard<std::mutex> lock(mutex_);
        entries_.erase(key);
    }

    // Stats mostly for /metrics handlers.
    std::size_t Size() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return entries_.size();
    }

private:
    struct Entry {
        Value value;
        Clock::time_point expires_at;
    };

    Clock::duration default_ttl_;
    mutable std::mutex mutex_;
    mutable std::unordered_map<std::string, Entry> entries_;
};

}  // namespace astral::common
