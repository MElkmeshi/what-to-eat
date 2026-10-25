import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { SEED } from './api/_seed.js'

// In-memory stand-in for api/foods.ts so `npm run dev` works without Redis.
// Use `vercel dev` to run against the real function.
function mockApi(): Plugin {
  const dishes = new Map(Object.entries(SEED))
  return {
    name: 'mock-foods-api',
    configureServer(server) {
      server.middlewares.use('/api/foods', (req, res) => {
        let raw = ''
        req.on('data', (c) => (raw += c))
        req.on('end', () => {
          const body = raw ? JSON.parse(raw) : {}
          const name = String(body.name ?? '').trim()
          if ((req.method === 'POST' || req.method === 'PUT') && name) dishes.set(name, body.ingredients ?? [])
          if (req.method === 'DELETE' && name) dishes.delete(name)
          const items = [...dishes]
            .map(([n, ingredients]) => ({ name: n, ingredients }))
            .sort((x, y) => x.name.localeCompare(y.name, 'ar'))
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ items }))
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), mockApi()],
})
