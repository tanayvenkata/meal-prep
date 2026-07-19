# Contributing — how we work on this repo

> This file is **how we work** (process). It's different from:
> - `README.md` — *what* the app is + how to run it
> - `docs/PROJECT.md` — the project's *why* (decision log + current state)
>
> New here (human or AI agent)? Read this before opening an issue or PR.

---

## The mental model (the one thing to remember)

There is **one backlog**, not separate "feature / bug / design" lists. Every piece of
work competes in the same funnel on two questions:

1. **Is it broken, unsafe, or blocking?** → it jumps the queue (`jump-queue`).
2. If not → **how much value for how much effort?** → it lands on the value/effort grid.

The *category* of work (feature vs bug vs polish) is **not** its priority. They're
independent. An issue has BOTH a `type:` label (what kind) AND a priority (how urgent) — the
`type:` is a label on the issue, the priority is a field on the board. Different homes (below).

**"Value" for this project** = does it push the app toward its real vision AND teach a
transferable skill I don't already have. (This is a learning project — see `docs/PROJECT.md`.
At a company, "value" would mean user/business impact instead. The framework is the same;
only the definition of value changes.)

---

## Labels

Two families, set independently on every issue.

### `type:` — what kind of work (the "iron triangle")
Healthy work spends across all of these over time, so nothing rots.

| Label | Meaning |
|---|---|
| `type: feature` | New value / capability |
| `type: bug` | Something is broken or wrong |
| `type: tech-debt` | Future speed / infra / cleanup |
| `type: polish` | Cosmetic / design finish |

### priority — where on the value/effort grid
**Priority is a board *field* on the Mise Board, NOT a label.** (One fact, one home — a
label + a field would drift. The board groups cleanly by a single-select field; it can't
group cleanly by labels, which are "pick-many.") Set it on the card, group the board by it.

| Priority | Meaning | When |
|---|---|---|
| `jump-queue` | Broken / unsafe / blocking | Do before anything else |
| `do-now` | High value, low effort | Quick wins — grab these |
| `schedule` | High value, high effort | Big bets — plan deliberately |
| `fill-in` | Low value, low effort | When bored or blocked |

> Low value + high effort = **don't** (drop it, or it sits in `schedule` indefinitely).
>
> `type:` stays a **label** (lives on the issue, shows everywhere). Priority is a **field**
> (lives on the board, drives the columns). Different homes, on purpose.

**How the four values relate to the matrix (the part that confuses everyone):** they aren't
four equal boxes. `jump-queue` is a **gate** that sits *in front of* the value/effort grid;
the other three **are** the grid. Read it as a sequence, not a single 2×2:

```
Is it broken / unsafe / blocking?
   ├─ YES → jump-queue        (skip the grid — "on fire" outranks "worth it")
   └─ NO  → place on value/effort grid:
              high value + low  effort → do-now
              high value + high effort → schedule
              low  value + low  effort → fill-in
              low  value + high effort → (no card — drop it)
```

So the 2×2 has four boxes but only **three** become board values — the fourth box
("low value, high effort") is the silent *don't*. And `jump-queue` is the **fourth board
value** because it answers a different question (is it on fire?) than the grid does (value
vs. effort). Four values = one gate + three grid boxes. That's why the count feels off by one.

This is independent from the iron triangle below: `type:` asks *what kind* of work; priority
asks *what's next*. A `type: bug` is often `jump-queue` but not always (a cosmetic bug can be
`fill-in`); a `type: feature` can be `do-now` or `schedule`. Two questions, two homes.

### workflow labels (GitHub defaults we kept)
`documentation`, `duplicate`, `invalid`, `question`, `wontfix` — these tag the *state of
the conversation* on an issue, not the work. Use as needed.

---

## Writing an issue

Every issue body has **three parts**. This is the most important convention here — it's
what makes a ticket a real ticket instead of a vague sticky note.

```
**Context:** Why this exists / what's wrong now.
**What to do:** The actual change.
**Done when:** How you'll know it's finished (acceptance criteria).
```

`Done when` is the part people skip and pros never do — it kills "wait, is this done?"

Add a `type:` label on the issue. (Priority is **not** a label — it's a board field; set it
after the issue exists, see "Setting priority from the CLI" below.) CLI example:

```bash
gh issue create \
  --title "Short, action-shaped title" \
  --label "type: tech-debt" \
  --body "**Context:** ...
**What to do:** ...
**Done when:** ..."
```

The repo issue auto-adds to the Mise Board on creation — you don't run `item-add`. It lands
with **no priority**; set that next.

## Setting priority from the CLI

