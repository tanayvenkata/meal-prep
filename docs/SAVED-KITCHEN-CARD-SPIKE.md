# Saved kitchen card — implementation spike, 2026-09-07

## Decision

Continue the working conversational pantry/equipment workflow. Add a small,
explicitly requested card for inspecting what Mise actually saved. Do not build
receipt approval, inventory replacement, or a stove-side UI in this slice.
Related: #242 (inventory review), #240 / PR #243 (truthful confirmations),
#241 (connector/deployment investigation), #224 (cooking workflow validation).

The user supplied both a misleading generated inventory picture and a later
successful tool-backed inventory/planning session. The second is positive user
experience evidence, not raw database verification. Neither supports treating
all ChatGPT reads as broken. A real widget addresses visibility of saved state;
it cannot prevent a host model from inventing an image without calling Mise.

## Implementation

The installed production connector uses Vercel `/mcp`, as verified in the newly
merged `docs/MCP-DEPLOYMENT.md`. This card works through that existing server
registration; a Worker cutover is not a prerequisite. The Worker dry run below is
additional portability evidence, not proof of the installed production path.

The `vanilla-widget` archetype extends the existing MCP server. It follows the
[OpenAI quickstart](https://developers.openai.com/plugins/quickstart) and
[decoupled UI guidance](https://developers.openai.com/plugins/build/chatgpt-ui).
Only `show_kitchen` attaches a resource, and only when `MISE_INVENTORY_UI=1`.
The default four-tool contract remains unchanged.

`show_kitchen` takes no arguments and loads the authenticated user's pantry and
equipment through the existing service boundary. It returns ordinary structured
content for hosts without UI. Refresh calls `read_kitchen` (or
`get_kitchen_context` on the baseline surface) without remounting the card.
Read failures never become empty pantry claims. No new writes, auth scopes,
database access paths, or persistent UI state are introduced.

Quantities remain structured, descriptive, unknown, or legacy unsupported exactly
as the existing service returns them. Package sizes are not inferred. The card
shows the server's read-start timestamp, not a database revision; the underlying
pantry and equipment reads are not asserted to be one atomic snapshot. Failed
refreshes retain the previous observation with an out-of-date warning. Late older
results do not overwrite a newer read.

The official `@modelcontextprotocol/ext-apps` 1.7.5 browser `App` owns the handshake,
notifications, and tool calls. Its server helpers still target SDK v1; Mise uses
modular SDK v2 native tool/resource registration with standard UI metadata instead
of an unsafe type cast. The v1 peer remains confined to the UI dependency graph.
The browser bundle strips SDK console logging, including debug tool payloads.

`build:mcp-ui` generates an ignored TypeScript module containing HTML, inline CSS,
and bundled JavaScript, with a content-hashed `ui://` URI. Development/test/build/MCP start
scripts regenerate it. There are no runtime filesystem reads and no external UI
assets or API connections; the resource CSP has empty domain allowlists. Host
style variables and theme updates are supported, with system color fallbacks.

## Validation completed

- TypeScript, focused ESLint, and 151 MCP tests passed. New tests cover the default
  catalog, explicit UI resource discovery, authenticated caller forwarding,
  identity/list argument rejection, empty/error data, quantity preservation,
  safe name rendering, refresh failure/recovery, and stale-result ordering.
- MCP Inspector 2.5.0 completed an authenticated synthetic `show_kitchen` call and
  recognized its app resource, MIME type, CSP, and returned inventory.
- Local browser host using the official `AppBridge` completed initialization,
  rendered server results, refreshed through MCP HTTP, recovered after a forced
  read failure, and showed empty pantry/equipment correctly.
- Light/dark and 320px rendering inspected. On the final reload, no runtime
  exception events were recorded. Earlier fixture errors were corrected before
  this check; a sporadic browser MutationObserver diagnostic was not reproduced
  in the final reload. This is not a blanket claim about all ChatGPT consoles.
- Wrangler 4.129.0 deployment dry run passed: approximately 3.59 MiB Worker source,
  767 KiB compressed. No deployment occurred.

The added `inventory-card.integration.test.ts` now exercises two random local
accounts through a real MCP client, the shared service, and Postgres under the
non-owner application role. It verifies pantry/equipment isolation, descriptive
and unknown quantities, equality with a fresh read, refresh after a saved change,
and no read-side mutations. Fixture identities/data are cleaned up. Transport
tokens are synthetic; this does not replace ChatGPT OAuth/host acceptance.

## Reproduce locally

Use Node 24 and the repository's pnpm version.

```sh
pnpm install --frozen-lockfile
pnpm run eval:inventory-card
```

Open `http://127.0.0.1:8791`. The parent page is clearly labeled synthetic data.
Its controls choose stock, empty, and failed-read scenarios; press Refresh inside
the card to exercise the bridge. The fixture listens only on loopback, rejects
mutation calls, and injects a synthetic loader instead of accessing the database.

```sh
npx @modelcontextprotocol/inspector@2.5.0 --cli http://127.0.0.1:8791/mcp \
  --transport http --method tools/call --tool-name show_kitchen \
  --tool-args-json '{}' --format json --stored-auth-only \
  --header 'Authorization: Bearer synthetic-fixture'
```

For the actual development connector, enable `MISE_INVENTORY_UI=1`, rebuild the UI,
start the authenticated server, and refresh connector metadata. Do not repoint a
production connection to the synthetic fixture. On Workers the opt-in flag must
be supplied as a binding; it is deliberately absent from production wrangler vars.

## Remaining acceptance before enabling by default

Use the authenticated development HTTPS connector, after refreshing metadata:

1. “Show my saved pantry and equipment” should select `show_kitchen` and render
   real saved state. Compare the card to a fresh service read.
2. “What can I cook?” should use the data tool and should not open a card.
3. Refresh should show changes made separately through an already-authorized flow,
   without triggering a mutation or a new card. Test repeated refreshes.
4. Check empty stock, descriptive/unknown quantities, and an expired connection.
5. Repeat with two test accounts and verify ownership against actual stored data.
6. Verify text-only fallback, ChatGPT light/dark rendering, phone layout,
   keyboard use, and host browser errors.

ChatGPT host acceptance, real-account end-to-end checks, and deployment are pending.
Receipt review/approval and phone voice/lock-screen experiments remain separate.

## Merge-readiness review — 2026-09-07

Local two-user database acceptance passed, alongside all 354 unit tests,
TypeScript, and focused lint before integration with the production telemetry PR.
ChatGPT is signed in, but no development ngrok tunnel is running. The installed
production connector serves the default four-tool catalog, so it cannot exercise
this unmerged opt-in card. Keep this PR draft until an authenticated development
HTTPS endpoint is connected and the host cases above pass. No production feature
flag, connection, deployment, or inventory was changed by this review.
