import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import path from "node:path"

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// Local dev serves from "/"; the GitHub Pages build sets BASE_PATH to
// "/react-stay-canvas/" (the repo sub-path) via the CI workflow.
// Vercel/Netlify serve from root, so leaving BASE_PATH unset is correct there too.
const base = process.env.BASE_PATH ?? "/"

// Public hostname when serving through a reverse proxy (Caddy) over HTTPS.
const publicHost = process.env.PUBLIC_HOST

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
    host: true, // listen on 0.0.0.0 *inside* the container (host maps to 127.0.0.1)
    port: 5173,
    // When exposed through a public HTTPS domain (Caddy in front), Vite must
    // whitelist that host and point HMR at the public wss endpoint. Set
    // PUBLIC_HOST=dev.machunchun.com to enable; unset = plain local dev.
    allowedHosts: publicHost ? [publicHost] : undefined,
    hmr: publicHost
      ? { host: publicHost, clientPort: 443, protocol: "wss" }
      : undefined,
    fs: {
      // demo/ imports ../src, so the dev server needs read access to the repo
      // root. This repo is public on GitHub anyway; keep Vite updated for the
      // occasional fs path-traversal CVE, and never widen this beyond the repo.
      allow: [path.resolve(rootDir, "..")],
    },
    watch: {
      // Bind-mounted files don't always emit inotify events across the Docker
      // boundary; polling makes HMR reliable. Enable with WATCH_POLL=1.
      usePolling: process.env.WATCH_POLL === "1",
    },
  },
})
