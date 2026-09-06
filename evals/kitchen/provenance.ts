import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export function evaluationProvenance(model: string) {
  const git = (args: string[]) => execFileSync("git", args, { encoding: "utf8" });
  const paths = [...new Set(git(["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "src", "evals", "scripts/eval-kitchen.mjs", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".npmrc"]).split("\0").filter(Boolean))].sort();
  const hash = createHash("sha256");
  for (const path of paths) hash.update(path).update("\0").update(existsSync(path) ? readFileSync(path) : "<deleted>").update("\0");
  return { model, node: process.version, head: git(["rev-parse", "HEAD"]).trim(), sourceHash: hash.digest("hex") };
}
