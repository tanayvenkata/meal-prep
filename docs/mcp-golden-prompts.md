# Mise MCP golden-prompt runbook

Use this runbook after MCP tool, resource, widget, OAuth, or deployment changes. Automated
tests prove the wire contract; MCP Inspector proves the generic host bridge; a fresh ChatGPT
conversation proves real tool selection, account linking, and rendering.

## Setup

1. Run `npm run mcp:dev` and connect MCP Inspector to the local server, or deploy the exact
   commit and use the stable production `/mcp` URL.
2. If tool metadata or the content-hashed widget URI changed, refresh or reconnect the
   ChatGPT app before testing.
3. Use a new ChatGPT conversation so an old tool descriptor or widget resource is not cached.
4. Record the commit, endpoint, host, account, date, and pass/fail result with the PR evidence.
   Do not record tokens, user IDs, or kitchen contents beyond the minimum needed to prove the
   expected result.

## Prompt matrix

| Case | Prompt or action | Expected result |
| --- | --- | --- |
| Direct | “Show me my Mise kitchen.” | Calls `get_kitchen_context` once; the widget shows only the signed-in user's pantry and tools. |
| Indirect | “What can I cook with what I already have?” | Uses the kitchen tool when saved inventory is needed, then bases advice on its result. |
| Negative | “What is the weather in New York?” | Does not call Mise; its one tool is irrelevant to the request. |
| Empty | With an account that has no pantry items or tools: “Show me my Mise kitchen.” | The widget renders explicit “No pantry items saved yet” and “No kitchen tools saved yet” states, not blank containers or an error. |
| Auth failure | Disconnect Mise or use an expired/invalid token, then request the kitchen. | The MCP endpoint returns the OAuth challenge; ChatGPT offers account linking or reconnection and no kitchen data leaks. |
| Mobile/widget | Run the direct prompt in a narrow host viewport and inspect light and dark themes. | Content stays readable without horizontal clipping; host typography/colors apply; loading, result, and empty text remain legible. |
| Two-user isolation | Connect account A, record a distinctive safe item, then repeat with account B. | Each account sees only its own pantry/tools. Account A's distinctive item never appears for B. |

## Generic MCP Apps bridge check

In MCP Inspector:

1. Initialize the connection and list tools.
2. Confirm `get_kitchen_context` advertises OAuth, the generated `ui.resourceUri`, the output
   schema, and accurate read-only/idempotent annotations.
3. Call the tool while authenticated and open its resource.
4. Confirm the app completes `ui/initialize`, receives `ui/notifications/tool-result`, renders
   the result, and produces no browser-console errors.
5. Confirm the resource CSP has empty `connectDomains` and `resourceDomains`; the widget needs
   no browser network access.

Server-level discovery instructions remain intentionally deferred while Mise exposes one tool.
The tool descriptor carries the complete “when to use” guidance. Add shared server instructions
only when multiple tools create real sequencing or selection guidance that cannot live clearly
on one descriptor.

The older `ui://widget/kitchen-context-v*.html` resources are compatibility aliases for historical
ChatGPT messages that may re-read their original resource URI. Remove them only after production
evidence shows those messages no longer request the aliases.
