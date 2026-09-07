import { expect, it } from "vitest";
import { evaluationDatabases } from "../../../evals/kitchen/database-config";
it("allows only matched explicitly selected local fixture databases", () => {
  expect(evaluationDatabases({}).authUrl).toBe("http://127.0.0.1:54321");
  expect(() => evaluationDatabases({ KITCHEN_EVAL_DATABASE_URL: "postgresql://mise_app:x@remote.example:54322/postgres" })).toThrow();
  expect(() => evaluationDatabases({ KITCHEN_EVAL_DATABASE_URL: "postgresql://postgres:x@127.0.0.1:54322/postgres" })).toThrow();
  expect(() => evaluationDatabases({ KITCHEN_EVAL_DATABASE_URL: "postgresql://mise_app:x@127.0.0.1:55322/postgres" })).toThrow();
  expect(evaluationDatabases({ KITCHEN_EVAL_DATABASE_URL: "postgresql://mise_app:x@127.0.0.1:55322/postgres", KITCHEN_EVAL_ADMIN_DATABASE_URL: "postgresql://postgres:x@127.0.0.1:55322/postgres" }).authUrl).toBe("http://127.0.0.1:55321");
});
