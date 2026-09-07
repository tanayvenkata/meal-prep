/** Explicit synthetic loopback stacks only; never infer a target from production env. */
export function evaluationDatabases(env: Record<string, string | undefined> = process.env) {
  const app = env.KITCHEN_EVAL_DATABASE_URL ?? "postgresql://mise_app:mise_app_local@127.0.0.1:54322/postgres";
  const admin = env.KITCHEN_EVAL_ADMIN_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const a = new URL(app), b = new URL(admin);
  if ([a,b].some(u => u.protocol !== "postgresql:" || u.hostname !== "127.0.0.1" || !["54322", "55322"].includes(u.port) || u.pathname !== "/postgres" || u.search || u.hash)
    || a.port !== b.port || a.username !== "mise_app" || b.username !== "postgres") {
    throw new Error("Evaluation databases must be a matching approved local fixture pair.");
  }
  return { app, admin, authUrl: `http://127.0.0.1:${a.port === "55322" ? "55321" : "54321"}` };
}
