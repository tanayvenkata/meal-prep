# Mise — Design System & Product Spec

(App renamed from "Meal Prep" to **Mise** — the app and the sous-chef character now share one name.)

A pantry-aware AI cooking app. Conversation-first, with zero-friction capture (photo/receipt),
gamification (streaks, dishes, cuisine passport, Cooking Wrapped), and RAG memory of taste/preferences.
Built well on purpose — "AI products don't have to be garbage."

Source app is a Next.js + Supabase codebase (chat + pantry). These designs are the spec for it.

## Design files (canvas explorations)
- `Meal Prep App.dc.html` — **the canonical app**: all 8 mobile screens in house style. Start here.
- `Meal Prep House Style.dc.html` — the style tile (tokens, type, components).
- `Meal Prep Charm.dc.html` — Mise (the character) + Cooking Wrapped (viral north star).
- `Meal Prep Navigation Map.dc.html` — the nav model (axes: sessions vs context/tools).
- `Meal Prep Flow Wireframe.dc.html` / `Meal Prep Mobile Wireframe.dc.html` — lo-fi flow + mobile structure.
- `Meal Prep Redesign.dc.html` — earlier desktop hi-fi (pre-house-style; not the source of truth).

## Brand: "The Pass, with a line cook's speed"
Editorial warmth as the base; mono HUD energy as the accent. Fast, snappy, confident — never soft or cutesy.

## Tokens
- Paper (bg): `#f6f1e7`
- Surface (cards): `#fffdf8`
- Pantry-strip bg: `#f1ead9`
- Ink (text / user bubbles): `#221d18`
- Panel (dark, for stat HUDs only): `#1c1813`
- Ember (PRIMARY accent — use rarely): `#c8492f`
- Olive (secondary): `#5c6b3f`
- Sand (hairlines): `#e6dcc8` / `#e0d4bf`
- Muted text: `#8a8073` / `#9a8f7e`
- Radii: cards 12–16px, sheets 26px, pills 999px, phone 42px
- Elevation over borders: prefer soft shadow `0 1px 4px rgba(34,29,24,.07)` to 1px borders on cards.

Color discipline: ember appears ONCE per screen (the primary action). User's own words are ink.
Panel/dark is reserved for stat HUDs and the Wrapped card.

## Type
- **Spectral** (serif) — wordmark, headings. Sizes 38/28/24/21.
- **Geist** (sans) — all UI & body. 15/14.5/13.5/12.
- **Geist Mono** — numbers, labels, stats, eyebrows (the "HUD" signal). UPPERCASE, letter-spacing ~0.05em.
- Geist + Geist Mono already exist in the codebase. Only Spectral is new.

## Icons
Real line icons (feather-style), stroke ~2.2. NO emoji in product UI.

## Navigation model (decided)
Three axes, never mixed:
1. **Sessions** → History. Left drawer (hamburger ☰). A destination, in the back-stack.
2. **The conversation** → Chat. Home base.
3. **Context / tools** → Pantry, image attach, voice. Dismissible sheets over chat; return you exactly where you were.
- Profile/stats lives behind the avatar (top-right). Cooking Wrapped is an earned artifact reached from profile + monthly notification.
- Input bar is the hub: `[+ attach] [text] [mic] [send]`.

## Mise — the name & the character (voice = brand)
The app IS the sous-chef: "Mise." /meez/, from *mise en place*. Wordmark in Spectral.
Competence first, personality as seasoning: Mise is good at this, and that comes through
before the character does. Personality: direct, a little dry, hypes your wins, has
opinions, hates waste, brief by default. No forced whimsy — don't anthropomorphize
ingredients or reach for a cute line when a plain one will do.
**Never:** em dashes; "it's not X, it's Y"; "you're not X, you're Y"; "Great question!"; emoji spam.
Writes like a competent person texting, not an AI reading a script.
Sample: "Chicken thighs and spinach, you're set. Garlic, butter, wilt the spinach at the end so it doesn't turn to soup. Twenty minutes. Want the steps or just the shape of it?"

## Screen inventory
Done (hi-fi mobile, house style): Chat, Pantry sheet, History, Edit item, Chat-empty, Pantry-empty, Chat-typing, Error.
North-star (designed, build later — need data): Cooking Wrapped (monthly + yearly), cuisine passport, profile/stats, dish-made ritual.
Not yet done: desktop pass (mirror house style), onboarding/signup, settings/account.

## Backend implications surfaced by design (build in this order)
1. **Core loop** must work first — it generates the data.
2. **Chat history**: needs `conversations` (id, user, title, created) + `messages` (conversation_id, role, content, time). Save each turn; auto-title from first user message.
3. **Dish log** (powers all gamification): each cooked dish logs name, cuisine, time, taste rating, tools used. Log from dish #1.
4. **Cooking Wrapped / Passport** read from the dish log. Monthly engine first; yearly is the same card scaled up.
5. Pantry: name + quantity (free text — full keyboard, not numeric). No "low" flag for now; let the LLM infer.

## Fidelity discipline
Core 8 screens = shippable hi-fi. New features (profile, passport, ritual) stay concept-level until scheduled. Don't over-polish unbuilt features.
