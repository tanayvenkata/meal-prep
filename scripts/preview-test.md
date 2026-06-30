# Headless testing of Vercel Preview deployments

Preview deployments are gated behind Vercel SSO (`vercel.com/sso-api`). To drive them
with Playwright/curl headlessly, use the **Protection Bypass for Automation** token.

- **Token:** `VERCEL_AUTOMATION_BYPASS_SECRET`, stored in **Doppler `dev` config only**
  (it's dev-time test tooling — the deployed app never uses it; not in `prd`/`stg`).
- **⚠️ Previews hit the PROD DB** (staging DB is #21, deferred). Treat the token like a
  prod credential: never commit it, never put it in a PR. Rotate in Vercel
  (Settings → Deployment Protection → Protection Bypass for Automation) if it leaks.
- **Test account for UI checks:** there is an isolated throwaway login (`user@gmail.com`)
  whose pantry/chat data is disposable — you may freely sign in as it and add/send/delete
  while testing layout or flows. Its rows are user-scoped (`where user_id = ...`), so it
  can't touch any other user's data. Don't put its password in a committed file. The
  "hands off prod data" caution above is about *other* users' rows, not this account.

## Get past the gate

Append to the first navigation (sets a cookie so later navigations in the same browser
context stay unblocked — needed for multi-step flows like sign-in → redirect):

```
<preview-url>/login?x-vercel-protection-bypass=$TOKEN&x-vercel-set-bypass-cookie=true
```

Or send header `x-vercel-protection-bypass: $TOKEN` on every request.

## Run a Playwright script against a preview

```bash
SKILL_DIR=~/.claude/plugins/cache/playwright-skill/playwright-skill/4.1.0/skills/playwright-skill
doppler run --config dev -- bash -c "cd '$SKILL_DIR' && node run.js /tmp/my-test.js"
# inside the script: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
```

Find the preview URL on a PR:
`gh pr view <N> --json comments --jq '.comments[].body' | grep -oE 'https://[^ )]*vercel.app'`
</content>
