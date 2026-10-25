import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { SEED } from './api/_seed.js'

// In-memory stand-in for api/foods.ts so `npm run dev` works without Redis.
// Use `vercel dev` to run against the real function.
function mockApi(): Plugin {
  const foods = new Set(SEED)
  return {
    name: 'mock-foods-api',
    configureServer(server) {
      server.middlewares.use('/api/foods', (req, res) => {
        let raw = ''
        req.on('data', (c) => (raw += c))
        req.on('end', () => {
          const name = raw ? String(JSON.parse(raw).name ?? '').trim() : ''
          if (req.method === 'POST' && name) foods.add(name)
          if (req.method === 'DELETE' && name) foods.delete(name)
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ items: [...foods].sort((a, b) => a.localeCompare(b, 'ar')) }))
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), mockApi()],
})
