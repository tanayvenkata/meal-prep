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
| Direct | “Show me my Mise kitchen.” | Calls `get_kitchen_context` once; the widget shows only the signed-in user's pantry and tools, while structured results distinguish unknown, text, and amount/unit quantities. |
| Indirect | “What can I cook with what I already have?” | Uses the kitchen tool when saved inventory is needed, then bases advice on its result. |
| Negative | “What is the weather in New York?” | Does not call Mise; its tools are irrelevant to the request. |
| Empty | With an account that has no pantry items or tools: “Show me my Mise kitchen.” | The widget renders explicit “No pantry items saved yet” and “No kitchen tools saved yet” states, not blank containers or an error. |
| Auth failure | Disconnect Mise or use an expired/invalid token, then request the kitchen. | The MCP endpoint returns the OAuth challenge; ChatGPT offers account linking or reconnection and no kitchen data leaks. |
| Mobile/widget | Run the direct prompt in a narrow host viewport and inspect light and dark themes. | Content stays readable without horizontal clipping; host typography/colors apply; loading, result, and empty text remain legible. |
| Two-user isolation | Connect account A, record a distinctive safe item, then repeat with account B. | Each account sees only its own pantry/tools. Account A's distinctive item never appears for B. |
| Exact quantity | With one Eggs item: “Set my Eggs quantity to 6 count.” | Calls `set_pantry_item_quantity` once with no identity field; returns the safe before/after result. A fresh read exposes `quantityMode: "structured"`, `quantityAmount: "6"`, and `quantityUnit: "count"` while the widget and Mise pantry page show `6`. |
| Retry | Repeat the exact same quantity request. | Returns `unchanged`; the final quantity remains `6 count` and no duplicate item or cumulative change appears. |
| Missing write target | “Set my Saffron quantity to 1 jar” when Saffron does not exist. | Returns `not_found`; nothing is created or mutated. |
| No inferred write | Ask for a recipe that uses six eggs. | A kitchen read may occur, but the quantity tool does not run because the user did not ask to change saved inventory. |
| Consume | With structured `6 count` Eggs: “I used two eggs; update Mise.” | Reads current context, confirms the mutation, then calls `consume_pantry_item` with `expectedQuantity: { amount: "6", unit: "count" }` and `deltaQuantity: { amount: "2", unit: "count" }`; returns before `6 count` and after `4 count`. |
| Consume retry | Immediately repeat the same consume call with the old `6 count` expectation. | Returns `conflict` with current `4 count`; final inventory remains `4 count` and ChatGPT refreshes before proposing another mutation. |
| Restock | With structured `1 bag` Rice: “Add two bags of rice to my pantry.” | Reads current context, then calls `restock_pantry_item` with `expectedQuantity: { amount: "1", unit: "bag" }` and `deltaQuantity: { amount: "2", unit: "bag" }`; returns before `1 bag` and after `3 bag`. |
| Unclear delta | With structured Eggs: “I used some eggs; update Mise.” | Does not call a mutation tool until the user supplies an exact positive count. |
| Unsupported text | With Milk stored as text `Half gallon`: “I used 0.25 gallon of milk.” | Does not call a mutation tool because there is no structured expectation; ChatGPT asks the user to set an exact structured quantity first. |
| Quantity changed to unsupported | Read a structured item, change its quantity to text through the Mise website, then submit the stale structured mutation call. | Returns `unsupported_quantity`; nothing mutates and ChatGPT refreshes context. |
| Unit mismatch | With structured `2 lb` Flour: “I used 4 oz of flour.” | Does not convert units; returns `unit_mismatch` and leaves the quantity unchanged. |
| Insufficient stock | With structured `1 count` Eggs: “I used two eggs.” | Returns `insufficient_quantity`; quantity remains `1 count` and ChatGPT explains the mismatch instead of forcing zero. |
| Quantity overflow | With an item near the supported maximum: request a restock that would exceed it. | Returns `amount_exceeded`; the stored quantity remains unchanged. |
| Planning-only consume | “Give me a recipe that uses two eggs.” | A kitchen read may occur, but neither relative mutation tool runs because the user did not ask to update saved inventory. |
| Two-user mutation isolation | With the same item name in accounts A and B, consume a safe amount while connected as A, then read both accounts. | Only account A changes. Account B remains unchanged and neither tool accepts a caller-supplied identity. |

## Reversible production mutation check

Use one structured item with a harmless quantity such as `3 lb`, and record only the minimum
before/after evidence:

1. Read the kitchen and record the exact structured baseline.
2. Consume `0.5 lb` with the baseline as `expectedQuantity`; verify the result is `2.5 lb`.
3. Repeat that same stale call once; verify `conflict` and no additional subtraction.
4. Read again, then restock `0.5 lb` using `2.5 lb` as the expectation.
5. Repeat that stale restock call once; verify `conflict` and no additional addition.
6. Read once more and verify the original `3 lb` baseline is restored.

Do not replay the original consume after restoring the baseline: optimistic concurrency prevents
immediate stale retries, but it is not a durable operation receipt across an ABA state cycle.

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

With read and write tools present, server-level instructions define their shared boundary: read
before relative mutations, write only after clear current-turn intent, pass an explicit structured
expected quantity, refresh after conflict, and never infer a write from recipe planning. Each
descriptor still carries its own narrow “when to use” guidance.

The older `ui://widget/kitchen-context-v*.html` resources are compatibility aliases for historical
ChatGPT messages that may re-read their original resource URI. Remove them only after production
evidence shows those messages no longer request the aliases.
