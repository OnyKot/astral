// Astral SDK — Prometheus-compatible metrics.
//
// Features:
// - Counters, Histograms, Gauges
// - Thread-safe (atomic operations + mutex for complex types)
// - Prometheus text format export
// - Automatic histogram buckets
// - Scoped labels
//
// Usage:
//   #include <astral/sdk/metrics.hpp>
//
//   using namespace astral::sdk::metrics;
//
//   // Increment counter
//   Registry::Instance().IncrementCounter("http_requests_total",
//       {{"method", "GET"}, {"path", "/api/v1/invites"}});
//
//   // Observe histogram
//   Registry::Instance().ObserveHistogram("http_request_duration_seconds",
//       0.015, {{"path", "/api/v1/invites"}});
//
//   // Export for /metrics endpoint
//   auto metrics = Registry::Instance().ExportPrometheus();

#ifndef ASTRAL_SDK_METRICS_HPP
#define ASTRAL_SDK_METRICS_HPP

#include <userver/storages/cassandra/result_set.hpp>

#include <atomic>
#include <functional>
#include <map>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>
#include <cassert>

namespace astral::sdk::metrics {

// ============================================================================
// Metric names (constants for consistency)
// ============================================================================

static constexpr std::string_view SCYLLA_REQUESTS_TOTAL = "scylla_requests_total";
static constexpr std::string_view SCYLLA_REQUEST_DURATION = "scylla_request_duration_seconds";
static constexpr std::string_view SCYLLA_CONNECTION_POOL_SIZE = "scylla_connection_pool_size";
static constexpr std::string_view SCYLLA_CACHE_HITS_TOTAL = "scylla_cache_hits_total";

static constexpr std::string_view HTTP_REQUESTS_TOTAL = "http_requests_total";
static constexpr std::string_view HTTP_REQUEST_DURATION = "http_request_duration_seconds";
static constexpr std::string_view HTTP_REQUESTS_IN_FLIGHT = "http_requests_in_flight";

static constexpr std::string_view CACHE_HITS_TOTAL = "cache_hits_total";
static constexpr std::string_view CACHE_MISSES_TOTAL = "cache_misses_total";

static constexpr std::string_view UPSTREAM_ERRORS_TOTAL = "upstream_errors_total";

// ============================================================================
// Histogram buckets (Prometheus defaults)
// ============================================================================

// For latencies in seconds
static constexpr std::vector<double> LATENCY_BUCKETS = {
    0.001,   // 1ms
    0.005,   // 5ms
    0.01,    // 10ms
    0.025,   // 25ms
    0.05,    // 50ms
    0.1,     // 100ms
    0.25,    // 250ms
    0.5,     // 500ms
    1.0,     // 1s
    2.5,     // 2.5s
    5.0,     // 5s
    10.0     // 10s
};

// For request sizes in bytes
static constexpr std::vector<double> SIZE_BUCKETS = {
    100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000
};

// Find bucket index for a value
inline size_t GetBucketIndex(double value, const std::vector<double>& buckets) {
    for (size_t i = 0; i < buckets.size(); ++i) {
        if (value <= buckets[i]) return i;
    }
    return buckets.size();  // Inf bucket
}

// ============================================================================
// Metric types
// ============================================================================

enum class Type { Counter, Gauge, Histogram };

struct Labels {
    std::vector<std::pair<std::string, std::string>> pairs;

    bool operator==(const Labels& other) const {
        if (pairs.size() != other.pairs.size()) return false;
        for (size_t i = 0; i < pairs.size(); ++i) {
            if (pairs[i] != other.pairs[i]) return false;
        }
        return true;
    }

    std::string ToString() const {
        std::string result;
        for (size_t i = 0; i < pairs.size(); ++i) {
            if (i > 0) result += ",";
            result += pairs[i].first + "=\"" + pairs[i].second + "\"";
        }
        return result;
    }
};

inline Labels MakeLabels(std::initializer_list<std::pair<std::string, std::string>> items) {
    return Labels{{items}};
}

// ============================================================================
// Counter (monotonically increasing, atomic)
// ============================================================================

class Counter {
public:
    void Increment(int64_t delta = 1) { value_.fetch_add(delta, std::memory_order_relaxed); }

    int64_t Value() const { return value_.load(std::memory_order_relaxed); }

