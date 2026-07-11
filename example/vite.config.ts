import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import path from "node:path"

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// Local dev serves from "/"; the GitHub Pages build sets BASE_PATH to
// "/react-stay-canvas/" (the repo sub-path) via the CI workflow.
const base = process.env.BASE_PATH ?? "/"

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      // Import the library straight from source so examples track the repo.
      "react-stay-canvas": path.resolve(rootDir, "../src/index.ts"),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(rootDir, "..")],
    },
  },
})
