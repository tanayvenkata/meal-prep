# Mise Design Handoff — Implementation Status

Tracks which screens from `README.md` are done, partial, or not started.
Update this file as each screen is implemented. "Visual only" means colors/fonts/layout only — no new backend.

---

## Deferred backlog (features designed but held off — consolidated from the ⬜ rows below)

Surfaced here so they don't get lost in the per-screen tables. Grouped by what unblocks them.

### Visual-only (no backend — can do anytime, good warm-up tasks)
- **Typing indicator** (three-dot "MISE IS THINKING" bubble) — Screen 1 & 7. Tagged for M7.
- **"Today" date divider** between messages — Screen 1.
- **Ember focus ring** on pantry name input (currently ink border) — Screen 6.
- **Input disabled on 401** + conversation dimmed behind error banner — Screen 8.
- ~~**Mobile verification** — test column layout + font sizes in DevTools mobile view.~~ ✅ Verified at 393px (#9); login/chat/fonts clean. Left one defect: pantry add-item row overflows on narrow screens.

### Needs a navigation-model change (the "sheets over chat" model from design CLAUDE.md)
- **Pantry as dismissible sheet over chat** (not the current standalone `/pantry` route) — Screen 2.
- **Grabber handle / swipe-down dismiss** for the sheet — Screen 2.
- **Edit item as a sheet** (chevron › opens it) — Screen 4. Currently inline edit row; was `prompt()`.
- **Pantry pill strip** on the chat screen (needs client-side pantry fetch) — Screen 1 & 5.
- **"PANTRY EMPTY" pill variant** + dimmed send when pantry empty — Screen 5.

### Needs new backend tables (bigger milestones)
- **Chat history + history drawer** — Screen 3. Needs `conversations` + `messages` tables. Tagged **M8**.
  Save each turn; auto-title from the first user message. (Hamburger nav, streak chip, avatar all hang off this.)
- **Dish log** — powers all gamification. Logs name/cuisine/time/taste/tools per cooked dish. Design says
  "log from dish #1," so this is the foundational data table for the north-star features below.
- **Cooking Wrapped + cuisine passport + profile/stats** — north-star (designed, build later). Read from the
  dish log. Monthly engine first, yearly is the same card scaled. Stay concept-level until scheduled.

### Not yet designed at all
- **Desktop pass** (mirror house style to a real desktop layout) — we adapted visually within `max-w-2xl`,
  but a true desktop design doesn't exist yet.
- **Onboarding / signup flow** and **settings / account** screens.

---

## Color tokens & typography
| Token | Status | Notes |
|---|---|---|
| Paper `#f6f1e7` | ✅ Done | App background via `--paper` in `globals.css` |
| Surface `#fffdf8` | ✅ Done | Cards, nav bar, assistant bubbles |
| Pantry-strip `#f1ead9` | ✅ Done | Mic button fill |
| Ink `#221d18` | ✅ Done | User bubbles, primary text |
| Ember `#c8492f` | ✅ Done | Send button, Add button, login CTA |
| Sand `#e6dcc8` | ✅ Done | Borders, dividers |
| Muted `#8a8073` | ✅ Done | Secondary text |
| Spectral serif | ✅ Done | Wordmark "Mise", page headings |
| Geist / Geist Mono | ✅ Done | Already in repo |

---

## Screens

### Screen 1 — Chat (home)
| Element | Status | Notes |
|---|---|---|
| Nav: wordmark "Mise" in Spectral | ✅ Done | |
| Nav: sticky top-of-page | ✅ Done | `sticky top-0 z-10` |
| Nav: warm surface bg + sand border | ✅ Done | |
| Conversation scrolls, nav fixed | ✅ Done | `min-h-0 flex-1 overflow-y-auto` |
| User bubbles: ink bg, paper text | ✅ Done | `rounded-2xl rounded-br-md` |
| Assistant bubbles: surface bg, soft shadow | ✅ Done | `rounded-2xl rounded-bl-md` |
| Input bar: pill shape, surface bg | ✅ Done | `rounded-full` |
| Mic button: pantry-strip fill, Mic icon | ✅ Done | Ember fill when active |
| Send button: ember circle, ArrowUp icon | ✅ Done | Disabled/dimmed when no input |
| Empty state: M monogram + Spectral heading | ✅ Done | |
| Auto-scroll to latest message | ✅ Done | `useEffect` on messages/reply |
| Nav: hamburger (history drawer) | ⬜ Not started | Needs history backend (M8) |
| Nav: streak chip | ⬜ Not started | Needs dish log data |
| Nav: avatar | ⬜ Not started | Needs user profile |
| Pantry pill strip | ⬜ Not started | Needs client-side pantry fetch |
| "Today" date divider between messages | ⬜ Not started | Visual only, no backend needed |
| Typing indicator (three dots) | ⬜ Not started | Visual, do in M7 |

### Screen 2 — Pantry (sheet over chat)
| Element | Status | Notes |
|---|---|---|
| Spectral heading "My Pantry" | ✅ Done | On `/pantry` route (not a sheet yet) |
| Mono item count | ✅ Done | |
| Warm tokens throughout | ✅ Done | |
| Loading skeleton (no flash) | ✅ Done | Animated pulse placeholders |
| Empty state with dashed circle | ✅ Done | |
| Item list: surface cards, sand dividers | ✅ Done | |
| Ember "Add" button | ✅ Done | |
| Pantry as dismissible sheet over chat | ⬜ Not started | Navigation model change — future PR |
| Grabber handle / swipe-down dismiss | ⬜ Not started | Depends on sheet |
| Chevron › opens Edit sheet | ⬜ Not started | Depends on Edit sheet |

### Screen 3 — History drawer
| Element | Status | Notes |
|---|---|---|
| Everything | ⬜ Not started | Needs `conversations` + `messages` tables (M8) |

### Screen 4 — Edit item sheet
| Element | Status | Notes |
|---|---|---|
| Everything | ⬜ Not started | Currently uses `prompt()` — replace in future PR |

### Screen 5 — Chat empty (new user / no pantry)
| Element | Status | Notes |
|---|---|---|
| M monogram + Spectral heading | ✅ Done | Generic empty state implemented |
| "PANTRY EMPTY" pill strip variant | ⬜ Not started | Needs pantry pill strip first |
| Dimmed send button when pantry empty | ⬜ Not started | Needs pantry data on chat page |

### Screen 6 — Pantry empty state
| Element | Status | Notes |
|---|---|---|
| Dashed circle + empty prompt | ✅ Done | |
| Ember focus ring on name input | ⬜ Not started | Currently uses ink focus border |

### Screen 7 — Chat (Mise thinking / typing indicator)
| Element | Status | Notes |
|---|---|---|
| Typing indicator bubble | ⬜ Not started | Visual — do in M7 |
| "MISE IS THINKING" mono caption | ⬜ Not started | |

### Screen 8 — Error (session timed out)
| Element | Status | Notes |
|---|---|---|
| Inline error banner with ember "!" disc | ✅ Done | In `ChatWindow.tsx` |
| Conversation dimmed behind banner | ⬜ Not started | Would need overlay logic |
| Input disabled on 401 | ⬜ Not started | Currently just shows banner |

---

## Login page (not in design handoff — added by us)
| Element | Status | Notes |
|---|---|---|
| M monogram + Spectral heading | ✅ Done | |
| Warm input fields, sand borders | ✅ Done | |
| Ember "Sign in" button | ✅ Done | |

---

## Icons
| Icon | Status | Notes |
|---|---|---|
| Mic (lucide-react) | ✅ Done | Replaces 🎤 emoji |
| ArrowUp / send (lucide-react) | ✅ Done | |
| Plus, Search, Hamburger, ✕, Chevron | ⬜ Not started | Needed when their screens are built |

---

## Mobile responsiveness
| Item | Status | Notes |
|---|---|---|
| Column layout works on mobile | ✅ Done | `max-w-2xl` centered column. Verified 393px (#9): chat + login no overflow. **Defect:** pantry add-item row overflows — see below. |
| Verified on real mobile / DevTools | ✅ Verified | Verified #9 — prod app at iPhone 14 Pro (393×852) via Playwright. Login, chat (incl. send + streamed reply), pantry list all OK. One defect filed: pantry add form. |
| Font sizes appropriate on small screens | ✅ Verified | Body 16px, headings 24px, inputs/buttons 14px — readable at 393px. |
