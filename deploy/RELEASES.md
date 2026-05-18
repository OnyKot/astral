# Branching, Deploys, and Releases

Current production branch: `production`.

## Production deploy flow

1. Push to `production`.
2. GitHub Actions runs `prod branch sync`.
3. The workflow detects changed files, syncs only those files to `/opt/Astral-clean`, backs up the touched files on the server, rebuilds or restarts only affected compose services, and runs health checks.
4. The deploy report is available in the GitHub Actions run summary and as the `prod-deploy-report` artifact.

Automatic deletion of removed files on the server is intentionally disabled. Deleted files are listed in the report so they can be removed manually after review.

## Release flow

Use the `release` workflow from GitHub Actions:

1. Run `release` manually.
2. Set `tag` to the release version, for example `v1.2.18`.
3. Keep `target` as `production` unless a different branch or commit is being released.
4. The workflow runs frontend typecheck and gateway compile, creates the tag if needed, and publishes a GitHub Release with generated release notes.

For releases created outside the workflow, pushing a tag matching `v*` also publishes a GitHub Release.

## Branch hygiene

- Feature work should happen in short-lived `feat/...` or `fix/...` branches.
- `production` is the current production branch for the private repository.
- Do not delete remote branches until their latest commits are either merged, tagged, or explicitly declared obsolete.
- Temporary local worktrees can be pruned with `git worktree prune`; this does not delete active branches.

## Reports and notifications

The deploy workflow always writes a GitHub Actions summary. It also uploads:

- `ci-cd-report`: changed files and the computed service plan.
- `prod-deploy-report`: changed files, service plan, and server health report.

Telegram notifications are optional. Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` repository secrets to enable them.
