FROM ghcr.io/userver-framework/ubuntu-22.04-userver-pg:latest AS builder

# Build metadata — defaults keep dev builds reproducible; docker compose /
# CI can pass --build-arg ASTRAL_COMMIT=$(git rev-parse HEAD) etc.
ARG ASTRAL_VERSION=0.1.0
ARG ASTRAL_BUILD_ID=dev
ARG ASTRAL_COMMIT=unknown

WORKDIR /src
# common/ is a sibling directory (see services/common/CMakeLists.txt). We copy
# it so the service build can add_subdirectory(../common).
COPY common /src_common
COPY userver_health/CMakeLists.txt ./
COPY userver_health/src ./src
COPY userver_health/config ./config

# The service CMakeLists uses `${CMAKE_CURRENT_SOURCE_DIR}/../common` — make
# that path resolve by symlinking the sibling we copied above.
RUN ln -s /src_common /src/../common || true

RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
      -DASTRAL_VERSION=${ASTRAL_VERSION} \
      -DASTRAL_BUILD_ID=${ASTRAL_BUILD_ID} \
      -DASTRAL_COMMIT=${ASTRAL_COMMIT} \
    && cmake --build build --target astral_userver_health -j $(nproc) \
    && cmake --install build --prefix /opt/astral-userver-health

FROM ghcr.io/userver-framework/ubuntu-22.04-userver-pg:latest

WORKDIR /opt/astral-userver-health
COPY --from=builder /opt/astral-userver-health /opt/astral-userver-health

# 8080 — public listener, 8081 — ops listener (metrics/ping/info).
EXPOSE 8080 8081

CMD ["/opt/astral-userver-health/bin/astral_userver_health", \
     "-c", "/opt/astral-userver-health/etc/astral-userver-health/static_config.yaml", \
     "--config_vars", "/opt/astral-userver-health/etc/astral-userver-health/config_vars.yaml"]
