FROM ghcr.io/userver-framework/ubuntu-22.04-userver-pg:latest AS builder

ARG ASTRAL_VERSION=0.1.0
ARG ASTRAL_BUILD_ID=dev
ARG ASTRAL_COMMIT=unknown

WORKDIR /src
# Build context = services/, so we get common/ + userver_instance/ as siblings.
COPY common /src_common
COPY userver_instance/CMakeLists.txt ./
COPY userver_instance/src ./src
COPY userver_instance/config ./config

# Expose the sibling common/ at the relative path the CMakeLists expects.
RUN ln -s /src_common /src/../common || true

RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
      -DASTRAL_VERSION=${ASTRAL_VERSION} \
      -DASTRAL_BUILD_ID=${ASTRAL_BUILD_ID} \
      -DASTRAL_COMMIT=${ASTRAL_COMMIT} \
    && cmake --build build --target astral_userver_instance -j $(nproc) \
    && cmake --install build --prefix /opt/astral-userver-instance

FROM ghcr.io/userver-framework/ubuntu-22.04-userver-pg:latest

WORKDIR /opt/astral-userver-instance
COPY --from=builder /opt/astral-userver-instance /opt/astral-userver-instance

# 8080 — public listener (/instance), 8081 — ops listener (metrics/ping).
EXPOSE 8080 8081

CMD ["/opt/astral-userver-instance/bin/astral_userver_instance", \
     "-c", "/opt/astral-userver-instance/etc/astral-userver-instance/static_config.yaml", \
     "--config_vars", "/opt/astral-userver-instance/etc/astral-userver-instance/config_vars.yaml"]
