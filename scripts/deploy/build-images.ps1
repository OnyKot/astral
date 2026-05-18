param(
  [string]$Registry = "ghcr.io/your-org",
  [string]$Tag = "latest",
  [switch]$Push
)

$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ge 7) {
  $PSNativeCommandUseErrorActionPreference = $true
}

function Invoke-Native {
  param(
    [string]$Command,
    [string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $Command $($Arguments -join ' ')"
  }
}

function Build-Image {
  param(
    [string]$Name,
    [string]$Context,
    [string]$Dockerfile,
    [string[]]$BuildArgs = @()
  )

  $image = "$Registry/$Name`:$Tag"
  Write-Host "==> Building $image"

  $args = @("build", "-t", $image, "-f", $Dockerfile)
  foreach ($arg in $BuildArgs) {
    $args += @("--build-arg", $arg)
  }
  $args += $Context

  Invoke-Native -Command "docker" -Arguments $args

  if ($Push) {
    Write-Host "==> Pushing $image"
    Invoke-Native -Command "docker" -Arguments @("push", $image)
  }
}

Write-Host "==> Preparing frontend dist for app-proxy image"
$repoRoot = (Get-Location).Path
$frontendBuildCmd = @(
  'set -euo pipefail',
  'apt-get update',
  'apt-get install -y --no-install-recommends ca-certificates curl build-essential pkg-config libssl-dev',
  'update-ca-certificates',
  'curl --http1.1 -fsSL --retry 6 --retry-delay 2 --retry-all-errors https://go.dev/dl/go1.25.5.linux-amd64.tar.gz -o /tmp/go.tar.gz',
  'rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tar.gz',
  'export PATH="/usr/local/go/bin:$PATH"',
  'curl --http1.1 -fsSL --retry 6 --retry-delay 2 --retry-all-errors https://sh.rustup.rs | sh -s -- -y',
  'export PATH="$HOME/.cargo/bin:$PATH"',
  'rustup target add wasm32-unknown-unknown',
  'cargo install wasm-pack --version 0.13.1 --locked',
  'npm install -g pnpm@10.26.0',
  'pnpm install --frozen-lockfile',
  'pnpm wasm:codegen',
  'pnpm generate:colors',
  'pnpm generate:masks',
  'pnpm generate:css-types',
  'pnpm lingui:compile',
  'rm -rf dist',
  'pnpm exec rspack build --mode production',
  'npx tsx scripts/build-sw.mjs',
  'if [ ! -f dist/version.json ]; then echo "{\"sha\":\"local\",\"buildNumber\":0,\"timestamp\":0,\"env\":\"local\"}" > dist/version.json; fi'
) -join " && "

Invoke-Native -Command "docker" -Arguments @(
  "run",
  "--rm",
  "-e", "CI=true",
  "-v", "${repoRoot}:/workspace",
  "-w", "/workspace/astral_app",
  "node:24-bookworm-slim",
  "bash",
  "-lc",
  $frontendBuildCmd
)

$buildTs = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()

Build-Image -Name "astral-api" -Context "astral_api" -Dockerfile "astral_api/Dockerfile"
Build-Image -Name "astral-gateway" -Context "astral_gateway" -Dockerfile "astral_gateway/Dockerfile"
Build-Image -Name "astral-media-proxy" -Context "astral_media_proxy" -Dockerfile "astral_media_proxy/Dockerfile"
Build-Image -Name "astral-marketing" -Context "astral_marketing" -Dockerfile "astral_marketing/Dockerfile" -BuildArgs @("BUILD_TIMESTAMP=$buildTs")
Build-Image -Name "astral-metrics" -Context "astral_metrics" -Dockerfile "astral_metrics/Dockerfile"
Build-Image -Name "astral-app-proxy" -Context "." -Dockerfile "astral_app/proxy/Dockerfile"

Write-Host "Done. Tag: $Tag"
