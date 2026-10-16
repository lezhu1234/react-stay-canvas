import resolve from "@rollup/plugin-node-resolve"
import commonjs from "@rollup/plugin-commonjs"
import typescript from "@rollup/plugin-typescript"
import dts from "rollup-plugin-dts"
import peerDepsExternal from "rollup-plugin-peer-deps-external"

import terser from "@rollup/plugin-terser"

export default [
  {
    input: { index: "src/index.ts", worker: "src/worker.ts" },
    output: [
      {
        dir: "dist",
        entryFileNames: "cjs/[name].js",
        chunkFileNames: "cjs/shared/[name]-[hash].js",
        format: "cjs",
        sourcemap: true,
      },
      {
        dir: "dist",
        entryFileNames: "esm/[name].js",
        chunkFileNames: "esm/shared/[name]-[hash].js",
        format: "esm",
        sourcemap: true,
      },
    ],
    plugins: [
      terser(),
      peerDepsExternal(),
      resolve(),
      commonjs(),
      typescript({ tsconfig: "./tsconfig.json", declarationDir: "dist/types" }),
    ],
  },
  {
    input: { index: "dist/types/index.d.ts", worker: "dist/types/worker.d.ts" },
    output: [{ dir: "dist", entryFileNames: "[name].d.ts", chunkFileNames: "shared-types/[name]-[hash].d.ts", format: "esm" }],
    plugins: [dts()],
  },
]
