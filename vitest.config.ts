import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "tests/**/*.test.ts"],
    // Domain store is a module singleton — avoid cross-file races.
    fileParallelism: false,
  },
});
