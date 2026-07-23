# Mise MCP golden-prompt runbook

Use this runbook after MCP tool, resource, widget, OAuth, or deployment changes. Automated
tests prove the wire contract; MCP Inspector proves the generic host bridge; a fresh ChatGPT
conversation proves real tool selection, account linking, and rendering.

## Setup

1. Run `npm run mcp:dev` and connect MCP Inspector to the local server, or deploy the exact
   commit and use the stable production `/mcp` URL.
2. If tool metadata or the content-hashed widget URI changed, refresh or reconnect the
   ChatGPT app before testing.
   If the available mutation capability changed, disconnect and reconnect so the updated
   Mise consent screen is shown and explicitly approved.
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
| Exact quantity | With one Eggs item: “Set my Eggs quantity to 6.” | Calls `set_pantry_item_quantity` once with no identity field; returns the safe before/after result; a fresh read and the Mise pantry page show `6`. |
| Retry | Repeat the exact same quantity request. | Returns `unchanged`; the final quantity remains `6` and no duplicate item or cumulative change appears. |
| Missing write target | “Set my Saffron quantity to 1 jar” when Saffron does not exist. | Returns `not_found`; nothing is created or mutated. |
| Ambiguous write target | With two normalized Eggs matches, request a new Eggs quantity. | Returns `ambiguous` with the match count; nothing mutates and ChatGPT asks the user to resolve the duplicate instead of guessing. |
| No inferred write | Ask for a recipe that uses six eggs. | A kitchen read may occur, but the quantity tool does not run because the user did not ask to change saved inventory. |

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

With both read and write tools present, server-level instructions define their shared boundary:
read when saved context is needed; write only after a clear exact-quantity request; never infer a
write from recipe planning; and never guess after a missing or ambiguous match. Each descriptor
still carries its own narrow “when to use” guidance.

The older `ui://widget/kitchen-context-v*.html` resources are compatibility aliases for historical
ChatGPT messages that may re-read their original resource URI. Remove them only after production
evidence shows those messages no longer request the aliases.