    void Reset() { value_.store(0, std::memory_order_relaxed); }

private:
    std::atomic<int64_t> value_{0};
};

// ============================================================================
// Gauge (can go up and down, atomic)
// ============================================================================

class Gauge {
public:
    void Increment(int64_t delta = 1) { value_.fetch_add(delta, std::memory_order_relaxed); }
    void Decrement(int64_t delta = 1) { value_.fetch_sub(delta, std::memory_order_relaxed); }
    void Set(double value) { value_.store(value, std::memory_order_relaxed); }
    double Value() const { return value_.load(std::memory_order_relaxed); }

private:
    std::atomic<double> value_{0.0};
};

// ============================================================================
// Histogram (collects observations, computes buckets)
// ============================================================================

class Histogram {
public:
    explicit Histogram(const std::vector<double>& buckets)
        : buckets_(buckets)
        , counts_(buckets.size() + 1, 0)
        , sum_(0.0)
        , count_(0)
    {}

    void Observe(double value) {
        size_t idx = GetBucketIndex(value, buckets_);

        std::lock_guard<std::mutex> lock(mutex_);
        counts_[idx].fetch_add(1, std::memory_order_relaxed);
        sum_.fetch_add(value, std::memory_order_relaxed);
        count_.fetch_add(1, std::memory_order_relaxed);
    }

    // Get bucket counts and sum
    void Export(std::vector<int64_t>* out_counts, double* out_sum, int64_t* out_total_count) const {
        std::lock_guard<std::mutex> lock(mutex_);

        if (out_counts) {
            for (size_t i = 0; i < counts_.size(); ++i) {
                (*out_counts)[i] = counts_[i].load(std::memory_order_relaxed);
            }
        }
        if (out_sum) *out_sum = sum_.load(std::memory_order_relaxed);
        if (out_total_count) *out_total_count = count_.load(std::memory_order_relaxed);
    }

    double Sum() const { return sum_.load(std::memory_order_relaxed); }
    int64_t Count() const { return count_.load(std::memory_order_relaxed); }

    const std::vector<double>& Buckets() const { return buckets_; }

private:
    std::vector<double> buckets_;
    std::vector<std::atomic<int64_t>> counts_;
    std::atomic<double> sum_;
    std::atomic<int64_t> count_;
    mutable std::mutex mutex_;
};

// ============================================================================
// Registry (singleton holding all metrics)
// ============================================================================

namespace detail {
struct MetricKey {
    std::string name;
    Labels labels;

    bool operator==(const MetricKey& other) const {
        return name == other.name && labels == other.labels;
    }
};

struct MetricKeyHash {
    size_t operator()(const MetricKey& key) const {
        size_t h = 14695981039346656037ULL;  // FNV offset basis
        for (const auto& [k, v] : key.labels.pairs) {
            h ^= std::hash<std::string>{}(k);
            h *= 1099511628211ULL;
            h ^= std::hash<std::string>{}(v);
            h *= 1099511628211ULL;
        }
        h ^= std::hash<std::string>{}(key.name);
        h *= 1099511628211ULL;
        return h;
    }
};
}  // namespace detail

class Registry {
public:
    static Registry& Instance() {
        static Registry instance;
        return instance;
    }

    // =========================================================================
    // Counter operations
    // =========================================================================

    Counter& GetCounter(std::string name, Labels labels) {
        std::lock_guard<std::mutex> lock(mutex_);
        MetricKey key{std::move(name), std::move(labels)};
        auto it = counters_.find(key);
        if (it != counters_.end()) return *it->second;
        auto [inserted, _] = counters_.emplace(std::move(key), std::make_unique<Counter>());
        return *inserted->second;
    }

    void IncrementCounter(std::string name, Labels labels, int64_t delta = 1) {
        auto& counter = GetCounter(std::move(name), std::move(labels));
        counter.Increment(delta);
    }

    void IncrementCounter(std::string name,
                         std::initializer_list<std::pair<std::string, std::string>> labels,
                         int64_t delta = 1) {
        IncrementCounter(std::move(name), MakeLabels(labels), delta);
    }

    // =========================================================================
    // Gauge operations
    // =========================================================================

    Gauge& GetGauge(std::string name, Labels labels) {
        std::lock_guard<std::mutex> lock(mutex_);
        MetricKey key{std::move(name), std::move(labels)};
        auto it = gauges_.find(key);
        if (it != gauges_.end()) return *it->second;
        auto [inserted, _] = gauges_.emplace(std::move(key), std::make_unique<Gauge>());
        return *inserted->second;
    }

    void SetGauge(std::string name, Labels labels, double value) {
        auto& gauge = GetGauge(std::move(name), std::move(labels));
        gauge.Set(value);
    }

    void IncrementGauge(std::string name, Labels labels, double delta = 1.0) {
        auto& gauge = GetGauge(std::move(name), std::move(labels));
        gauge.Increment(delta);
    }

    // =========================================================================
    // Histogram operations
    // =========================================================================

    Histogram& GetHistogram(std::string name, Labels labels) {
        std::lock_guard<std::mutex> lock(mutex_);
        MetricKey key{std::move(name), std::move(labels)};
        auto it = histograms_.find(key);
        if (it != histograms_.end()) return *it->second;
        auto [inserted, _] = histograms_.emplace(std::move(key),
                                                std::make_unique<Histogram>(LATENCY_BUCKETS));
        return *inserted->second;
    }

