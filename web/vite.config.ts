import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The UI calls /api/..., and Vite forwards that to the FastAPI server, so the API needs no CORS.
// On Vercel, the route in vercel.json does the same, from the same VENDING_API_URL.
const apiUrl = process.env.VENDING_API_URL ?? 'http://127.0.0.1:8000'
const proxy = {
  '/api': { target: apiUrl, rewrite: (path: string) => path.replace(/^\/api/, '') },
}

export default defineConfig({
  plugins: [react()],
  define: { __API_URL__: JSON.stringify(apiUrl) },
  server: { proxy },
  preview: { proxy },
})
