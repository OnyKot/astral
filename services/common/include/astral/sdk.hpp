// Astral SDK — Core namespace for all Astral C++ SDK components.
//
// This namespace provides:
// - ScyllaDB client with connection pool
// - Redis client with pub/sub and pipelines
// - Structured JSON logging
// - Prometheus-compatible metrics
// - Type-safe JSON contracts
// - Thread-safe caching utilities
//
// Usage:
//   #include <astral/sdk/scylla.hpp>
//   #include <astral/sdk/contracts/invite.hpp>

#ifndef ASTRAL_SDK_HPP
#define ASTRAL_SDK_HPP

// Version info
#define ASTRAL_SDK_VERSION_MAJOR 1
#define ASTRAL_SDK_VERSION_MINOR 0
#define ASTRAL_SDK_VERSION_PATCH 0

// Sub-modules (to be included individually as needed)
#include <astral/sdk/scylla.hpp>
#include <astral/sdk/logging.hpp>
#include <astral/sdk/metrics.hpp>
#include <astral/sdk/cache.hpp>

// Contracts
#include <astral/sdk/contracts/invite.hpp>

#endif  // ASTRAL_SDK_HPP