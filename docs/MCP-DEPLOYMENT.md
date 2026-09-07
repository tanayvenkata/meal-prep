# MCP endpoint verification

## Verified serving path — 2026-09-07

ChatGPT Plugins → Mise → Manage displayed the production connection URL as
`https://meal-prep-tawny-kappa.vercel.app/mcp`, using OAuth. Its protected-resource
metadata independently returned that same resource URL. Three fresh installed
Mise reads in Codex succeeded, each returning 36 pantry entries and 7 pieces of
equipment. Equipment entries are data; the MCP catalog still has four commands.
No inventory writes were made during this diagnosis.

The separately installed Mise Foundation Test app pointed to an ngrok development
endpoint. At 16:10:59 UTC it returned HTTP 404 with `ERR_NGROK_3200` and an explicit
endpoint-offline message. Its connector returned MCP internal error. This is an
unavailable development tunnel, not evidence that production is down.

The Cloudflare Worker returned HTTP 200 for health and HTTP 401 with the expected
Bearer challenge for unauthenticated initialization. A sanitized tail captured
that direct request on version `b833823a-ec4d-468f-bd35-d676c8bad802`, deployed at
13:27:47 UTC. The Worker deployment had not changed since the earlier failure
report. Issue #241's earlier bundle inspection found recent prompt and narration
changes absent there; that finding does not describe the installed Vercel app.

The earlier production connector error and direct Worker 403/1010 were no longer
reproducible. Their historical causes remain unproven. The successful reads prove
the observed connection works; they do not establish every mobile mode, mutation
acceptance, or the exact serving Vercel revision. GitHub main is not sufficient
evidence of a serving revision.

## Diagnose the endpoint the app actually uses

1. Inspect ChatGPT's installed plugin management page. Record the URL,
   authorization mode, and date. Distinguish Mise from development/test plugins.
2. Fetch that origin's `/.well-known/oauth-protected-resource/mcp` and confirm
   its `resource` matches the installed `/mcp` URL. A public health probe alone
   does not verify authentication or database access.
3. Inspect deployment status for that host and record its serving revision.
   Use Vercel deployment evidence for Vercel, or Wrangler deployment evidence
   for the Worker. Do not infer rollout from merge status.
4. Start bounded diagnostics on that same host, then make a fresh installed-app
   read. Keep timestamps, request/trace identifiers, statuses, and revision;
   exclude authorization headers, identities, pantry payloads, and raw exceptions.
5. If the call fails, correlate its host/transport error with server evidence.
   An empty Worker tail says nothing about a Vercel request. An offline test
   tunnel is not a production incident. Do not weaken authentication or edge
   policies to make a probe succeed.

If reads pass and no failure can be correlated, record the historical error as
non-reproducible. Avoid speculative transport patches. Phone-specific acceptance
remains in #224; production telemetry export remains in #22.

## Deployment and any future Worker cutover

Retain the working Vercel connection unless a Worker cutover is deliberately
selected. The existing Worker configuration correctly names the Worker's own
OAuth resource; changing it to Vercel would misidentify that deployment.

Before a cutover, review the intended Worker revision, bindings, secrets, and
resource URL; build and validate it using the repository workflow. Deploy through
the approved rollout, verify authenticated initialization and the four-command
catalog against the target, and refresh installed metadata when it changes.
Switching the installed endpoint is a separate step from deploying code.

Verify a fresh host read and an explicitly isolated synthetic write/read-back,
including rejection and retry behavior. Do not use real pantry contents for a
synthetic acceptance test. Record the serving revision, endpoint, host, and
observed outcomes. Preserve a working rollback path and update this document,
README, and project guidance only when the installed serving path is verified.
