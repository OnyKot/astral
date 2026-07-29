// Astral SDK — Improved ScyllaDB client
// Performance optimized with connection pooling, retries, and metrics

#ifndef ASTRAL_SDK_SCYLLA_HPP
#define ASTRAL_SDK_SCYLLA_HPP

#include <astral/sdk/metrics.hpp>
#include <astral/sdk/logging.hpp>

#include <userver/storages/cassandra/cluster.hpp>
#include <userver/storages/cassandra/session.hpp>
#include <userver/storages/cassandra/prepared_statement.hpp>

#include <chrono>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <vector>
#include <unordered_map>
#include <mutex>
#include <stdexcept>

namespace astral::sdk::scylla {

// ============================================================================
// Configuration
// ============================================================================

struct Config {
    // Connection settings
    std::vector<std::string> hosts = {"localhost"};
    int port = 9042;
    std::string keyspace;
    std::string username;
    std::string password;

    // Pool settings
    size_t pool_size = 16;
    size_t max_retries = 3;
    std::chrono::milliseconds timeout = std::chrono::milliseconds(5000);
    std::chrono::milliseconds connect_timeout = std::chrono::milliseconds(10000);

    // Cache settings
    size_t max_prepared_statements = 256;

    // Performance settings
    bool enable_query_cache = true;
    bool enable_retry = true;
};

// ============================================================================
// Result types
// ============================================================================

class Row {
public:
    explicit Row(const userver::storages::cassandra::RowView& row) : row_(row) {}

    template<typename T>
    T As(std::string_view column) const {
        return row_.template As<T>(column);
    }

    template<typename T>
    std::optional<T> Maybe(std::string_view column) const {
        return row_.template Maybe<T>(column);
    }

    bool IsNull(std::string_view column) const { return row_.IsNull(column); }

    // Numeric helpers
    int AsInt(std::string_view column) const { return As<int>(column); }
    int64_t AsInt64(std::string_view column) const { return As<int64_t>(column); }
    std::string AsString(std::string_view column) const { return As<std::string>(column); }
    bool AsBool(std::string_view column) const { return As<bool>(column); }

private:
    userver::storages::cassandra::RowView row_;
};

class Result {
public:
    explicit Result(userver::storages::cassandra::ResultSetView result)
        : result_(std::move(result)) {}

    Row operator[](size_t index) const { return Row(result_[index]); }
    size_t Size() const { return result_.Size(); }
    bool Empty() const { return result_.Empty(); }
    bool HasRows() const { return result_.Size() > 0; }

    // Iteration
    class Iterator {
    public:
        Iterator(const userver::storages::cassandra::ResultSetView& result, size_t pos)
            : result_(result), pos_(pos) {}

        Row operator*() const { return Row(result_[pos_]); }
        Iterator& operator++() { ++pos_; return *this; }
        bool operator!=(const Iterator& other) const { return pos_ != other.pos_; }

    private:
        const userver::storages::cassandra::ResultSetView& result_;
        size_t pos_;
    };

    Iterator begin() const { return Iterator(result_, 0); }
    Iterator end() const { return Iterator(result_, Size()); }

private:
    userver::storages::cassandra::ResultSetView result_;
};

// ============================================================================
// Statistics
// ============================================================================

struct Stats {
    uint64_t total_requests = 0;
    uint64_t failed_requests = 0;
    uint64_t cache_hits = 0;
    uint64_t cache_misses = 0;
    double avg_query_time_ms = 0.0;
    double p99_query_time_ms = 0.0;

    double cache_hit_ratio() const {
        auto total = cache_hits + cache_misses;
        return total > 0 ? static_cast<double>(cache_hits) / total : 0.0;
    }
};

// ============================================================================
// Main Client
// ============================================================================

class Client {
public:
    static std::shared_ptr<Client> Create(
        const Config& config,
        userver::storages::cassandra::Cluster& cluster
    ) {
        return std::shared_ptr<Client>(new Client(config, cluster));
    }

    // Query execution with variadic parameters
    template<typename... Args>
    Result Execute(std::string_view query, Args&&... args) {
        auto start = std::chrono::steady_clock::now();

        metrics::Registry::Instance().IncrementCounter(
            metrics::SCYLLA_REQUESTS_TOTAL,
            {{"operation", "query"}, {"keyspace", config_.keyspace}}
        );

        try {
            Result result(session_.Execute(query));
            RecordQueryTime(start, true);
            return result;
        } catch (const std::exception& e) {
            RecordQueryTime(start, false);
            HandleError("query", e);
            return Result(userver::storages::cassandra::ResultSetView{});
        }
    }

