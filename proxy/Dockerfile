FROM golang:1.25.5-alpine AS build

WORKDIR /build

COPY proxy/go.mod ./
COPY proxy/go.sum* ./
RUN go mod download

COPY proxy/ .

COPY dist/index.html assets/index.html
COPY dist/manifest.json assets/manifest.json
COPY dist/sw.js* assets/
COPY dist/version.json assets/version.json

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
