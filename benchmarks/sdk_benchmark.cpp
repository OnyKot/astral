// Astral SDK — Benchmark suite
// Compares performance between different implementations

#include <benchmark/benchmark.h>

#include <astral/sdk/metrics.hpp>
#include <astral/sdk/logging.hpp>

#include <chrono>
#include <string>
#include <random>
#include <vector>

namespace astral::sdk::benchmark {

// ============================================================================
// Metrics benchmarks
// ============================================================================

static void BM_MetricsIncrementCounter(benchmark::State& state) {
    for (auto _ : state) {
        metrics::Registry::Instance().IncrementCounter(
            "benchmark_counter",
            {{"label", "value"}}
        );
    }
}
BENCHMARK(BM_MetricsIncrementCounter);

static void BM_MetricsObserveHistogram(benchmark::State& state) {
    for (auto _ : state) {
        metrics::Registry::Instance().ObserveHistogram(
            "benchmark_histogram",
            {{"path", "/test"}},
            0.05
        );
    }
}
BENCHMARK(BM_MetricsObserveHistogram);

static void BM_MetricsExportPrometheus(benchmark::State& state) {
    // Pre-populate some metrics
    for (int i = 0; i < 100; ++i) {
        metrics::Registry::Instance().IncrementCounter(
            "benchmark_counter",
            {{"label", std::to_string(i)}}
        );
    }

    for (auto _ : state) {
        benchmark::DoNotOptimize(
            metrics::Registry::Instance().ExportPrometheus()
        );
    }
}
BENCHMARK(BM_MetricsExportPrometheus);

// ============================================================================
// Logging benchmarks
// ============================================================================

static void BM_LoggingBasic(benchmark::State& state) {
    for (auto _ : state) {
        logging::Log(logging::Level::Info, {
            .service = "benchmark",
            .message = "Test message",
            .fields = {}
        });
    }
}
BENCHMARK(BM_LoggingBasic);

static void BM_LoggingWithFields(benchmark::State& state) {
    for (auto _ : state) {
        logging::Log(logging::Level::Info, {
            .service = "benchmark",
            .message = "Test message with fields",
            .fields = {
                {"key1", "value1"},
                {"key2", "value2"},
                {"key3", "value3"}
            }
        });
    }
}
BENCHMARK(BM_LoggingWithFields);

// ============================================================================
// String operations benchmarks
// ============================================================================

static void BM_StringConcat(benchmark::State& state) {
    std::string result;
    for (auto _ : state) {
        result = "prefix_" + std::to_string(123) + "_suffix";
        benchmark::DoNotOptimize(result);
    }
}
BENCHMARK(BM_StringConcat);

static void BM_StringFormat(benchmark::State& state) {
    std::string result;
    for (auto _ : state) {
        char buf[256];
        std::snprintf(buf, sizeof(buf),
            "{\"code\":\"%s\",\"guild_id\":\"%s\"}",
            "test123", "456");
        result = buf;
        benchmark::DoNotOptimize(result);
    }
}
BENCHMARK(BM_StringFormat);

// ============================================================================
// JSON benchmarks
// ============================================================================

static void BM_JsonSerialize(benchmark::State& state) {
    nlohmann::json json;
    json["code"] = "test123";
    json["guild_id"] = "456";
    json["channel_id"] = "789";

    for (auto _ : state) {
        auto str = json.dump();
        benchmark::DoNotOptimize(str);
    }
}
BENCHMARK(BM_JsonSerialize);

static void BM_JsonParse(benchmark::State& state) {
    std::string json_str = R"({"code":"test123","guild_id":"456","channel_id":"789"})";

    for (auto _ : state) {
        auto json = nlohmann::json::parse(json_str);
        benchmark::DoNotOptimize(json);
    }
}
BENCHMARK(BM_JsonParse);

// ============================================================================
// Cache benchmarks
// ============================================================================

static void BM_CacheHit(benchmark::State& state) {
    auto cache = std::make_shared<common::TtlCache<std::string>>(
        std::chrono::seconds(60)
    );
    cache->Put("hot_key", "value");

    for (auto _ : state) {
        auto result = cache->Get("hot_key");
        benchmark::DoNotOptimize(result);
    }
}
BENCHMARK(BM_CacheHit);

static void BM_CacheMiss(benchmark::State& state) {
    auto cache = std::make_shared<common::TtlCache<std::string>>(
        std::chrono::seconds(60)
    );
    // Don't put anything - always miss

    for (auto _ : state) {
        auto result = cache->Get("missing_key");
        benchmark::DoNotOptimize(result);
    }
}
BENCHMARK(BM_CacheMiss);

// ============================================================================
// Random data generation
// ============================================================================

static void BM_RandomStringGeneration(benchmark::State& state) {
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 61);

    const char charset[] =
        "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

    for (auto _ : state) {
        std::string result(16, ' ');
        for (int i = 0; i < 16; ++i) {
            result[i] = charset[dis(gen)];
        }
        benchmark::DoNotOptimize(result);
    }
}
BENCHMARK(BM_RandomStringGeneration);

BENCHMARK_MAIN();

}  // namespace astral::sdk::benchmark