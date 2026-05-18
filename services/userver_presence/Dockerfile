FROM ghcr.io/userver-framework/ubuntu-22.04-userver-pg:latest AS builder

ARG ASTRAL_VERSION=0.1.0
ARG ASTRAL_BUILD_ID=dev
ARG ASTRAL_COMMIT=unknown

WORKDIR /src
COPY common /src_common
COPY userver_presence/CMakeLists.txt ./
COPY userver_presence/src ./src
COPY userver_presence/config ./config

RUN ln -s /src_common /src/../common || true

RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
      -DASTRAL_VERSION=${ASTRAL_VERSION} \
      -DASTRAL_BUILD_ID=${ASTRAL_BUILD_ID} \
      -DASTRAL_COMMIT=${ASTRAL_COMMIT} \
    && cmake --build build --target astral_userver_presence -j $(nproc) \
    && cmake --install build --prefix /opt/astral-userver-presence

FROM ghcr.io/userver-framework/ubuntu-22.04-userver-pg:latest

WORKDIR /opt/astral-userver-presence
COPY --from=builder /opt/astral-userver-presence /opt/astral-userver-presence

EXPOSE 8080 8081

CMD ["/opt/astral-userver-presence/bin/astral_userver_presence", \
     "-c", "/opt/astral-userver-presence/etc/astral-userver-presence/static_config.yaml", \
     "--config_vars", "/opt/astral-userver-presence/etc/astral-userver-presence/config_vars.yaml"]
