# Astral userver common — shared interface library for all C++ services.
#
# Usage in a service CMakeLists.txt:
#   add_subdirectory(${CMAKE_SOURCE_DIR}/../common ${CMAKE_BINARY_DIR}/common)
#   target_link_libraries(<target> PRIVATE astral::common)

cmake_minimum_required(VERSION 3.22)

project(astral_common CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(astral_common INTERFACE)
add_library(astral::common ALIAS astral_common)

target_include_directories(astral_common INTERFACE
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
)

# Build-time build info — every service may pass -DASTRAL_BUILD_ID=... -DASTRAL_COMMIT=...
# through its Dockerfile build args. Defaults come from env or "dev".
if(NOT DEFINED ASTRAL_BUILD_ID)
    set(ASTRAL_BUILD_ID "dev" CACHE STRING "Build identifier")
endif()
if(NOT DEFINED ASTRAL_COMMIT)
    set(ASTRAL_COMMIT "unknown" CACHE STRING "Git commit SHA")
endif()
if(NOT DEFINED ASTRAL_VERSION)
    set(ASTRAL_VERSION "0.1.0" CACHE STRING "Service version")
endif()

target_compile_definitions(astral_common INTERFACE
    ASTRAL_BUILD_ID="${ASTRAL_BUILD_ID}"
    ASTRAL_COMMIT="${ASTRAL_COMMIT}"
    ASTRAL_VERSION="${ASTRAL_VERSION}"
)
