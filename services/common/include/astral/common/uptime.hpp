// Astral common — process uptime helper.

#pragma once

#include <chrono>

namespace astral::common {

// Singleton-like accessor for the process start time. The first call
// (typically from main() before DaemonMain) anchors the clock; later calls
// just return the anchored value, so Uptime() is stable across threads.
class ProcessClock final {
public:
    static void Init() noexcept { StartTime(); }

    static std::chrono::steady_clock::duration Uptime() noexcept {
        return std::chrono::steady_clock::now() - StartTime();
    }

    static std::chrono::seconds UptimeSeconds() noexcept {
        return std::chrono::duration_cast<std::chrono::seconds>(Uptime());
    }

private:
    static std::chrono::steady_clock::time_point StartTime() noexcept {
        static const auto start = std::chrono::steady_clock::now();
        return start;
    }
};

}  // namespace astral::common
