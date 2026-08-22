import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"
import path from "node:path"

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      // Import the library exactly as a consumer does; resolves to source.
      "react-stay-canvas": path.resolve(rootDir, "../src/index.ts"),
      // Component lifecycle tests must use the same React instance as the
      // renderer installed in this test package.
      react: path.resolve(rootDir, "node_modules/react"),
      "react-dom": path.resolve(rootDir, "node_modules/react-dom"),
    },
  },
  test: {
    // Default node env; files that need DOM opt in with a
    // `// @vitest-environment jsdom` header comment.
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    globals: true,
  },
})
