// Astral common build info — constants baked in at compile time from CMake.
// See services/common/CMakeLists.txt for how they are populated.

#pragma once

#include <string_view>

namespace astral::common {

#ifndef ASTRAL_BUILD_ID
#define ASTRAL_BUILD_ID "dev"
#endif

#ifndef ASTRAL_COMMIT
#define ASTRAL_COMMIT "unknown"
#endif

#ifndef ASTRAL_VERSION
#define ASTRAL_VERSION "0.0.0"
#endif

inline constexpr std::string_view kBuildId = ASTRAL_BUILD_ID;
inline constexpr std::string_view kCommit = ASTRAL_COMMIT;
inline constexpr std::string_view kVersion = ASTRAL_VERSION;

}  // namespace astral::common
