# Handoff: Mise — mobile app (core 8 screens)

## Overview
**Mise** is a pantry-aware AI cooking app. The user chats with a sous-chef character ("Mise") who
suggests meals from the ingredients they actually have. This handoff covers the **8 core mobile
screens** (shippable hi-fi) plus an appendix of **north-star features** to build later.

The existing codebase is **Next.js + Supabase** (chat streaming via `/api/recipes`, pantry CRUD via
`/api/pantry`, Geist + Geist Mono already loaded, accent token in `globals.css`). These designs replace
the current bare-bones UI.

## About the design files
The files in this bundle are **design references created in HTML** — prototypes showing intended look
and behavior, **not production code to copy directly.** The task is to **recreate them in the existing
Next.js codebase** using its established patterns (React components, Tailwind, the `globals.css` token
variables). Rebuild the markup natively; do not paste the HTML in.

Open any `.dc.html` file in a browser to view it (they need the bundled `support.js` beside them).
See `/screens/*.png` for a rendered image of each screen.

## Fidelity
**High-fidelity.** Final colors, type, spacing, and copy. Recreate pixel-faithfully using the codebase's
libraries. Where a value isn't specified, follow the Design Tokens section.

## Source of truth
`DESIGN.md` holds the canonical tokens, voice rules, nav model, and
backend build order. Read it first.

---

## Design tokens

### Color
| Token | Hex | Use |
|---|---|---|
| Paper | `#f6f1e7` | App background |
| Surface | `#fffdf8` | Cards, assistant bubbles, nav bar |
| Pantry strip | `#f1ead9` | Pill-strip background, icon-button fills |
| Ink | `#221d18` | Primary text; **user message bubbles** |
| Panel | `#1c1813` | Dark — stat HUDs & Wrapped ONLY |
| Ember | `#c8492f` | PRIMARY accent — one per screen (the main action) |
| Olive | `#5c6b3f` | Secondary accent (labels) |
| Sand | `#e6dcc8` / `#e0d4bf` | Hairlines, borders |
| Muted | `#8a8073` / `#9a8f7e` | Secondary text |
| Error border | `#e6c4ba` | Error banner border |

**Color discipline:** ember appears once per screen. User's own words are ink. Dark Panel is reserved
for stat HUDs (the future profile/Wrapped), not general chrome.

### Type
- **Spectral** (serif) — wordmark + headings. 26 (sheet H2) / 24 / 21 (wordmark).
- **Geist** (sans) — all UI + body. 15 / 14.5 / 13.5 / 12.
- **Geist Mono** — numbers, eyebrows, labels, stat values. UPPERCASE, letter-spacing ~0.05em.
- Geist + Geist Mono already in the repo. **Spectral is new** (Google Fonts).

### Shape & elevation
- Radii: cards 12–16px · sheets 26px (top corners) · pills 999px · phone frame 42px.
- Prefer **soft shadow** `0 1px 4px rgba(34,29,24,.07)` over 1px borders on cards.
- Input bar / floating elements: `0 2px 12px rgba(34,29,24,.08)`.
- Spacing scale: **4 / 8 / 12 / 16 / 24 / 32**.

### Icons
Real line icons (feather-style), stroke ~2.2, currentColor. **No emoji in product UI.**
Used: plus (attach / add), mic, up-arrow (send), search (magnifier), hamburger (3 bars), ✕ (close), › (chevron).

---

## Navigation model
Three axes, never mixed:
1. **Sessions → History.** Left drawer via hamburger (☰). A destination (back-stack).
2. **The conversation → Chat.** Home base.
3. **Context / tools → Pantry, attach, voice.** Dismissible **sheets** over chat; dismiss returns the
   user exactly where they were (no route change, scroll preserved).

- Profile/stats sits behind the **avatar** (top-right) — future.
- Input bar is the hub: `[+ attach] [text field] [mic] [send]`.

---

## Screens

