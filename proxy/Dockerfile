FROM golang:1.25.5-alpine AS build

WORKDIR /build

COPY astral_app/proxy/go.mod ./
COPY astral_app/proxy/go.sum* ./
RUN go mod download

COPY astral_app/proxy/ .

COPY astral_app/dist/index.html assets/index.html
COPY astral_app/dist/manifest.json assets/manifest.json
COPY astral_app/dist/sw.js* assets/
COPY astral_app/dist/version.json assets/version.json

ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -o astral-app-proxy

FROM alpine:3.19

RUN apk add --no-cache ca-certificates curl

WORKDIR /app

COPY --from=build /build/astral-app-proxy /app/astral-app-proxy

USER nobody

EXPOSE 8080
ENV PORT=8080

ENTRYPOINT ["/app/astral-app-proxy"]
