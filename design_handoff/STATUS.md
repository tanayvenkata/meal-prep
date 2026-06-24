# Mise Design Handoff — Implementation Status

Tracks which screens from `README.md` are done, partial, or not started.
Update this file as each screen is implemented. "Visual only" means colors/fonts/layout only — no new backend.

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
| Column layout works on mobile | ✅ Done | `max-w-2xl` centered column, no horizontal overflow |
| Verified on real mobile / DevTools | ⬜ Not verified | Test in browser DevTools mobile view |
| Font sizes appropriate on small screens | ⬜ Not verified | |
