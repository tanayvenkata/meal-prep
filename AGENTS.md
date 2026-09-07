<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project orientation

- Current objective (2026-09-06): establish an empirical foundation for kitchen
  inventory, cooking, and meal prep before expanding features. See
  `docs/FOUNDATION-AUDIT-2026-09-06.md` for evidence and proposed experiments.
  Its recommendations are not yet implementation commitments. Older product
  directions, tool counts, schema restrictions, and vendor choices are revisitable;
  preserve user data and authorization while evaluating replacements.
- Read `CONTRIBUTING.md` before creating issues or pull requests. It defines the
  issue format, board priorities, and PR-first workflow.
- Read `docs/PROJECT.md` at the start of substantial work. It explains the
  project's learning goals, architecture, and operational facts that affect
  implementation decisions.
- Read `design_handoff/DESIGN.md` and `design_handoff/STATUS.md` when working on
  the existing website visual system or historical designs. They are historical
  references, not requirements for new MCP or cooking workflows.
- This is a learning project. Teach before implementing: explain the why,
  prefer small vertical slices, and preserve the decision in the appropriate
  durable place (issue, PR, or project document).

## MCP and ChatGPT Apps routing

- The installed production MCP app uses Vercel `/mcp` (verified 2026-09-07). Next.js also powers the web control plane and OAuth consent. Hono (`src/mcp/worker.ts`) is a separate Cloudflare deployment; verify the installed endpoint before assuming requests reach it. See `docs/MCP-DEPLOYMENT.md`.
- For any task involving MCP, ChatGPT Apps, the MCP Apps widget, tool
  descriptors, account linking, or OAuth used by the MCP app, read
  `src/mcp/AGENTS.md` before implementation. This applies even when the edited
  files live elsewhere, such as `src/app/oauth`, `src/app/api`, middleware, or
  application configuration.
- Keep the detailed protocol guidance in `src/mcp/AGENTS.md` rather than
  duplicating it across OAuth and API directories. Update that canonical guide
  when the architecture or required validation changes.
