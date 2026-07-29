# CMakeLists.txt for SDK unit tests
cmake_minimum_required(VERSION 3.22)

project(astral_sdk_tests CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(GTest REQUIRED)

add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/.. ${CMAKE_BINARY_DIR}/_common)

add_executable(astral_sdk_tests
    tests/sdk_test.cpp
)

target_link_libraries(astral_sdk_tests
    PRIVATE
        GTest::gtest
        GTest::gtest_main
        astral::common
)

include(GoogleTest)
gtest_discover_tests(astral_sdk_tests)

# Enable testing
enable_testing()