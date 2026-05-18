# Astral Server Deploy (Docker Images)

## 1) Build all images

From repo root:

```powershell
pwsh ./scripts/deploy/build-images.ps1 -Registry ghcr.io/<your-org> -Tag 2026.02.20
```

For a bridge desktop release before moving to `astraof.com`:

```powershell
$env:ASTRAL_ELECTRON_STABLE_APP_URL='https://astraof.com'
$env:ASTRAL_ELECTRON_TRUSTED_APP_URLS='https://asrtal.ru,https://astraof.com'
$env:ASTRAL_ELECTRON_UPDATE_ORIGINS='https://api.asrtal.ru,https://api.astraof.com'
pwsh ./scripts/deploy/build-images.ps1 -Registry ghcr.io/<your-org> -Tag 2026.03.10-bridge
```

Notes:
- Publish the bridge desktop build before switching traffic to the new domain.
- Keep `api.asrtal.ru` online until users have received the bridge build.

To also push:

```powershell
docker login ghcr.io
pwsh ./scripts/deploy/build-images.ps1 -Registry ghcr.io/<your-org> -Tag 2026.02.20 -Push
```

## 2) Required runtime flags for "all premium features free"

Set these on the server (API env):

```env
STRIPE_ENABLED=false
FREE_PREMIUM=true
CAPTCHA_ENABLED=true
CAPTCHA_PRIMARY_PROVIDER=turnstile
```

Notes:
- `FREE_PREMIUM=true` makes premium checks pass for all users.
- `STRIPE_ENABLED=false` disables subscription purchase flow.

## 3) Pull and run on server

Example (adjust image tags to your registry):

```bash
docker pull ghcr.io/<your-org>/astral-api:2026.02.20
docker pull ghcr.io/<your-org>/astral-app-proxy:2026.02.20
docker pull ghcr.io/<your-org>/astral-gateway:2026.02.20
docker pull ghcr.io/<your-org>/astral-media-proxy:2026.02.20
docker pull ghcr.io/<your-org>/astral-marketing:2026.02.20
docker pull ghcr.io/<your-org>/astral-admin:2026.02.20
docker pull ghcr.io/<your-org>/astral-metrics:2026.02.20
```

Then update your compose/swarm stack image tags and redeploy.

## 4) Automated stack recovery watchdog

For single-server deployments like `/opt/Astral-clean`, you can install the watchdog that checks the public entrypoints and container states and automatically recovers the stack if it starts returning `502` or loses critical services.

Files:

- `scripts/deploy/recover-stack.sh`
- `scripts/deploy/stack-watchdog.sh`
- `scripts/deploy/ensure-swap.sh`
- `scripts/deploy/memory-guard.sh`
- `scripts/deploy/server-health-report.sh`
- `deploy/systemd/astral-stack-watchdog.service`
- `deploy/systemd/astral-memory-guard.service`

Install on the server:

```bash
sudo chmod +x /opt/Astral-clean/scripts/deploy/*.sh
sudo /opt/Astral-clean/scripts/deploy/ensure-swap.sh
sudo cp /opt/Astral-clean/deploy/systemd/astral-stack-watchdog.service /etc/systemd/system/astral-stack-watchdog.service
sudo cp /opt/Astral-clean/deploy/systemd/astral-memory-guard.service /etc/systemd/system/astral-memory-guard.service
sudo systemctl daemon-reload
sudo systemctl enable --now astral-stack-watchdog.service astral-memory-guard.service
```

Useful commands:

```bash
sudo systemctl status astral-stack-watchdog.service
sudo systemctl status astral-memory-guard.service
sudo journalctl -u astral-stack-watchdog.service -f
/opt/Astral-clean/scripts/deploy/recover-stack.sh --check-only
/opt/Astral-clean/scripts/deploy/recover-stack.sh --recover
/opt/Astral-clean/scripts/deploy/memory-guard.sh --once
/opt/Astral-clean/scripts/deploy/server-health-report.sh
```

What it does:

- checks critical containers (`caddy`, `api`, `gateway`, `livekit`, databases, storage, search, metrics, userver services);
- checks public endpoints (`/`, `/channels/@me`, `/api/instance`, `/livekit/`, `/userver/health`);
- if failures repeat, it brings infra up first, then app-tier services, then restarts key dependents (`api`, `worker`, `gateway`, `livekit`, `metrics`, `caddy`) and re-validates the stack;
- enables persistent swap and keeps `vm.swappiness=10`;
- logs memory pressure snapshots to `/var/log/astral-memory-guard.log`;
- restarts heavy stateless services first when free memory drops below the configured threshold.
