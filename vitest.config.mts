import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Local secrets live in .env.local (not committed); CI provides DATABASE_URL_TEST directly.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No local env file.
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Tests import server modules directly, outside a React Server Components build.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
    env: {
      // Service tests talk to the dedicated test database, never the dev one.
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
    },
  },
});
