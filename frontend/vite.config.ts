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
  // Vercel dashboard env vars override committed `.env.production` at build
  // time; pin the hosted backend URL so a stale VITE_API_URL can't leak through.
  ...(mode === 'production' && {
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify('https://copyzero.onrender.com'),
    },
  }),
}));
