# Foundation audit evidence

These snapshots support [the audit](../../FOUNDATION-AUDIT-2026-09-06.md).
They are synthetic boundary diagnostics, not production telemetry or model evals.

- `mcp-contract-probe.json`: real installed MCP transport and schemas, injected
  service outcomes, fake authentication, no database calls. It records SDK validation
  failures before delegation and HTTP-200 tool/domain failures.
- `local-db-probe.json`: real hosted handler, domain service and local Postgres with
  injected authentication. An isolated random fixture user is created and removed.
  The only kitchen data in this file is synthetic Mayo/Mayonnaise.
- `*.ts.txt`: exact diagnostic sources, with repository imports made relative to the
  invocation's working directory. Text suffixes keep one-off audit code outside the
  production TypeScript build. They are not maintained CI tests.

To reproduce from the repository root using the installed dependencies:

```sh
cp docs/audits/2026-09-06/mcp-contract-probe.ts.txt /tmp/mise-audit-probe.ts
./node_modules/.bin/tsx --tsconfig tsconfig.json /tmp/mise-audit-probe.ts
```

The contract probe pins its unused database connection to loopback port 1 and replaces
all service delegates; it does not contact an external auth server. It writes its
result to `/tmp/mise-audit-probe.json`.

The following probe **writes isolated test fixtures to the local database** and requires
the existing local Supabase stack and seeded roles/passwords. Its URLs are hard-coded
to `127.0.0.1:54322`; never adapt it to production credentials.

```sh
cp docs/audits/2026-09-06/local-db-probe.ts.txt /tmp/mise-audit-local-db.ts
./node_modules/.bin/tsx --tsconfig tsconfig.json /tmp/mise-audit-local-db.ts
```

It writes `/tmp/mise-audit-local-db.json`. The `finally` block removes the fixture item
and user. Local item sequences may advance, which is expected. A process killed before
cleanup may leave its `@audit.invalid` fixture user; inspect before removing any rows.

Original run: baseline `c4debb6`, Node 26.8.1. The project specifies Node 24; run on
that runtime when promoting these cases into maintained tests. No model inference,
production write, or authenticated ChatGPT host session is included in these results.
