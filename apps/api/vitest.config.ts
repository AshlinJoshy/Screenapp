import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "test-secret-at-least-32-characters-long!!",
      JWT_EXPIRES_IN: "1h",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/scripts/**", "src/index.ts"],
    },
  },
});