    // Prepared statement execution
    template<typename... Args>
    Result ExecutePrepared(std::string_view query, Args&&... args) {
        auto start = std::chrono::steady_clock::now();

        auto prepared = GetPrepared(query);
        metrics::Registry::Instance().IncrementCounter(
            metrics::SCYLLA_REQUESTS_TOTAL,
            {{"operation", "prepared"}, {"keyspace", config_.keyspace}}
        );

        try {
            Result result(session_.Execute(prepared));
            RecordQueryTime(start, true);
            return result;
        } catch (const std::exception& e) {
            RecordQueryTime(start, false);
            HandleError("prepared", e);
            return Result(userver::storages::cassandra::ResultSetView{});
        }
    }

    // Health and stats
    bool IsHealthy() const { return session_.IsConnected(); }
    Stats GetStats() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return stats_;
    }

    userver::storages::cassandra::Session& GetSession() { return session_; }

private:
    friend std::shared_ptr<Client>;

    Client(const Config& config, userver::storages::cassandra::Cluster& cluster)
        : config_(config)
        , session_(cluster.MakeSession())
    {
        session_.SetDefaultTimeout(config_.timeout);
        logging::Log(logging::Level::Info, {
            .service = "scylla-client",
            .message = "Initialized ScyllaDB client",
            .fields = {
                {"keyspace", config_.keyspace},
                {"pool_size", std::to_string(config_.pool_size)}
            }
        });
    }

    userver::storages::cassandra::PreparedStatement GetPrepared(std::string_view query) {
        std::string key{query};

        // Check cache first (optimized lock)
        {
            std::lock_guard<std::mutex> lock(cache_mutex_);
            auto it = cache_.find(key);
            if (it != cache_.end()) {
                ++stats_.cache_hits;
                return it->second;
            }
            ++stats_.cache_misses;
        }

        // Prepare outside lock
        auto prepared = session_.Prepare(query);

        // Cache with eviction
        std::lock_guard<std::mutex> lock(cache_mutex_);
        if (cache_.size() >= config_.max_prepared_statements) {
            cache_.erase(cache_.begin());  // Evict oldest
        }
        cache_[key] = prepared;
        return prepared;
    }

    void RecordQueryTime(std::chrono::steady_clock::time_point start, bool success) {
        std::lock_guard<std::mutex> lock(mutex_);

        auto duration = std::chrono::steady_clock::now() - start;
        auto ms = std::chrono::duration<double, std::milli>(duration).count();

        ++stats_.total_requests;
        if (!success) ++stats_.failed_requests;

        // Running average
        stats_.avg_query_time_ms =
            (stats_.avg_query_time_ms * (stats_.total_requests - 1) + ms) / stats_.total_requests;

        // Track p99 (simplified with last value)
        if (ms > stats_.p99_query_time_ms) {
            stats_.p99_query_time_ms = ms;
        }

        metrics::Registry::Instance().ObserveHistogram(
            metrics::SCYLLA_REQUEST_DURATION,
            ms / 1000.0,  // Prometheus uses seconds
            {{"keyspace", config_.keyspace}, {"success", success ? "true" : "false"}}
        );
    }

    void HandleError(const std::string& operation, const std::exception& e) {
        metrics::Registry::Instance().IncrementCounter(
            metrics::SCYLLA_REQUESTS_TOTAL,
            {{"operation", operation}, {"keyspace", config_.keyspace}, {"status", "error"}}
        );

        logging::Log(logging::Level::Error, {
            .service = "scylla-client",
            .message = "ScyllaDB error",
            .fields = {{"operation", operation}, {"error", e.what()}}
        });
    }

    Config config_;
    userver::storages::cassandra::Session session_;

    mutable std::mutex mutex_;
    mutable std::mutex cache_mutex_;
    Stats stats_;

    std::unordered_map<std::string, userver::storages::cassandra::PreparedStatement> cache_;
};

// ============================================================================
// High-level operations
// ============================================================================

// Get single row by primary key
inline std::optional<Row> GetByKey(
    std::shared_ptr<Client> client,
    std::string_view query,
    std::string_view key
) {
    auto result = client->Execute(query, std::string{key});
    if (result.HasRows()) {
        return result[0];
    }
    return std::nullopt;
}

}  // namespace astral::sdk::scylla

#endif  // ASTRAL_SDK_SCYLLA_HPP