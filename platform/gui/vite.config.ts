import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { resolve } from "node:path"

const workspaceRoot = resolve(__dirname, "..", "..")

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    open: true,
    fs: {
      allow: [workspaceRoot],
    },
  },
  resolve: {
    alias: {
      "@workspace": workspaceRoot,
    },
  },
})
