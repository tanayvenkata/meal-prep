# Mise MCP app guidance

This directory contains Mise's MCP server and MCP App widget. Keep changes
small and teach the protocol boundary before adding product complexity.

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
   authentication, or bridge plumbing. Default to the official MCP SDK,
   `@modelcontextprotocol/ext-apps`, and Apps SDK UI primitives when they cover
   the required behavior.

Custom protocol or authentication code is allowed only when the official
helper cannot preserve required behavior. Keep the adapter narrow, explain the
gap in a nearby comment or durable issue/PR note, and add a wire-level contract
test that would fail if the interoperability behavior regresses. Import SDKs
that production code relies on as direct dependencies, not undeclared
transitive dependencies.

## Architecture

- Treat core MCP as the tool and data contract. Treat MCP Apps as the optional
  open UI extension rendered by compatible hosts.
- Target ChatGPT first, but use the standard MCP Apps bridge from
  `@modelcontextprotocol/ext-apps` for widget lifecycle and tool results.
- Do not hand-roll the initialization handshake with raw `postMessage` calls.
- Keep widget code under `src/mcp/widget/`: `index.tsx` owns host lifecycle,
  `bridge.ts` owns the standard MCP Apps connection, and `components/` owns
  presentation built from Apps SDK UI components.
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

## Required protocol validation

Test the sequence a real host performs, not only isolated helpers. For changes
to transport or authentication, preserve automated coverage for:

- unauthenticated MCP initialization returning `401` with a valid
  `WWW-Authenticate` challenge and path-specific protected-resource metadata;
- malformed, expired, or otherwise invalid bearer tokens returning an
  `invalid_token` challenge;
- authenticated initialization, `tools/list`, and representative tool calls;
- security schemes in both the standard top-level descriptor field and any
  compatibility metadata required by supported hosts; and
- widget initialization and tool-result delivery through the standard MCP Apps
  bridge.

After automated checks, verify the vertical slice in MCP Inspector and then in
ChatGPT Developer Mode through the development HTTPS endpoint. If current docs
and observed host behavior differ, preserve the smallest standards-compatible
adapter proven to interoperate, cover it with a focused contract test, and
record why it exists instead of silently hand-rolling more of the protocol.

## UI defaults

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

1. Make one tool-to-widget flow correct in MCP Inspector.
2. Verify the same flow in ChatGPT Developer Mode.
3. Add authentication before reading real Supabase user data.
4. Add component actions and additional tools one small vertical slice at a
   time.
5. Revisit stronger Mise visual differentiation only after the lifecycle,
   data, auth, error, loading, empty, light, dark, and keyboard states work.

For every widget change, verify the MCP Apps initialization handshake, tool
result rendering, loading and error behavior, and absence of browser console
errors.

## Local development loop

The development connector runs entirely from the local checkout:

`local files -> tsx watcher -> http://localhost:8787/mcp -> ngrok HTTPS URL -> ChatGPT`

- `npm run mcp:dev` watches the local MCP files and restarts the server after a
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

The production connector runs through the existing Next.js deployment:

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

## Widget refresh and test rules

- MCP Inspector is the fast inner loop for resources, tools, bridge behavior,
  and initial visual checks. ChatGPT Developer Mode is the required host-level
  verification. Record those host checks with the direct, indirect, negative,
  empty, auth-failure, mobile/widget, and two-user cases in
  `docs/mcp-golden-prompts.md`.
- Derive the widget resource URI from a short content hash of the assembled
  HTML, CSS, and JavaScript. Do not maintain handwritten `v1`, `v2`, and similar
  development counters. Keep old URI aliases only when retrying historical
  messages is intentionally supported.
- Keep the generated widget on package ESM/browser export paths. The repository
  lives below an unrelated Yarn PnP manifest, so the widget build resolves this
  project's package export maps explicitly; preserve the protocol test's bundle
  budget when adding SDK UI components.
- A historical ChatGPT message retains its original tool result. Retrying or
  refreshing its widget may load new widget code, but it does not fetch new
  pantry data. Make a fresh prompt to test a new tool result.
- After each change, verify in order: TypeScript and lint, refresh the app in
  MCP Inspector, then refresh the ChatGPT development app metadata when its
  tool contract or generated widget URI changed before making a fresh tool call
  through the ngrok connector.
- In MCP Inspector v0.22.0, changing the shell theme while an app is mounted
  can fail to notify the iframe with `Error: Not connected`. To test a theme,
  select Light or Dark first, close the mounted app, then reopen it. Verify the
  newly mounted iframe instead of treating the stale frame as an app CSS bug.
