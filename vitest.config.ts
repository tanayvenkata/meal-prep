import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, ".claude/**"],
    env: {
      // Application pool: fail-closed mise_app role (issue #64).
      DATABASE_URL: "postgresql://mise_app:mise_app_local@127.0.0.1:54322/postgres",
      // Fixture / owner connection only — never used by src/lib/db.ts.
      ADMIN_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
