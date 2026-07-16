import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [inspectAttr(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Same-origin `/api/*` requests are proxied to Render via root `vercel.json`,
  // avoiding browser CORS when the backend allowlist hasn't been updated yet.
  ...(mode === 'production' && {
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(''),
    },
  }),
}));
