# Mobile cooking spike — 2026-09-07

Related: #224, #225, PRs #233 and #234.

## Recommendation

**Defer the Cooking Mode widget. Keep the four inventory tools and use a
plain-text recipe handoff in ChatGPT. First restore and verify a live kitchen
read through the intended connection.** This is a recommendation from the
technical spike, not a claim that the phone study has passed or that the user
has accepted a new product direction.

A widget cannot resolve unavailable host tools or a failing connection. The
existing tools already supply inventory and explicit updates; a recipe can be
prepared by the host without new storage, a rendering tool, or a custom voice
service. Keep the Worker/web separation. These observations do not justify a
hosting migration.

The target assumed for this recommendation is the regular ChatGPT mobile app.
Paired Remote is a separate optional route, not a requirement to keep a laptop
running to use a kitchen assistant.

## What was actually checked

Source baseline: `origin/main` at
`5df19332e8d2a3c55e644fb9efc626d8dfa57964`. The original local checkout was
behind this revision; checks ran in a separate worktree at the newer baseline.

| Check | Result | What it establishes |
| --- | --- | --- |
| PR #233 and #234 | Merged | Implementation is in GitHub main; not proof of deployed revision or refreshed host metadata |
| Node 24.19.0; protocol and candidate-contract tests | 68/68 pass | Local protocol, prompt registration, and mutation-summary contracts with test doubles; not mobile, production database, or speech acceptance |
| Connected `mise.read_kitchen` | Two attempts returned MCP `-32603 Internal error` | This desktop connector path cannot currently supply a verified fresh kitchen result |
| Connected `mise_foundation_test.read_kitchen` | One attempt returned the same error | This connected synthetic test path is unavailable for this study |
| Direct documented Worker `/health`, protected-resource discovery, unauthenticated `/mcp` initialize | HTTP 403; initialize body reports Cloudflare error 1010, `browser_signature_banned` | This environment's probe is denied at the edge; does not establish the cause of the connector error or an outage for other clients |
| Actual phone, lock screen, live speech, timers, widget rendering | Not tested | No device access or phone observations were supplied |

No pantry mutations were made. Failure durations are not successful tool-latency
measurements. The probes did not identify the deployed revision or prove that
the installed connection uses the documented Worker URL.

Reproduce the local checks with the repository's Node 24 runtime:

```sh
pnpm exec vitest run src/__tests__/mcp/protocol.test.ts src/__tests__/mcp/candidate-contract.test.ts
```

## Capability boundaries

Official documentation was fetched on 2026-09-07. Availability statements must
be kept specific to the surface they describe.

- [Developer mode](https://developers.openai.com/api/docs/guides/developer-mode)
  documents web eligibility and selecting an app for a conversation. It does
  not establish that this private Mise connection is available in native mobile
  live voice. Write confirmation can require interaction, so hands-free writes
  are not an established capability.
- [ChatGPT Voice](https://learn.chatgpt.com/docs/features/voice) describes desktop
  voice and iOS Remote paired to a desktop, and distinguishes dictation from a
  live voice conversation. This does not prove native mobile Mise access.
- [MCP testing guidance](https://developers.openai.com/plugins/deploy/connect-chatgpt)
  requires testing tool selection in ChatGPT separately from direct protocol
  inspection. A discovered tool or registered MCP prompt is not evidence of a
  visible mobile starter or correct conversational selection.
- [Optional UI guidance](https://developers.openai.com/plugins/build/chatgpt-ui)
  supports selected-tool iframe resources, model context updates, and optional
  display modes. Widget state is scoped to a rendered instance; durable state
  belongs on the server. Thus “voice always hides widgets” is too broad, while
  this phone's actual presentation remains unverified.
- The [component bridge reference](https://developers.openai.com/plugins/reference)
  supplies no documented native alarm scheduling guarantee. Do not interpret a
  JavaScript countdown or a spoken confirmation as a reliable locked-phone alarm.

## What to use, and how

1. **Before cooking:** in a supported ChatGPT conversation, select Mise and ask
   for a fresh kitchen read. Verify an actual successful tool result before
   describing a recipe as pantry-grounded. If it fails, report the failure and
   offer a recipe based only on ingredients the user supplies.
2. **Choose and prepare:** settle on one recipe, servings, equipment, ingredients,
   and substitutions. Put a short numbered recipe in that same conversation.
   Explicitly label missing ingredients and unknown quantities. Planning does
   not consume pantry items.
3. **At the stove:** use the recipe text. Try dictation or live voice for “repeat
   step 2,” “next step,” and substitutions where available. Voice can discuss
   an already-prepared recipe without claiming it has refreshed Mise. Resume
   explicitly with the last completed step if conversation state is unclear.
4. **Timers:** use the phone's Clock timer as the baseline and confirm an actual
   timer exists. Test its audible alert with the phone locked before relying on
   the setup. Do not add a custom timer to Mise in this slice.
5. **After cooking:** return to a supported tool-enabled conversation and report
   actual consumption. Read fresh state, apply explicit updates, then reread.
   Partial consumption is an edit; explicit exhaustion removes the pantry item.
   Never report a saved update solely because the voice assistant said “done.”

Copyable starting request:

> Use Mise to read my current kitchen. Suggest three meals for one person,
> under 20 minutes, using one pan if possible. Separate what I have from what
> is missing; unknown quantities are unknown. After I choose, give me one short
> numbered recipe with the ingredients and equipment first. Do not change my
> inventory while planning. If Mise fails, tell me before making suggestions.

## Next slice and decision gates

**Immediate engineering slice: diagnose the connected read.** Confirm the
installed endpoint and authentication state, inspect sanitized edge/transport
outcomes for a correlated request, distinguish the Cloudflare probe denial from
application failures, and prove one authenticated read in Inspector followed by
a fresh ChatGPT call. Do not weaken authentication or edge policy to make a
probe pass. No root cause is assigned from the generic connector error.

**Small remaining phone check:** record device/OS, ChatGPT version, account mode,
and connection. Confirm (1) a fresh read in text/dictation, (2) whether live voice
can perform another fresh read versus merely narrating old context, and (3)
recipe resumption and a real timer alert after screen lock. Mark unavailable
surfaces as unavailable. Keep #224 open until the phone evidence is recorded.

**Only revisit UI after that:** if a real cooking walkthrough still loses the
user's place, prototype one current-step/checklist view and compare it with the
same recipe in text. Treat reduced scrolling and successful resumption as the
benefit to demonstrate. Defer portion scaling, pantry matching, and timers until
individually justified.

If that experiment earns implementation, use a dedicated render tool after
`read_kitchen`, official `@modelcontextprotocol/ext-apps` helpers compatible with
the installed SDK, a build-time bundled HTML resource imported by the Worker,
`text/html;profile=mcp-app`, and a versioned URI. Send step changes through the
standard model-context bridge; feature-detect optional host state/display APIs.
Keep pantry writes behind the existing explicit actions. A checklist tap must
not silently consume inventory. Verify CSP, theme, restoration, and the actual
phone host before shipping. A separate render tool would be a deliberate future
extension, not a fifth inventory action introduced by this spike.
