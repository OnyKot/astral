// Astral SDK — Structured JSON logging.
//
// Features:
// - Structured JSON output for log aggregation systems (ELK, Loki)
// - Request tracing with request_id propagation
// - Performance metadata (latency, status codes)
// - Configurable log levels
//
// Usage:
//   #include <astral/sdk/logging.hpp>
//
//   using namespace astral::sdk::logging;
//
//   Log(Level::Info, {
//       .service = "userver_invites",
//       .request_id = "abc123",
//       .message = "Invite resolved",
//       .fields = {{"code", "xyz"}, {"duration_ms", "5"}}
//   });

#ifndef ASTRAL_SDK_LOGGING_HPP
#define ASTRAL_SDK_LOGGING_HPP

#include <nlohmann/json.hpp>

#include <chrono>
#include <iostream>
#include <optional>
#include <source_location>
#include <sstream>
#include <string>
#include <string_view>
#include <unordered_map>
#include <utility>

namespace astral::sdk::logging {

// Log severity levels (compatible with popular log aggregators)
enum class Level {
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3,
    Fatal = 4
};

constexpr std::string_view LevelToString(Level level) {
    switch (level) {
        case Level::Debug: return "debug";
        case Level::Info:  return "info";
        case Level::Warn:  return "warn";
        case Level::Error: return "error";
        case Level::Fatal: return "fatal";
        default: return "unknown";
    }
}

// Main log entry structure
struct Entry {
    // Timestamp (ISO8601 format)
    std::chrono::system_clock::time_point timestamp;

    // Severity
    Level level = Level::Info;

    // Service identification
    std::string service;

    // Request tracing
    std::optional<std::string> request_id;
    std::optional<std::string> trace_id;

    // Message
    std::string message;

    // Structured fields (key-value pairs)
    std::unordered_map<std::string, std::string> fields;

    // Source location (optional, for DEBUG level)
    std::optional<std::string> source_file;
    int source_line = 0;
    std::optional<std::string> function_name;
};

// Global logger state
class Logger {
public:
    static Logger& Instance() {
        static Logger instance;
        return instance;
    }

    // Configure logger
    void SetLevel(Level level) { min_level_ = level; }
    void SetService(std::string service) { default_service_ = std::move(service); }
    void SetOutput(std::ostream& output) { output_ = &output; }
    void SetJsonFormat(bool json) { json_format_ = json; }

    // Log an entry
    void Log(Entry entry) {
        if (entry.level < min_level_) return;

        if (json_format_) {
            LogJson(std::move(entry));
        } else {
            LogText(std::move(entry));
        }
    }

    // Convenience log methods
    void Debug(std::string_view message, std::unordered_map<std::string, std::string> fields = {},
               std::source_location location = std::source_location::current());
    void Info(std::string_view message, std::unordered_map<std::string, std::string> fields = {});
    void Warn(std::string_view message, std::unordered_map<std::string, std::string> fields = {});
    void Error(std::string_view message, std::unordered_map<std::string, std::string> fields = {},
               std::source_location location = std::source_location::current());

private:
    Logger() = default;

    void LogJson(Entry entry);
    void LogText(Entry entry);

    Level min_level_ = Level::Info;
    std::string default_service_;
    std::ostream* output_ = &std::cout;
    bool json_format_ = true;
};

// ============================================================================
// Log entry construction helpers
// ============================================================================

// Fluent builder for log entry
class EntryBuilder {
public:
    EntryBuilder& WithRequestId(std::string id) {
        entry_.request_id = std::move(id);
        return *this;
    }

    EntryBuilder& WithTraceId(std::string id) {
        entry_.trace_id = std::move(id);
        return *this;
    }

    EntryBuilder& WithField(std::string key, std::string value) {
        entry_.fields[std::move(key)] = std::move(value);
        return *this;
    }

    EntryBuilder& WithField(std::string key, int value) {
        entry_.fields[std::move(key)] = std::to_string(value);
        return *this;
    }

    EntryBuilder& WithField(std::string key, int64_t value) {
        entry_.fields[std::move(key)] = std::to_string(value);
        return *this;
    }

    EntryBuilder& WithField(std::string key, double value) {
        entry_.fields[std::move(key)] = std::to_string(value);
        return *this;
    }

    EntryBuilder& WithField(std::string key, bool value) {
        entry_.fields[std::move(key)] = value ? "true" : "false";
        return *this;
    }

    EntryBuilder& WithDuration(int64_t duration_ms) {
        entry_.fields["duration_ms"] = std::to_string(duration_ms);
        return *this;
    }

    EntryBuilder& WithStatus(int status) {
        entry_.fields["status"] = std::to_string(status);
        return *this;
    }

    EntryBuilder& WithService(std::string service) {
        entry_.service = std::move(service);
        return *this;
    }

