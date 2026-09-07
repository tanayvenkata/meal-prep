# Mise MCP app guidance

This directory contains Mise's MCP server. Keep changes small and teach the
protocol boundary before adding product complexity.

## Foundation review — 2026-09-06

The tool surface and architectural choices below describe the current implementation.
They are a baseline to test, not permanent constraints on the user-requested redesign.
See `docs/FOUNDATION-AUDIT-2026-09-06.md` for findings and proposed comparisons.
Preserve authentication, ownership, and user data through changes; revise tool count,
quantity semantics, interaction design, and SDK adapters when evidence supports it.
Keep focused unit tests, and also test representative MCP-to-real-database round trips.
The local evaluation loop is documented in `evals/kitchen/README.md`. Preserve
exact, descriptive, and unknown quantity writes in pantry add/update; omit an
update field to leave it unchanged. Relative operations still require explicit
structured quantities. Evaluate schema alternatives on the same versioned cases
and record regressions as well as improvements; model evaluations do not replace
actual ChatGPT host acceptance or OAuth tests.
The public transport decorator records final MCP outcomes, including failures
outside service callbacks; service spans record command outcomes separately.
Keep telemetry limited to server-owned operation names, bounded outcomes, timing,
and correlation IDs. Never export arguments, results, identities, or raw exception
text. See `docs/OBSERVABILITY.md` for the collector and verification commands.

## Docs-first and SDK-first rule

Before changing MCP transport, ChatGPT Apps behavior, widget bridge code, tool
metadata, or OAuth/account-linking behavior:

