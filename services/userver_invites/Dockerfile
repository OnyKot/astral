FROM ghcr.io/userver-framework/ubuntu-22.04-userver-pg:latest AS builder

ARG ASTRAL_VERSION=0.1.0
ARG ASTRAL_BUILD_ID=dev
ARG ASTRAL_COMMIT=unknown

WORKDIR /src
COPY common /src_common
COPY userver_invites/CMakeLists.txt ./
COPY userver_invites/src ./src
COPY userver_invites/config ./config

RUN ln -s /src_common /src/../common || true

RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
      -DASTRAL_VERSION=${ASTRAL_VERSION} \
      -DASTRAL_BUILD_ID=${ASTRAL_BUILD_ID} \
      -DASTRAL_COMMIT=${ASTRAL_COMMIT} \
    && cmake --build build --target astral_userver_invites -j $(nproc) \
    && cmake --install build --prefix /opt/astral-userver-invites

FROM ghcr.io/userver-framework/ubuntu-22.04-userver-pg:latest

WORKDIR /opt/astral-userver-invites
COPY --from=builder /opt/astral-userver-invites /opt/astral-userver-invites

EXPOSE 8080 8081

CMD ["/opt/astral-userver-invites/bin/astral_userver_invites", \
     "-c", "/opt/astral-userver-invites/etc/astral-userver-invites/static_config.yaml", \
     "--config_vars", "/opt/astral-userver-invites/etc/astral-userver-invites/config_vars.yaml"]
