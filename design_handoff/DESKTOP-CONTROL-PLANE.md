# Desktop account and kitchen control plane

Implementation-ready design for [issue #32](https://github.com/tanayvenkata/meal-prep/issues/32).
Date: 2026-09-07. Status: design deliverable; application changes have not shipped.
This document supersedes the historical chat-based desktop/navigation proposals
for the active website. It does not revive their feature roadmap.

## Job and evidence

Help someone inspect and correct what Mise knows about their kitchen, and understand
which account they are using when approving a connection. Cooking conversation
happens in the client. Website destinations are Pantry, Tools, and Account.

Inspected: `src/components/NavBar.tsx`, `src/app/layout.tsx`,
`src/app/pantry/page.tsx`, `src/app/tools/page.tsx`, `src/app/oauth/consent/page.tsx`,
`src/app/oauth/consent/consent-decision-form.tsx`, `src/mcp/consent-copy.ts`,
`src/app/globals.css`, and the project/design guidance.

Both inventory pages currently use `max-w-xl`. Pantry packs name, structured
quantity, turnover, and actions into a single form row. Names truncate in display
rows. The nav offers Pantry, Tools, sign out, and theme selection. Consent already
shows the authenticated identity, client, scopes, and return address. These are
code observations, not findings from a usability study.

## Design decision

Use a quiet horizontal navigation bar and a wide kitchen register with aligned
columns. At large widths, the editor sits beside the register so the user can
compare saved values with a draft. Keep the familiar paper palette and Spectral
headings as the brand signature. Avoid summary cards and a permanent sidebar:
three destinations do not need either, and inventory is the useful content.

Compared with merely widening the current inline form, the separate editor gives
quantity controls predictable space. Compared with a modal-only desktop editor,
it keeps the kitchen visible. Below the wide breakpoint it becomes an in-flow
form, preserving keyboard order and avoiding a second navigation system.

## Visual contract

Use existing semantic CSS tokens and theme selection. Values below describe light
mode, not new component-local constants. Dark mode uses the existing aliases.

| Role | Existing token / light value | Treatment |
| --- | --- | --- |
| Page | `surface-base` / #f6f1e7 | Continuous paper canvas |
| Form/navigation | `surface-raised` / #fffdf8 | Editor surface, subtle existing shadow |
| Main text | `text-primary` / #221d18 | Names, labels, important instructions |
| Primary action | `accent` / #c8492f | One filled Add, Save changes, or Connect action |
| Bare accent/error text | `text-accent`, `text-danger` / #b8391f | Never substitute the button-fill color |
| Control boundary | `outline` / #948a6a | Inputs and essential boundaries |

Spectral 600: wordmark 24/32, page heading 32/40, section heading 24/32.
Geist: body and inputs 16/24, buttons and labels 14/20. Geist Mono 14/20 with
tabular numbers: quantities and item counts only. Left-align text and quantities;
consistent columns matter more than number alignment for mixed units.
Use 4/8/12/16/24/32px spacing, 8px control radii, 12px editor radius, and at least
44px control height. Rows have 12px vertical padding and grow with content.
Names wrap; do not hide distinguishing text behind ellipses.

The current light `text-secondary` (#8a8073) is not automatically suitable for
small text on paper. Use `text-primary` for required copy until measured semantic
secondary colors meet 4.5:1 on each surface. Preserve existing accessible outline
and bare-accent fixes instead of copying the older sand/muted palette verbatim.

## Shell and responsive dimensions

Header contents and main share a centered width of `min(1280px, 100% - gutters)`.
Header minimum height is 72px, grows with wrapping, and is not fixed over content.
Use one document scroll area; remove inventory nested scrolling and body scroll
locking when implementing this shell. Account is a normal link to proposed
`/account`, not an icon-only menu. Active link uses underline plus `aria-current`.

| Viewport | Horizontal gutters | Main width | Inventory arrangement |
| --- | --- | --- | --- |
| 1440px | 40px minimum | 1280px | 896px list + 24px gap + 360px editor |
| 1280px | 32px | 1216px | 832px list + 24px gap + 360px editor |
| 1024px | 24px | 976px | Full-width list; editor above list |
| 768px | 24px | 720px | Full-width list; editor above list |
| 375px | 16px | 343px | Stacked controls and item details |
| 320px | 16px | 288px | Same stacked layout, no page overflow |

Wide split begins at 1200px. Below 768px render item fields as labeled stacked
details; desktop columns become Name / Quantity / Actions for Pantry and
Name / Kind / Actions for Tools. Keep one semantic rendering of each record;
do not duplicate focusable mobile and desktop copies. At 200% zoom the CSS
viewport naturally chooses the narrower arrangement. Header on small screens:
wordmark and theme control on first line, Pantry / Tools / Account on second.

### Pantry, 1440px / 1280px

```text
Mise                         Pantry  Tools  Account             Theme

Pantry                                               [Add an item]
18 items
[Search pantry____________________] [Recently added] [Select items]

┌────────────────────────────────────────────┐  ┌───────────────────────┐
│ High turnover                              │  │ Edit brown rice       │
│ Name                 Quantity      Actions │  │ Name                  │
│ Brown rice           500 g         Edit    │  │ [Brown rice_________] │
│ Baby spinach         Not specified Edit    │  │ Quantity format       │
│                                            │  │ [Measured / Text____] │
│ Low turnover                               │  │ Amount     Unit       │
│ Ground cumin         Half a jar    Edit    │  │ [500____] [g________] │
│                                            │  │ Turnover [High______] │
│                                            │  │ [Save changes] Cancel │
│                                            │  │ Delete item           │
└────────────────────────────────────────────┘  └───────────────────────┘
```

Illustrative fixture values only. The list is not a card grid: use a semantic
table per turnover group on desktop, or a semantic list with associated field
labels across all widths. If using tables, column headers remain accessible at
narrow widths. Actions have item-specific accessible names. No editor open:
list takes the full main width; Add opens the panel and focuses Name. Editing
reuses that panel. Do not leave an empty decorative side column.

### Pantry, 1024px and narrower

```text
Mise                         Pantry  Tools  Account   Theme
Pantry                                        Add an item
18 items
[Search pantry____________________] [Recently added] [Select items]
[Open add/edit form, full width; fields wrap; Save changes / Cancel]
High turnover
Name                              Quantity             Actions
Brown rice                        500 g                Edit
```

At <768px, search spans the width; sort and selection wrap onto the next line.
The editor fields stack except amount/unit, which share two equal flexible
columns. Each list item shows its complete name, then quantity and actions.
The active item's edit form is identified by its heading even when offscreen.
Opening it scrolls it into view without animated scrolling under reduced motion.

### Tools

Same shell, search, sort, row rhythm, and editor behavior. Heading: “Kitchen
tools”; count: “8 tools”. Columns: Name / Kind / Actions. Example rows:
“Cast iron skillet / cookware”, “Air fryer / appliance”, “Loaf tin / bakeware”.
The editor has Name and Kind (appliance, cookware, bakeware), Save changes,
Cancel, and Delete tool. Add uses the same fields and “Add tool”. Do not add
quantities, turnover, or bulk actions to Tools as part of this design.

## Inventory interaction and state contract

- Search and Recently added / A–Z preserve current filtering and sorting.
  Pantry keeps High turnover and Low turnover grouping. Display “Turnover” with
  helper text “How often you use this item”; High/Low is not stock availability.
- Quantity preserves measured amount plus canonical unit (including count),
  explicit custom text, and unknown values. Blank is “Not specified”, never zero.
  Reuse the current supported units. Changing only a name must leave quantity
  metadata untouched. Do not infer units or translate legacy display strings.
- Only one draft is open. Switching item, route, Add, or selection mode while
  dirty asks “Discard unsaved changes?” with Keep editing (initial focus) and
  Discard changes. Cancel on an unchanged form closes immediately.
- In edit mode, the toolbar Add action is neutral; Save changes is the primary
  filled action. During save, show “Saving…”, prevent duplicate submission,
  retain the draft, and announce the result. On success close the editor and
  return focus to that row's Edit button (or the list heading if filtered out).
  Add success resets the form, focuses Name, and announces the added item.
- Separate mutation success from refresh failure: “Saved. Could not refresh the
  list. Retry loading.” Never invite another Add after a confirmed successful
  write. Network errors keep entered values and offer an explicit retry.
- Delete lives inside the editor to prevent accidental row-level activation.
  Confirmation names the item, says deletion cannot be undone, and initially
  focuses Cancel. Successful deletion focuses the next row or list heading.
- Preserve Pantry's explicit selection mode and atomic confirmed batch delete.
  Selection count and Cancel replace normal row actions. Delete selected stays
  disabled for fewer than two items, matching today's contract. Search/sort are
  disabled during selection so hidden selected items cannot surprise the user.
  Confirmation lists every selected name in a scrollable region plus the count.
- Loading: labeled status and inert skeletons, no premature “0 items”. Empty:
  “Add the ingredients you use” or “Add the equipment you cook with most”, with
  Add available. Search empty: “No items match …” and Clear search.
- Read failure: “Could not load your pantry/tools” and Retry loading; do not
  masquerade as an empty kitchen. Existing loaded rows may remain visibly stale.
  Session expiry disables writes and offers Sign in again with a safe return
  path. Do not persist kitchen drafts to browser storage automatically.

## Account and connection states

Proposed `/account` uses the same shell with two sections, not a statistics
screen. At >=1200px: Account (400px) + 32px gap + Connection (remaining width).
At 1024px and below: stacked, each section capped at 720px. Show authenticated
email with wrapping, Sign out, theme preference, and the connection explanation.
Sign out is explicit; it does not claim to revoke a client connection.

```text
Account
Signed in as                         Connection to your AI client
name@example.com                     Connection status unavailable here.
[Sign out]                           Manage the connection in your AI client.
Theme [System / Light / Dark]
```

| State | Visible copy and action | Evidence required |
| --- | --- | --- |
| Signed out | Sign in; retain validated consent return path when applicable | Existing server authentication result |
| Signed in, status unknown | “Connection status unavailable here. Manage the connection in your AI client.” | Default; website session alone proves no client connection |
| Consent pending | “Connect {verified client name} to Mise?”; email, access, return address; Cancel / Connect | Existing authorization details response |
| Submitting | “Connecting…”; prevent repeat decisions | Existing form submission state |
| Approved | Return through existing provider flow; client confirms completion | Do not infer working connection from approval alone |
| Denied | Existing deny flow returns control to requesting client | No connected badge or success message |
| Missing/expired/failed request | “Could not connect to Mise. Start the connection again from your AI client.” | Existing authorization error; no synthesized request or approval |

Persistent Connected / Disconnected / Reconnect states and a Revoke button are
not part of the first implementation: the inspected pages provide no verified
grant-status/revocation interface. Unknown is the complete, implementable default,
not a backend task hidden inside the visual work.

Consent remains a focused single-column form, max width 560px at every desktop
width, 32px internal padding (24px below 768px), vertically near the top with
48px margin rather than forcing full-screen centering under the global nav.
Keep verified client name, full wrapping email and return address, requested
scopes, and the existing summary/boundary from `MCP_CONSENT_COPY`. Connect is
primary; Cancel has equal size and legibility. No new OAuth behavior or scope
claims are specified. Error text should be user-safe rather than raw provider
internals. The form and all disclosures must remain reachable at short heights.

## Accessibility and implementation verification

Native links, buttons, labels, inputs, selects, and forms first. One h1 per page,
logical headings, skip link to main, meaningful field error associations, and
polite status announcements; blocking errors use alert. Focus ring: 2px
`outline-strong`, 2px offset, never clipped. Status and selection need text or
shape as well as color. No hover-only actions. Dialogs trap focus, close with
Escape, and restore focus. In-flow editors do not trap focus. Keyboard order:
nav, page toolbar, editor when open, list. Do not CSS-reorder a different DOM order.

Implementation QA must cover:

| Check | Pass condition |
| --- | --- |
| 1440×900, 1280×800 | Both inventory screens show full rows and usable 360px editor; account sections align |
| 1024×768, 768×1024 | In-flow forms fit, including custom text quantity; no clipped actions |
| 375×812, 320×568 | Header, long names/email/return URL, amount/unit and confirmations cause no horizontal page scroll |
| Keyboard only | Search, add, edit, cancel, dirty-switch guard, single/batch deletion and consent reachable; focus restored |
| Zoom/text | 200% zoom and 400% reflow equivalent to 320 CSS px keep content/actions usable |
| Light/dark/system | Normal text >=4.5:1; essential control boundaries/focus >=3:1; selected states distinguishable |
| Reduced motion | No required animation; skeleton pulse and smooth scrolling disabled |
| Data states | Unknown quantity, count, custom text, long/duplicate names, empty/search empty, loading and failure remain distinct |
| Write failures | Draft survives; double submission prevented; confirmed write plus failed refresh is not repeated |
| Account/consent | Unknown status honest; identity/access/return address visible; error and submitting states readable |

These are implementation acceptance checks, not claims of completed browser QA.

## Delivery slices and acceptance mapping

This issue's deliverable is this spec. Subsequent implementation should proceed
as reviewable slices: (1) shared responsive shell and Pantry editor, (2) Tools
parity, (3) Account presentation and consent layout, preserving existing auth.
Before application coding read installed Next.js guides; before auth behavior
changes follow `src/mcp/AGENTS.md` and relevant current provider documentation.
No database migration or connection-status backend is required by this design.

| Issue requirement | Covered by |
| --- | --- |
| Account linking / connection state | Account state table, focused consent layout, evidence boundaries |
| Pantry | Width-specific wireframes, quantities, groups, editor and bulk flows |
| Tools | Shared shell with explicit columns, fields and actions |
| Representative desktops | Exact 1440/1280/1024 dimensions and arrangements |
| Responsive behavior | Breakpoints, narrow wireframe, mobile and zoom contracts |
| Accessibility | Semantics, focus, contrast, announcements and QA matrix |
| Mise visual language, active scope | Token/type contract; three destinations; no chat/history controls |