Priority is a single-select **field** on the board, so you set it on the *card*, not the issue.
It takes three IDs: the project, the card's item, and the chosen option. Find the option IDs
once, then set the value (IDs are environment-specific — look them up, don't memorize them):

```bash
# 1. find the Priority field's option IDs (do-now / schedule / fill-in / jump-queue)
gh project field-list <project-number> --owner <you> --format json

# 2. find the card's item ID for your issue (item id != issue number)
gh project item-list <project-number> --owner <you> --format json

# 3. set the field
gh project item-edit --project-id <PVT_…> --id <PVTI_…> \
  --field-id <PVTSSF_…> --single-select-option-id <option-id>
```

(In the web UI this is one dropdown on the card; the CLI just makes the same edit scriptable.)

**Resolved IDs for *this* repo** (re-verify with the commands above if the board is rebuilt) —
so step 3 is copy-paste; only the `--id` (the card) and the option change:

```bash
# project: PVT_kwHOBompac4Bbx8Z   priority field: PVTSSF_lAHOBompac4Bbx8ZzhWgCwk
# options: jump-queue b30f224d | do-now 88b8d060 | schedule 14ad4357 | fill-in 08850e93

# get the card id for issue #N:
gh project item-list 3 --owner tanayvenkata --format json --limit 100 \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(next(i['id'] for i in d['items'] if i.get('content',{}).get('number')==N))"

# set it (e.g. schedule):
gh project item-edit --project-id PVT_kwHOBompac4Bbx8Z --id <PVTI_…> \
  --field-id PVTSSF_lAHOBompac4Bbx8ZzhWgCwk --single-select-option-id 14ad4357
```

> **Filing an issue is NOT done until its priority is set on the board.** `gh issue create`
> leaves it blank; the board can't be sorted until every card has a priority. Treat the
> two as one operation.

### File + prioritize in one go (the copy-paste an agent runs)

Filing and prioritizing are one operation — here's the whole thing end to end, so neither
the IDs nor the steps get re-derived. Edit the title/label/body and the option id, run it:

```bash
# 1. create the issue (capture its number from the URL gh prints)
N=$(gh issue create \
  --title "Short, action-shaped title" \
  --label "type: tech-debt" \
  --body "**Context:** ...
**What to do:** ...
**Done when:** ..." \
  | grep -oE '[0-9]+$')

# 2. find that issue's card id on the board
ITEM=$(gh project item-list 3 --owner tanayvenkata --format json --limit 100 \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(next(i['id'] for i in d['items'] if i.get('content',{}).get('number')==$N))")

# 3. set its priority (swap the option id: jump-queue b30f224d | do-now 88b8d060 | schedule 14ad4357 | fill-in 08850e93)
gh project item-edit --project-id PVT_kwHOBompac4Bbx8Z --id "$ITEM" \
  --field-id PVTSSF_lAHOBompac4Bbx8ZzhWgCwk --single-select-option-id 88b8d060
```

(IDs are this repo's, resolved above. If the board is ever rebuilt, re-run `field-list` /
`item-list` from the recipe and update them here — one home, kept current.)

---

## Dependencies between issues

GitHub at our scale: use a **soft text mention** in the body — `Blocked by #11`. GitHub
auto-links it; you'll see it every time you open the issue. Nothing enforces it — *you
reading the issue before you start it* is the enforcement. That's enough solo.

(Structured "blocked by" links exist but only earn their keep when tooling acts on them —
a big-company concern. Don't bother yet.)

---

## The work loop

```
sort the work → pick the highest value-for-effort thing that isn't blocked
→ branch → open a PR with "Closes #N" in the description → review → merge
→ merging auto-closes the issue → repeat
```

- **`Closes #N`** in a PR description = the one structured link worth using. Merging the
  PR auto-closes issue N. (Also: `Fixes #N`, `Resolves #N`.)
- A finished issue **leaves the board** — git holds the record of what shipped (the commit
  that closed it). No separate changelog until the app has users who need one.
- A *dropped* issue: close it with a one-line "why we dropped it" comment (decision memory),
  don't just delete silently.

"What do I work on?" = sort the board by the Priority field and grab the top non-blocked card.
(Priority is a board field, not a label, so it's a board view — not a `gh issue list --label`
query. From the CLI: `gh project item-list <n> --owner <you> --format json` and filter on
`priority`.)

---

## Keeping the balance (the iron triangle)

Over time, spend across all three of features / bugs / tech-debt — not 12 features in a
row while the app rots. Rough guide: ~70% features / 20% bugs / 10% debt, flexed to need.
Check it: `gh issue list --label "type: tech-debt"` vs `--label "type: feature"`.

---

## Adding a collaborator

Two separate things a new teammate needs:
- **Access** → Settings → Collaborators → invite their GitHub username.
- **Knowledge** → point them at this file.

## Licensing contributions

Unless explicitly stated otherwise, contributions submitted for inclusion in
Mise are licensed under the repository's [MIT License](LICENSE).

---

## Keeping this from going stale

A tracker only works if it's maintained — and the trick is that maintenance is a
**side-effect of the work, never a separate chore**. Close the issue *in the same PR* that
does the work (`Closes #N`). If updating the board is its own task, it rots; if it's part
of finishing, it can't.