    void ObserveHistogram(std::string name, Labels labels, double value) {
        auto& histogram = GetHistogram(std::move(name), std::move(labels));
        histogram.Observe(value);
    }

    void ObserveHistogram(std::string name,
                          std::initializer_list<std::pair<std::string, std::string>> labels,
                          double value) {
        ObserveHistogram(std::move(name), MakeLabels(labels), value);
    }

    // =========================================================================
    // Export to Prometheus format
    // =========================================================================

    std::string ExportPrometheus() const {
        std::lock_guard<std::mutex> lock(mutex_);
        std::string output;

        // Export counters
        for (const auto& [key, counter] : counters_) {
            output += ExportCounter(key, *counter);
        }

        // Export gauges
        for (const auto& [key, gauge] : gauges_) {
            output += ExportGauge(key, *gauge);
        }

        // Export histograms
        for (const auto& [key, histogram] : histograms_) {
            output += ExportHistogram(key, *histogram);
        }

        return output;
    }

private:
    Registry() = default;

    std::string ExportCounter(const detail::MetricKey& key, const Counter& counter) const {
        std::string line = "# TYPE " + key.name + " counter\n";
        line += key.name + "{" + key.labels.ToString() + "} " + std::to_string(counter.Value()) + "\n";
        return line;
    }

    std::string ExportGauge(const detail::MetricKey& key, const Gauge& gauge) const {
        std::string line = "# TYPE " + key.name + " gauge\n";
        line += key.name + "{" + key.labels.ToString() + "} " + std::to_string(gauge.Value()) + "\n";
        return line;
    }

    std::string ExportHistogram(const detail::MetricKey& key, const Histogram& histogram) const {
        std::string output;
        std::string base_name = key.name;
        std::string labels = key.labels.ToString();

        output += "# TYPE " + base_name + " histogram\n";

        size_t num_buckets = histogram.Buckets().size();
        std::vector<int64_t> bucket_counts(num_buckets + 1);
        double sum;
        int64_t count;
        histogram.Export(&bucket_counts, &sum, &count);

        // Cumulative sum for Prometheus histogram format
        int64_t cumulative = 0;
        for (size_t i = 0; i < num_buckets; ++i) {
            cumulative += bucket_counts[i];
            std::string bucket_line = base_name + "_bucket{" + labels + ",le=\"" +
                                     std::to_string(histogram.Buckets()[i]) + "\"} " +
                                     std::to_string(cumulative) + "\n";
            output += bucket_line;
        }

        // +Inf bucket
        output += base_name + "_bucket{" + labels + ",le=\"+Inf\"} " + std::to_string(count) + "\n";

        // Sum and count
        output += base_name + "_sum{" + labels + "} " + std::to_string(sum) + "\n";
        output += base_name + "_count{" + labels + "} " + std::to_string(count) + "\n";

        return output;
    }

    mutable std::mutex mutex_;
    std::unordered_map<detail::MetricKey, std::unique_ptr<Counter>, detail::MetricKeyHash> counters_;
    std::unordered_map<detail::MetricKey, std::unique_ptr<Gauge>, detail::MetricKeyHash> gauges_;
    std::unordered_map<detail::MetricKey, std::unique_ptr<Histogram>, detail::MetricKeyHash> histograms_;
};

// ============================================================================
// Convenience functions for common metrics
// ============================================================================

inline void IncrementScyllaRequests(std::string_view operation,
                                    std::string_view keyspace,
                                    bool success = true) {
    auto& registry = Registry::Instance();
    registry.IncrementCounter(
        std::string{SCYLLA_REQUESTS_TOTAL},
        {{"operation", std::string{operation}},
         {"keyspace", std::string{keyspace}},
         {"status", success ? "ok" : "error"}}
    );
}

inline void ObserveScyllaDuration(std::string_view keyspace, double duration_seconds) {
    Registry::Instance().ObserveHistogram(
        std::string{SCYLLA_REQUEST_DURATION},
        {{"keyspace", std::string{keyspace}}},
        duration_seconds
    );
}

inline void IncrementCacheHit(const std::string& cache_name) {
    Registry::Instance().IncrementCounter(
        std::string{CACHE_HITS_TOTAL},
        {{"cache", cache_name}}
    );
}

inline void IncrementCacheMiss(const std::string& cache_name) {
    Registry::Instance().IncrementCounter(
        std::string{CACHE_MISSES_TOTAL},
        {{"cache", cache_name}}
    );
}

}  // namespace astral::sdk::metrics

#endif  // ASTRAL_SDK_METRICS_HPP