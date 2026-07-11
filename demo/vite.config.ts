import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import path from "node:path"

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// Local dev serves from "/"; the GitHub Pages build sets BASE_PATH to
// "/react-stay-canvas/" (the repo sub-path) via the CI workflow.
// Vercel/Netlify serve from root, so leaving BASE_PATH unset is correct there too.
const base = process.env.BASE_PATH ?? "/"

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      // Import the library straight from source so editing ../src is reflected
      // instantly in dev (HMR) and picked up on every build — no rebuild/publish.
      "react-stay-canvas": path.resolve(rootDir, "../src/index.ts"),
    },
  },
  server: {
    host: true, // listen on 0.0.0.0 so the Docker container is reachable
    port: 5173,
    fs: {
      // Allow the dev server to read the library source outside demo/.
      allow: [path.resolve(rootDir, "..")],
    },
    watch: {
      // Bind-mounted files don't always emit inotify events across the Docker
      // boundary; polling makes HMR reliable. Enable with WATCH_POLL=1.
      usePolling: process.env.WATCH_POLL === "1",
    },
  },
})
