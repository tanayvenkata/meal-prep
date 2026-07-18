# Pantry and kitchen-tools schema

## Grain

- `items`: one consumable pantry item owned by one user.
- `kitchen_tools`: one durable cooking tool owned by one user.

## Decisions

| Decision | Why |
| --- | --- |
| Keep consumables in `items`; add `turnover` there. | Chicken, milk, eggs, and spices share the same quantity-and-replacement lifecycle. The pantry screen can sort and section them without duplicating inventory. |
| Use `high` as the default turnover. | Existing rows must remain visible after the migration. `high` puts them in the primary section until the user explicitly classifies them. |
| Store turnover as text, not a Postgres enum. | The write boundary can normalize values while future product terminology stays migration-free. |
| Put tools in `kitchen_tools`, not `items`. | Tools are durable capabilities, not consumable inventory; mixing them would force every pantry query and prompt to branch on entity type. |
| Store tool `kind` as text. | The initial UI groups `appliance`, `cookware`, and `bakeware`, while an open text category leaves room for a future useful group without a schema migration. |
| Enforce ownership with an Auth FK and RLS. | A tool cannot belong to a nonexistent user, and authenticated users can only read or write their own rows. |
| Index `(user_id, created_at desc)`. | The expected query is a user's tools list, newest first. |

## Deliberate deferrals

- No tool notes, brands, model numbers, or capacity fields yet: no current writer/UI consumes them.
- No tool-to-dish-log join table yet: introduce it only when a dish log needs to query tools relationally.
- The repo currently has both bigint (`items`) and UUID (`conversations`, `messages`, `kitchen_tools`) primary keys. New tools follow the newer UUID pattern; choosing a single convention for future tables is tracked as schema cleanup rather than changing existing primary keys speculatively.
