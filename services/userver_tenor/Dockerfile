FROM ghcr.io/userver-framework/ubuntu-22.04-userver-pg:latest AS builder

ARG ASTRAL_VERSION=0.1.0
ARG ASTRAL_BUILD_ID=dev
ARG ASTRAL_COMMIT=unknown

WORKDIR /src

COPY common /src_common
COPY userver_tenor/CMakeLists.txt ./
COPY userver_tenor/src ./src
COPY userver_tenor/config ./config

RUN ln -s /src_common /src/../common || true

RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
      -DASTRAL_VERSION=${ASTRAL_VERSION} \
      -DASTRAL_BUILD_ID=${ASTRAL_BUILD_ID} \
      -DASTRAL_COMMIT=${ASTRAL_COMMIT} \
    && cmake --build build --target astral_userver_tenor -j $(nproc) \
    && cmake --install build --prefix /opt/astral-userver-tenor

FROM ghcr.io/userver-framework/ubuntu-22.04-userver-pg:latest

WORKDIR /opt/astral-userver-tenor
COPY --from=builder /opt/astral-userver-tenor /opt/astral-userver-tenor

EXPOSE 8080 8081

CMD ["/opt/astral-userver-tenor/bin/astral_userver_tenor", \
     "-c", "/opt/astral-userver-tenor/etc/astral-userver-tenor/static_config.yaml", \
     "--config_vars", "/opt/astral-userver-tenor/etc/astral-userver-tenor/config_vars.yaml"]
