# Environments and configuration

Reviewed 2026-09-07 against package scripts, `vitest.config.ts`, CI, and the
[deployment runbook](MCP-DEPLOYMENT.md). This replaces the obsolete native-chat
provider/Redis plan. Git history preserves the earlier learning narrative.

| Runtime | Configuration source | Data boundary |
| --- | --- | --- |
| Local website | Doppler `meal-prep/dev` via `pnpm dev` | Local Supabase |
| Unit/integration tests | `vitest.config.ts` pins database URLs | Local fixtures; unit suite needs no DB |
| CI | Workflow environment and local Supabase | Disposable runner data |
| Vercel Preview | Credential-free by current policy | Build/routing checks, no authenticated data rehearsal |
| Vercel production | Doppler `meal-prep/prd` synced to Vercel | Production; installed MCP and website |
| Separate Worker | Wrangler bindings/secrets | Independently configured and deployed; not the installed endpoint |

## Rules that affect daily work

- Keep `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and the matching publishable
  key pointed at the same environment. Check configuration before running; the
  labels `local` and `preview` are not a technical guarantee of isolation.
- Doppler supplies process variables; do not assume `.env.local` overrides them.
  Worktrees need their own Doppler setup. See [setup](../README.md).
- Application SQL uses the non-owner `mise_app` role. `ADMIN_DATABASE_URL` is
  limited to migrations and fixture setup/inspection/cleanup. Preserve the
  transactional user context and RLS boundary in `src/lib/db.ts`.
- Automated writes use local synthetic users. Do not inject production secrets
  into tests or Preview. An intentionally hosted dogfood session is separate
  from automated testing and needs a named, authorized action.
- The default production connector is Vercel `/mcp`. `MCP_PUBLIC_URL` must match
  each serving endpoint exactly. Deploying the Worker does not move the connector.
- Local integration tests share the local Supabase instance with manual work.
  Use their fixture cleanup; do not reset the database to fix routine config.
- There is no native-chat model provider or Redis dependency in the current
  application. `OPENAI_API_KEY` is for the separate local evaluation runner;
  evaluation commands spend API credits and pin their database to local fixtures.
- Telemetry configuration and rotation live in [OBSERVABILITY.md](OBSERVABILITY.md).
  Do not duplicate credentials or ingestion settings in this document.

## Deployment and future staging

Vercel auto-deploys `main`; CI applies migrations after its checks. These are
separate jobs, so verify the database/application rollout order for dependent
changes. Worker deployment is explicit. See [MCP-DEPLOYMENT.md](MCP-DEPLOYMENT.md).

A data-backed staging environment is deferred. Add one when authenticated branch
rehearsal is needed, with its own complete database/Auth configuration and
synthetic data. Provider pricing and plan eligibility must be verified then.
