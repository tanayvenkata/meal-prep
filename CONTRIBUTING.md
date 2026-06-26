# Contributing — how we work on this repo

> This file is **how we work** (process). It's different from:
> - `README.md` — *what* the app is + how to run it
> - `CLAUDE.md` — the project's *why* (decision log + current state)
>
> New here (human or AI agent)? Read this before opening an issue or PR.

---

## The mental model (the one thing to remember)

There is **one backlog**, not separate "feature / bug / design" lists. Every piece of
work competes in the same funnel on two questions:

1. **Is it broken, unsafe, or blocking?** → it jumps the queue (`jump-queue`).
2. If not → **how much value for how much effort?** → it lands on the value/effort grid.

The *category* of work (feature vs bug vs polish) is **not** its priority. They're
independent. An issue has BOTH a `type:` label (what kind) AND a priority label (how urgent).

**"Value" for this project** = does it push the app toward its real vision AND teach a
transferable skill I don't already have. (This is a learning project — see CLAUDE.md.
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

Add both a `type:` and a priority label. CLI example:

```bash
gh issue create \
  --title "Short, action-shaped title" \
  --label "type: tech-debt" --label "do-now" \
  --body "**Context:** ...
**What to do:** ...
**Done when:** ..."
```

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

"What do I work on?" is a query: `gh issue list --label "do-now"`.

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

---

## Keeping this from going stale

A tracker only works if it's maintained — and the trick is that maintenance is a
**side-effect of the work, never a separate chore**. Close the issue *in the same PR* that
does the work (`Closes #N`). If updating the board is its own task, it rots; if it's part
of finishing, it can't.