1. Read the current official OpenAI Apps SDK guidance relevant to the task,
   especially [Build your MCP server](https://developers.openai.com/apps-sdk/build/mcp-server),
   [Authentication](https://developers.openai.com/apps-sdk/build/auth), and the
   [Apps SDK reference](https://developers.openai.com/apps-sdk/reference).
2. When Supabase auth, RLS, or token behavior is involved, also check the
   current official Supabase documentation for that feature.
3. Inspect the versions installed in this repository and the helpers they
   actually export. The installed package API is the implementation contract;
   examples written for a different version are only guidance.
4. Inventory official SDK helpers and examples before writing protocol,
   authentication, or bridge plumbing. Default to the official MCP SDK v2
   modular packages (`@modelcontextprotocol/server`, `@modelcontextprotocol/core`,
   `@modelcontextprotocol/node`, `@modelcontextprotocol/express`, etc.) and Apps
   SDK UI primitives when they cover the required behavior.

Custom protocol or authentication code is allowed only when the official
helper cannot preserve required behavior. Keep the adapter narrow, explain the
gap in a nearby comment or durable issue/PR note, and add a wire-level contract
test that would fail if the interoperability behavior regresses. Import SDKs
that production code relies on as direct dependencies, not undeclared
transitive dependencies.

## Architecture

- Treat core MCP as the tool and data contract. The current Mise surface is
  intentionally tool-only: do not attach a UI resource to `get_kitchen_context`.
  Treat any future MCP App as an optional extension with an independently useful
  interaction, not a prerequisite for kitchen reads or writes.
- Target ChatGPT first. If a future workflow earns a widget, use the standard MCP Apps
  bridge from `@modelcontextprotocol/ext-apps` and do not hand-roll the initialization
  handshake with raw `postMessage` calls.
- Use `window.openai` only when a documented ChatGPT-specific capability is
  necessary, and keep the standard MCP Apps path functional where possible.
- Keep server data access separate from widget rendering. Demo fixtures may
  remain in `server.ts`; real user data belongs behind an authenticated service
  boundary.
- `src/lib/kitchen-service.ts` is the shared server-side kitchen boundary.
  HTTP and MCP transports authenticate and supply the trusted user ID; the
  service validates and orchestrates pantry/tool operations; `src/lib/db.ts`
  remains the only Postgres-driver and ownership-enforcement boundary.
- Enforce authentication at the MCP HTTP boundary for account-specific data,
  verify token validity and required claims server-side, and retain per-tool
  `securitySchemes` as defense in depth and host-facing metadata.
- Supabase's standard OAuth scopes describe OIDC identity claims; they do not
  limit Data API permissions. Preserve the OAuth `client_id` through every
  HTTP authorization decision. Direct OAuth tokens may read only the owning
  user's pantry/tools and may not access chat data or call website mutation
  routes. MCP writes, when intentionally added, must execute through Mise's
  authenticated service boundary rather than widening direct token access.
- Keep receipt interpretation and pantry mutation separate. A host model may
  inspect an image, clarify uncertain lines, and present a proposal, but only
  a user-authorized list of resolved new items and restocks may reach a mutation
  command. In the four-tool interface, this is one `add_items` batch; a separate
  receipt tool is not required. Send the whole list once with a caller-generated UUID; reuse that
  UUID only for an identical retry. Do not add OCR or file inputs to the
  mutation tool.
- Expose kitchen lifecycle parity as focused user-intent tools, not raw
  database CRUD. Pantry and kitchen-tool edits/deletes must start from a fresh
  kitchen read and carry the stable resource ID plus exact current display name.
  Keep create retries canonical/idempotent, distinguish missing/foreign IDs
  from stale-name conflicts without exposing ownership, and require explicit
  current-turn removal intent. A current-turn report that a pantry item is fully
  finished/used up/out of stock counts as removal intent (user decision 2026-09-06).
  Partial consumption, stored zero alone, and hypothetical plans do not. Equipment
  still requires explicit deletion intent.

## Modular MCP SDK v2 and Dual-Era Protocol Architecture

Mise uses the modular MCP TypeScript SDK v2 (`@modelcontextprotocol/server`, `@modelcontextprotocol/core`, `@modelcontextprotocol/node`, `@modelcontextprotocol/express`) while maintaining full dual-era protocol compatibility:

- **Dual-era detection (`isLegacyRequest`)**:
  - **Modern (2026-07-28)**: Requests carrying `mcp-session-id`, `mcp-protocol-version: 2026-07-28`, or routing through `createMcpHandler` (`PerRequestHTTPServerTransport`). Modern requests support capability discovery (`server/discover`), use modern result envelopes with `_meta`, and enforce SEP-2243 headers (`Mcp-Method`, `Mcp-Name`). Missing or mismatched method/name headers are rejected with status 400 (`-32020`).
  - **Legacy (2025-11-25)**: Standard Streamable HTTP JSON-RPC 2.0 requests without modern headers (such as ChatGPT Developer Mode). Handled by `OpenAiCompatibleNodeStreamableHTTPServerTransport` and `OpenAiCompatibleWebStandardStreamableHTTPServerTransport`.
- **OpenAI Compatibility Adapter & Response Patching (`patchOpenAiSecuritySchemes`)**:
  ChatGPT Developer Mode requires `securitySchemes` directly on each tool descriptor in `tools/list`. The SDK v2 schema generator omits custom root keys. `patchOpenAiSecuritySchemes` intercepts outgoing `tools/list` responses on both legacy transports and modern HTTP response paths to inject `securitySchemes` at the tool root (for 2025 ChatGPT compatibility) as well as inside `tool._meta` (for 2026 hosts).
- **Transport Observability (`ObservedMcpTransport`)**:
  Both legacy and modern transports are wrapped via `createMiseServer` to record OpenTelemetry spans and metrics for incoming requests and tool calls. To prevent microtask race conditions where `PerRequestHTTPServerTransport.prototype.send` schedules a microtask to close the transport, `ObservedMcpTransport` synchronously removes the pending request from tracking before awaiting delivery, ensuring clean `success` / `delivery_error` resolution instead of spurious `interrupted` outcomes.
- **Fail-Closed RFC 6750 Authentication**:
  Unauthenticated MCP requests receive an RFC 6750 `401 Unauthorized` challenge with `WWW-Authenticate: Bearer error="invalid_token", ...` when an invalid token is provided, or a clean challenge without `error=` parameter when no token is present. Both the Express standalone server (`requireBearerAuth` forwarding `req.auth` through `toNodeHandler`) and the Next.js hosted route handler enforce this before tool execution.
- **Dual-Era CORS Headers**:
  `Access-Control-Allow-Headers` and `Access-Control-Expose-Headers` include `Mcp-Method, Mcp-Name, Mcp-Param-*` alongside standard headers, enabling browser and proxy clients to inspect and route MCP calls cleanly.

## Required protocol validation

Test the sequence a real host performs, not only isolated helpers. For changes
to transport or authentication, preserve automated coverage for:

- unauthenticated MCP initialization returning `401` with a valid
  `WWW-Authenticate` challenge and path-specific protected-resource metadata;
- malformed, expired, or otherwise invalid bearer tokens returning an
  `invalid_token` challenge;
- authenticated initialization, `tools/list`, and representative tool calls;
- exact mutation input/output schemas, accurate annotations, one service
  delegation per confirmed batch, and truthful applied/replayed/rejected
  narration;
- stable IDs in kitchen reads plus create/update/delete lifecycle coverage for
  pantry items and kitchen tools, including duplicate, unchanged, stale-name,
  missing/foreign, and caller-supplied-identity cases;
- security schemes in both the standard top-level descriptor field and any
  compatibility metadata required by supported hosts.

After automated checks, verify the vertical slice in MCP Inspector and then in
ChatGPT Developer Mode through the development HTTPS endpoint. If current docs
and observed host behavior differ, preserve the smallest standards-compatible
adapter proven to interoperate, cover it with a focused contract test, and
record why it exists instead of silently hand-rolling more of the protocol.

## Future UI defaults

- Prefer semantic HTML and host-provided design tokens over a custom visual
  system while the MCP flow is still being established.
- Use Apps SDK UI components when a matching interactive component is needed;
  do not recreate standard controls merely to brand them.
- Support host light and dark themes from the start. Avoid hardcoded page,
  text, border, and focus colors when host variables are available.
- Preserve Mise branding only as a restrained accent until the interaction is
  proven. Do not copy the full standalone app shell into an inline widget.
- Accessibility is required: native elements first, keyboard operation,
  visible focus, WCAG AA contrast, text resizing, meaningful labels, and ARIA
  only where native semantics are insufficient.

## Delivery order

1. Make one tool flow correct in MCP Inspector.
2. Verify the same flow in ChatGPT Developer Mode.
3. Add authentication before reading real Supabase user data.
4. Add additional tools one small vertical slice at a time.
5. Add a widget only when a named workflow needs interaction or visualization that
   ChatGPT's ordinary tool result cannot provide.

For any future widget, verify the MCP Apps initialization handshake, tool-result
rendering, loading and error behavior, and absence of browser console errors.

## Local development loop

The development connector runs entirely from the local checkout:

`local files -> tsx watcher -> http://localhost:8787/mcp -> ngrok HTTPS URL -> ChatGPT`

- `pnpm run mcp:dev` watches the local MCP files and restarts the server after a
  saved change. If the watcher is not running, restart the MCP server manually.
- ngrok forwards its public HTTPS URL to port `8787`; it does not deploy,
  upload, or copy the code. Keep both the local MCP process and ngrok process
  running. The laptop is the development server.
- A Git commit or push is not needed for local ChatGPT testing. Push only when
  the change should be shared, reviewed, deployed to durable hosting, or
  preserved remotely.
- The ChatGPT connector can keep using the same ngrok URL while that tunnel is
  alive. A newly generated ngrok URL must be entered into the connector again.
- Treat the ngrok URL as publicly reachable. Real kitchen data may only cross
  it through the same verified OAuth transport, user-scoped kitchen service,
  and fail-closed RLS boundary as production. Never weaken those boundaries to
  make local testing easier, and do not expose write operations until their
  authorization and retry contract is independently complete.

## Hosted production loop

The installed production connector was verified in ChatGPT settings on 2026-09-07
to use the existing Next.js deployment. See `docs/MCP-DEPLOYMENT.md` for the
verification record and instructions; inspect the installed URL before choosing logs:

`ChatGPT -> https://meal-prep-tawny-kappa.vercel.app/mcp -> Next route handler -> stateless MCP server`

- `src/app/mcp/route.ts` adapts the Web-standard MCP transport to a Vercel
  route handler. Keep each request stateless; do not rely on an in-memory MCP
  session surviving across serverless invocations.
- Exact OAuth well-known URLs are rewritten to the metadata route handlers
  under `src/app/api/mcp/`. Keep those responses derived from `src/mcp/auth.ts`
  so the standalone and hosted transports cannot drift.
- `MCP_PUBLIC_URL` is the OAuth resource identifier, not merely a routing hint.
  In production it must exactly match the public `/mcp` endpoint.
- The Supabase Site URL is the deployed application origin without `/mcp`.
  It controls the default browser redirect after auth; it is not the MCP
  resource URL.
- `/api/mcp/health` proves that the deployment is reachable without weakening
  auth on `/mcp`. Logs may include request IDs, method, status, and duration,
  but never bearer tokens, user IDs, or kitchen data.
- A Vercel preview can prove build, routing, discovery, and fail-closed auth.
  The production OAuth connection is only proven after the stable production
  hostname serves the matching code and the ChatGPT app is reconnected there.

## Cloudflare Workers & Hono Edge Architecture

In addition to the Next.js serverless route handler, Mise provides a standalone,
edge MCP server running on Cloudflare Workers with Hono. This separate deployment
is not the verified installed production connection. Its health and revision do
not establish the state of the Vercel connector:

- **Entry point**: `src/mcp/worker.ts` mounts Hono with dual-era CORS, RFC 8414 OAuth
  discovery (`/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`),
  health probes (`/health`, `/api/mcp/health`, `/`), and routes `/mcp` directly to
  our Web-standard `handleMiseMcpRequest`.
- **Runtime configuration**: `wrangler.toml` targets `compatibility_date = "2026-09-06"`
  with `compatibility_flags = ["nodejs_compat"]`. Node.js compatibility provides the
  standard crypto and net primitives used by Postgres.js and OTel.
- **Database connection**: Connects to Supabase Postgres through transaction poolers
  (Supavisor port 6543) with prepared statements disabled (`prepare: false`). `src/lib/db.ts`
  initializes the Postgres client lazily on first access, allowing worker environment
  bindings to populate seamlessly before database instantiation.
- **Local simulation**: `pnpm run mcp:worker` starts a local Miniflare simulation
  on port `8787` (or custom port).
- **Deployment**: `pnpm run deploy:worker` deploys the worker bundle to Cloudflare
  Workers (`mise-mcp.workers.dev` or custom domain). Secret bindings (`DATABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_URL`, etc.) are configured via Wrangler secrets or Doppler.
- **Background telemetry**: Starts the shared provider after Worker binding setup.
  OTLP endpoints and secret headers are passed explicitly because the bundled OTel
  browser environment readers ignore process variables. The workerd smoke test
  (`pnpm run test:telemetry-worker`) guards remote routing and authentication. Uses Cloudflare's `c.executionCtx.waitUntil(flushKitchenTelemetry())`
  to flush spans asynchronously without penalizing ChatGPT response latency.

## Host refresh and future-widget test rules

- MCP Inspector is the fast inner loop for tools and protocol behavior. ChatGPT
  Developer Mode is the required host-level
  verification. Record those host checks with the direct, indirect, negative,
  empty, auth-failure, and two-user cases in
  `docs/mcp-golden-prompts.md`.
- A historical ChatGPT message retains its original tool result. Make a fresh prompt to
  test new tool data.
- After each change, verify in order: TypeScript and lint, refresh the app in
  MCP Inspector, then refresh the ChatGPT development app metadata when its
  tool contract changed before making a fresh tool call
  through the ngrok connector.
