cmake_minimum_required(VERSION 3.22)

project(astral_userver_instance CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(userver COMPONENTS core REQUIRED)

add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../common ${CMAKE_BINARY_DIR}/_common)

add_executable(${PROJECT_NAME}
    src/instance_handler.cpp
    src/instance_handler.hpp
    src/instance_config.cpp
    src/instance_config.hpp
    src/main.cpp
)

target_link_libraries(${PROJECT_NAME}
    PRIVATE
        userver::core
        astral::common
)
target_include_directories(${PROJECT_NAME} PRIVATE src)

install(TARGETS ${PROJECT_NAME} DESTINATION bin)
install(FILES
    config/static_config.yaml
    config/config_vars.yaml
    DESTINATION etc/astral-userver-instance
)
