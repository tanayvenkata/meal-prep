# Mise MCP app guidance

This directory contains Mise's MCP server and MCP App widget. Keep changes
small and teach the protocol boundary before adding product complexity.

## Architecture

- Treat core MCP as the tool and data contract. Treat MCP Apps as the optional
  open UI extension rendered by compatible hosts.
- Target ChatGPT first, but use the standard MCP Apps bridge from
  `@modelcontextprotocol/ext-apps` for widget lifecycle and tool results.
- Do not hand-roll the initialization handshake with raw `postMessage` calls.
- Use `window.openai` only when a documented ChatGPT-specific capability is
  necessary, and keep the standard MCP Apps path functional where possible.
- Keep server data access separate from widget rendering. Demo fixtures may
  remain in `server.ts`; real user data belongs behind an authenticated service
  boundary.

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
- Treat the ngrok URL as publicly reachable. Until authentication and user
  isolation are implemented, expose demo fixtures only and no real Supabase
  pantry data or write operations.

## Widget refresh and test rules

- MCP Inspector is the fast inner loop for resources, tools, bridge behavior,
  and initial visual checks. ChatGPT Developer Mode is the required host-level
  verification.
- Derive the widget resource URI from a short content hash of the assembled
  HTML, CSS, and JavaScript. Do not maintain handwritten `v1`, `v2`, and similar
  development counters. Keep old URI aliases only when retrying historical
  messages is intentionally supported.
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
