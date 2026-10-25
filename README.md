# شن ناكلو؟

Mobile-first "what should we eat" picker. React + TS (Vite) frontend, one Vercel function (`api/foods.ts`) storing the list as a single Redis set in Upstash (Vercel Marketplace, free tier).

- `npm run dev` — runs with an in-memory mock API (see `vite.config.ts`)
- `vercel dev` — runs against the real function/Redis (after `vercel env pull`)

Env: `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_*`), set by the Upstash integration. Optional `EDIT_PIN` to require a PIN for adding/removing.
