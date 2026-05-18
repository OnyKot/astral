# astral::common — shared infra for userver services

Interface-only CMake library. No runtime cost — headers only and compile-time
macros baked in by each service's build.

## What it gives you

| Header | What it does |
|--------|--------------|
| `astral/common/build_info.hpp` | `kVersion`, `kBuildId`, `kCommit` — baked in by CMake |
| `astral/common/uptime.hpp` | `ProcessClock::Uptime()` — stable process uptime |
| `astral/common/ttl_cache.hpp` | Thread-safe in-memory TTL cache for hot read-paths |

## How to use

In your service `CMakeLists.txt`:

```cmake
add_subdirectory(${CMAKE_SOURCE_DIR}/../common ${CMAKE_BINARY_DIR}/common)
target_link_libraries(${PROJECT_NAME} PRIVATE astral::common)
```

Pass build info through Docker build args:

```dockerfile
ARG ASTRAL_BUILD_ID=dev
ARG ASTRAL_COMMIT=unknown
ARG ASTRAL_VERSION=0.1.0

RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
    -DASTRAL_BUILD_ID=${ASTRAL_BUILD_ID} \
    -DASTRAL_COMMIT=${ASTRAL_COMMIT} \
    -DASTRAL_VERSION=${ASTRAL_VERSION}
```

In C++:

```cpp
#include <astral/common/build_info.hpp>
#include <astral/common/uptime.hpp>

astral::common::ProcessClock::Init();
LOG_INFO() << "starting " << astral::common::kVersion
           << " build=" << astral::common::kBuildId;
```

## Roadmap

- [ ] `astral/common/logging.hpp` — structured JSON helpers
- [ ] `astral/common/metrics.hpp` — Prometheus counter/histogram helpers
- [ ] `astral/common/clients/` — Scylla / Redis / Postgres / HTTP factories
- [ ] `astral/common/contracts/` — JSON schemas shared with Node API