### 1 — Chat (home)
- **Purpose:** the main surface; talk to Mise, who cooks from your pantry.
- **Layout (top→bottom):** status bar (50px) · nav (hamburger left · wordmark absolute-centered · right group = streak chip + avatar) · pantry pill strip (horizontal scroll) · conversation (flex column, gap 14, scrolls) · input hub · home indicator (22px).
- **Nav:** hamburger = 3 bars (#544c41). Wordmark "Mise" Spectral 600 21px, `position:absolute; left:50%; translateX(-50%)` so side widths don't shift it. Streak chip: pill `#f1ead9` + sand border, ember mono "12" + muted mono "DAYS". Avatar: 34px circle `#e6dcc8`, initial in Geist 600.
- **Pantry strip:** bg `#f1ead9`. Leads with mono label "PANTRY". Pills: `#fffdf8`, sand border, Geist 12.5 #544c41. Trailing dashed-border circle with + icon = add.
- **Bubbles:** "Today" divider = mono 10.5 uppercase #b3a892, centered. Assistant: Surface bg, soft shadow, no border, radius `16 16 16 5`, ink text 14.5. User: Ink bg `#221d18`, paper text, radius `16 16 5 16`. max-width 82%.
- **Input hub:** Surface pill, soft shadow, radius 999. Left + (attach) and mic = 38px circles `#f1ead9` with line icons. Send = 42px ember circle, white up-arrow icon.
- **Copy:** see file for exact Mise lines (warm, brief, no em dashes).

### 2 — Pantry (context sheet)
- **Purpose:** edit the ingredients Mise reasons over. Opens *over* chat.
- **Layout:** dimmed chat behind (`rgba(28,24,19,.40)`); sheet from 96px down, Paper bg, radius `26 26 0 0`, top shadow `0 -6px 30px rgba(28,24,19,.22)`. Grabber handle (42×5 #d8cdb8). Header: H2 "My Pantry" Spectral 26 + mono count "12 ITEMS"; ✕ button (34px #e8dfcd). Add row: name input (flex) + qty input (70px) + ember "Add". **Both inputs are free text (full keyboard, `inputmode="text"`)** — quantities like "1 stick". Sort control: "Recently added ▾". List: Surface cards, soft shadow, radius 13; name Geist 14.5 600, qty Geist Mono 12 muted, chevron › #c9bda4 (opens Edit).
- **Dismiss:** swipe-down or ✕ → back to chat, scroll preserved.

### 3 — History (drawer)
- **Purpose:** past conversations; start new.
- **Layout:** left drawer 84% width, Surface bg, shadow `6px 0 30px`. Dimmed rest. Status bar · header "Conversations" Spectral 24 + ✕ · ember "New conversation" button (with + icon) · **search field** (`#f1ead9`, magnifier icon, "Search conversations") · list grouped by mono date headers ("TODAY", "YESTERDAY"); each item = card, title Geist 14 600 + muted snippet. Active/today item tinted `#f1ead9`.
- **Backend:** needs persisted conversations + messages (see build order).

### 4 — Edit item (sheet)
- **Purpose:** rename / re-quantity / remove a pantry item. Replaces the old browser `prompt()`.
- **Layout:** sheet from bottom, Paper, grabber, H2 "Edit ingredient" + ✕. Fields: Name (sand border) and Quantity (ember 1.5px focus border) — labels in mono uppercase. Actions: ember "Save changes" full-width; "Remove from pantry" text button `#a23a2a`.

### 5 — Chat empty (new user)
- **Purpose:** first-run; pantry empty so Mise can't suggest yet. Point at one action.
- **Layout:** nav has **no streak** (new user) — hamburger · wordmark · avatar only. Pill strip shows "PANTRY EMPTY" + dashed "Add ingredients" chip. Body centered: 76px ink tile with ember "M", H2 "Let's stock your kitchen" Spectral 27, muted subcopy, ember "Add your first ingredient". Input present but dimmed (send is sand, not ember) until there's a pantry.

### 6 — Pantry empty
- **Layout:** same sheet as #2 but count "0 ITEMS", the name input carries the ember focus ring (the hero), and the list area is a centered empty prompt: dashed 62px circle with + icon, "Nothing here yet", muted guidance.

### 7 — Chat (Mise thinking)
- **Layout:** like #1; latest user bubble, then a typing-indicator bubble (Surface, soft shadow, three dots: ember `#c8492f`, then `#d8b5ab`, then `#e6dcc8`), then centered mono caption "MISE IS THINKING". Reply then streams in token by token (the existing stream from `/api/recipes`).

### 8 — Error (session timed out)
- **Layout:** like #1; an inline banner pinned under the nav: Surface card, border `#e6c4ba`, soft shadow, ember "!" disc + title "Your session timed out" + muted body + ember "Sign in again". Conversation behind is dimmed (opacity .4); input disabled (muted). Recoverable, never a dead end. Maps to the existing 401 case in `ChatWindow.tsx`.

---

## Interactions & behavior
- **Send:** append user (ink) bubble immediately (optimistic); stream Mise reply into an assistant bubble; show typing indicator until first token.
- **Pantry pill tap / strip + :** open Pantry sheet (context, modal). Tapping a chip may deep-link to that item's Edit sheet. ✕ / swipe-down dismiss.
- **Hamburger:** open History drawer; swipe-left / ✕ / backdrop tap to close.
- **Chevron on pantry row:** open Edit sheet.
- **Loading:** typing indicator for chat; skeletons (not spinners) for list fetches.
- **Error:** inline, recoverable banners — never blank screens.
- **Motion:** keep minimal for v1 (sheets slide up, drawer slides in). No decorative animation yet.

## State
- `messages[]` (role, content) — **persist** (see backend); currently lost on refresh.
- `conversations[]` + active conversation id.
- `pantry[]` (id, name, quantity).
- `input`, `listening` (mic), `streaming`/`reply`, `error`.
- Streak / dishes / memory — read-only from the dish log (future).

## Voice (Mise) — applies to ALL assistant copy
Sharp but never mean, hypes wins, has opinions, hates waste, brief by default. Writes like a person texting.
**Never:** em dashes; "it's not X, it's Y"; "you're not X, you're Y"; "Great question!"; emoji spam.

## Assets
- Fonts: **Spectral** (new, Google Fonts), Geist + Geist Mono (already in repo).
- Icons: inline line SVGs (in the files) — replace with the repo's icon set (e.g. lucide/feather) at stroke ~2.2.
- No raster images. Avatar is a placeholder initial.

## Files in this bundle
- `Meal Prep App.dc.html` — **canonical**: all 8 screens. (needs `support.js` beside it)
- `Meal Prep House Style.dc.html` — style tile (tokens/type/components reference).
- `Meal Prep Charm.dc.html` — Mise persona + Cooking Wrapped (north star).
- `Meal Prep Navigation Map.dc.html` — the nav model diagram.
- `support.js` — runtime for the `.dc.html` files.
- `DESIGN.md` — source-of-truth spec.
- `screens/*.png` — rendered image of each screen.

---

## Appendix — North-star features (design later, **but log the data now**)
These are designed at concept level (`Meal Prep Charm.dc.html`). Do **not** build the screens yet, but
the **data they need must be captured from day one**, or they'll launch empty.

- **Cooking Wrapped (monthly + yearly):** dishes made, top 4, cuisines, streak, hours, a Mise note.
  Yearly = the same card scaled up — build the monthly engine once. Reads entirely from the dish log.
- **Cuisine passport:** collection of cuisines cooked (stamps).
- **Profile / stats:** behind the avatar; streak, dishes, passport, entry to Wrapped.
- **Dish-made ritual:** a context sheet off chat to mark a dish cooked + rate taste — this is what
  *writes* the dish log.

### Backend build order (designs surfaced this)
1. **Core loop first** — it generates the data.
2. **Chat history:** `conversations` (id, user, title, created) + `messages` (conversation_id, role,
   content, time). Save each turn; auto-title from the first user message.
3. **Dish log** (powers all gamification): per cooked dish log name, cuisine, time, taste rating, tools
   used (airfryer, etc.). Log from dish #1.
4. **Wrapped / passport** read from the dish log. Monthly engine first.
5. **Pantry:** name + structured amount/unit for measurable inventory, with `count`
   for discrete items and an explicit custom-text fallback for estimates. Never infer
   a missing unit from display text. No "low" flag for now — let the LLM infer scarcity.
