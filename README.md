# Astral App (Astral web version source code)

React 19 + TypeScript frontend for Astral.  
Built with [Rspack](https://rspack.dev/), SWC, MobX, and Lingui i18n.

## Authors

- [**OnyKot**](https://github.com/OnyKot) — Frontend
- [**Ivantech123**](https://github.com/Ivantech123) — Backend

## Languages

- English: [README.md](./README.md)
- Russian: [README.ru.md](./README.ru.md) *(coming soon)*

## Frontend Developer Setup

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd astral-app
```

### 2. Install Node.js and pnpm

Use Node.js 20+ (recommended: latest LTS).

Enable `corepack` and use project pnpm:

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

### 3. Install dependencies

```bash
pnpm install
```

### 4. First-time dev run (required)

```bash
pnpm dev:bootstrap
```

This runs all required code generation steps and starts the dev server.

### 5. Open the app

Open:

```text
http://localhost:3000
```

By default, frontend proxy routes (`/api`, `/gateway`, `/media`, `/s3`) point to `https://astraof.com`.

## Daily Development Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server only (fast path, no bootstrap codegen). |
| `pnpm dev:bootstrap` | Run full bootstrap and start dev server. Use after pulling major changes. |
| `pnpm typecheck` | Run TypeScript checks (`tsc --noEmit`). |
| `pnpm build` | Create a production build in `dist/`. |
| `pnpm test` | Run tests with Vitest. |

## Change Backend Target

If you need to point frontend to another backend, set env vars before running `pnpm dev`.

PowerShell:

```powershell
$env:PUBLIC_BOOTSTRAP_API_ENDPOINT="http://localhost:8080/api"
$env:PUBLIC_BOOTSTRAP_API_PUBLIC_ENDPOINT="http://localhost:8080/api"
pnpm dev
```

cmd:

```cmd
set "PUBLIC_BOOTSTRAP_API_ENDPOINT=http://localhost:8080/api"
set "PUBLIC_BOOTSTRAP_API_PUBLIC_ENDPOINT=http://localhost:8080/api"
pnpm dev
```

bash/zsh:

```bash
PUBLIC_BOOTSTRAP_API_ENDPOINT=http://localhost:8080/api \
PUBLIC_BOOTSTRAP_API_PUBLIC_ENDPOINT=http://localhost:8080/api \
pnpm dev
```

After changing env vars, restart the dev server.

## Common Issues

`ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND`  
You are in the wrong folder. Run commands inside `astral-app/`.

`EADDRINUSE: address already in use :::3000`  
Port `3000` is busy. Stop the existing process or run on another port.

`Cannot find module` errors during startup  
Run:

```bash
pnpm dev:bootstrap
```

## Project Structure (Quick View)

- `src/` - React app source
- `src/stores/` - MobX stores
- `src/components/` - UI components
- `src/actions/` - action creators and side effects
- `src/lib/` - utilities and shared runtime helpers
- `scripts/` - build/codegen tooling

## License

AGPL-3.0. See [LICENSE](../LICENSE).

![Astral](https://i.imgur.com/iRdxdnN.png)