    Entry&& Build() && { return std::move(entry_); }

private:
    Entry entry_;
};

// Main logging function
inline void Log(Level level, Entry entry) {
    Logger::Instance().Log(std::move(entry));
}

// ============================================================================
// Convenience macros
// ============================================================================

// Human-readable logging (sets service automatically from __FILE__)
#define SDK_LOG_DEBUG(msg, ...) \
    astral::sdk::logging::Logger::Instance().Debug(msg, __VA_ARGS__)
#define SDK_LOG_INFO(msg, ...) \
    astral::sdk::logging::Logger::Instance().Info(msg, __VA_ARGS__)
#define SDK_LOG_WARN(msg, ...) \
    astral::sdk::logging::Logger::Instance().Warn(msg, __VA_ARGS__)
#define SDK_LOG_ERROR(msg, ...) \
    astral::sdk::logging::Logger::Instance().Error(msg, __VA_ARGS__)

// Structured logging with fluent API
#define SDK_LOG_SCOPED(level) \
    astral::sdk::logging::Log(level, \
        astral::sdk::logging::EntryBuilder{} \
            .WithService("userver_invites") \
            .Build() \
    )

// ============================================================================
// Implementation
// ============================================================================

inline void Logger::Debug(std::string_view message,
                          std::unordered_map<std::string, std::string> fields,
                          std::source_location location) {
    Entry entry;
    entry.level = Level::Debug;
    entry.message = std::string{message};
    entry.fields = std::move(fields);
    entry.timestamp = std::chrono::system_clock::now();

    if (!default_service_.empty()) entry.service = default_service_;

    // Add source location for debug
    if (location.file_name()) {
        entry.source_file = location.file_name();
        entry.source_line = location.line();
        entry.function_name = location.function_name();
    }

    Log(std::move(entry));
}

inline void Logger::Info(std::string_view message,
                         std::unordered_map<std::string, std::string> fields) {
    Entry entry;
    entry.level = Level::Info;
    entry.message = std::string{message};
    entry.fields = std::move(fields);
    entry.timestamp = std::chrono::system_clock::now();

    if (!default_service_.empty()) entry.service = default_service_;

    Log(std::move(entry));
}

inline void Logger::Warn(std::string_view message,
                         std::unordered_map<std::string, std::string> fields) {
    Entry entry;
    entry.level = Level::Warn;
    entry.message = std::string{message};
    entry.fields = std::move(fields);
    entry.timestamp = std::chrono::system_clock::now();

    if (!default_service_.empty()) entry.service = default_service_;

    Log(std::move(entry));
}

inline void Logger::Error(std::string_view message,
                          std::unordered_map<std::string, std::string> fields,
                          std::source_location location) {
    Entry entry;
    entry.level = Level::Error;
    entry.message = std::string{message};
    entry.fields = std::move(fields);
    entry.timestamp = std::chrono::system_clock::now();

    if (!default_service_.empty()) entry.service = default_service_;

    // Add source location for errors
    if (location.file_name()) {
        entry.source_file = location.file_name();
        entry.source_line = location.line();
        entry.function_name = location.function_name();
    }

    Log(std::move(entry));
}

inline void Logger::LogJson(Entry entry) {
    nlohmann::json json;

    // ISO8601 timestamp
    auto time_t = std::chrono::system_clock::to_time_t(entry.timestamp);
    char buf[64];
    std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", std::gmtime(&time_t));
    json["ts"] = buf;

    json["level"] = std::string{LevelToString(entry.level)};
    json["service"] = entry.service.empty() ? default_service_ : entry.service;
    json["msg"] = entry.message;

    if (entry.request_id) json["request_id"] = *entry.request_id;
    if (entry.trace_id) json["trace_id"] = *entry.trace_id;
    if (entry.source_file) {
        json["source"] = *entry.source_file + ":" + std::to_string(entry.source_line);
        if (entry.function_name) json["fn"] = *entry.function_name;
    }

    // Structured fields
    if (!entry.fields.empty()) {
        json["fields"] = entry.fields;
    }

    *output_ << json.dump() << '\n';
}

inline void Logger::LogText(Entry entry) {
    auto time_t = std::chrono::system_clock::to_time_t(entry.timestamp);
    char buf[64];
    std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", std::gmtime(&time_t));

    *output_ << '[' << buf << "] "
             << LevelToString(entry.level) << " ["
             << (entry.service.empty() ? default_service_ : entry.service) << "] "
             << entry.message;

    if (entry.request_id) *output_ << " request_id=" << *entry.request_id;

    for (const auto& [k, v] : entry.fields) {
        *output_ << ' ' << k << '=' << v;
    }

    if (entry.source_file) {
        *output_ << " (" << *entry.source_file << ':' << entry.source_line << ')';
    }

    *output_ << '\n';
}

}  // namespace astral::sdk::logging

#endif  // ASTRAL_SDK_LOGGING_HPP