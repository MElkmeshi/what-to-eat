import { Redis } from '@upstash/redis'
import { SEED } from './_seed.js'

// Dishes live in one Redis hash: name -> ingredient list. The seeded marker means
// emptying the list doesn't bring the defaults back.
const KEY = 'dishes'
const SEEDED_KEY = 'dishes:seeded'
const LEGACY_KEY = 'foods' // v1 stored a plain set of names
const MAX_NAME = 60
const MAX_INGREDIENTS = 15

type Dish = { name: string; ingredients: string[] }

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

const clean = (s: unknown, max: number) =>
  typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').slice(0, max) : ''

async function seedOnce() {
  if (!(await redis.set(SEEDED_KEY, 1, { nx: true }))) return
  const legacy = await redis.smembers(LEGACY_KEY)
  const names = legacy.length ? legacy : Object.keys(SEED)
  const entries = Object.fromEntries(names.map((n) => [n, SEED[n] ?? []]))
  if (names.length) await redis.hset(KEY, entries)
}

async function list(): Promise<Dish[]> {
  await seedOnce()
  const all = (await redis.hgetall<Record<string, string[]>>(KEY)) ?? {}
  return Object.entries(all)
    .map(([name, ingredients]) => ({ name, ingredients: Array.isArray(ingredients) ? ingredients : [] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
}

// Writes are open unless EDIT_PIN is set, in which case the client must send it.
function authorized(req: Request) {
  const pin = process.env.EDIT_PIN
  return !pin || req.headers.get('x-pin') === pin
}

async function readDish(req: Request): Promise<Dish | null> {
  const body = (await req.json().catch(() => null)) as { name?: unknown; ingredients?: unknown } | null
  const name = clean(body?.name, MAX_NAME)
  if (!name) return null
  const raw = Array.isArray(body?.ingredients) ? body.ingredients : []
  const ingredients = [...new Set(raw.map((i) => clean(i, 30)).filter(Boolean))].slice(0, MAX_INGREDIENTS)
  return { name, ingredients }
}

export async function GET() {
  return json({ items: await list() })
}

// POST adds a dish, PUT replaces an existing dish's ingredients.
async function upsert(req: Request, mustExist: boolean) {
  if (!authorized(req)) return json({ error: 'pin' }, 401)
  const dish = await readDish(req)
  if (!dish) return json({ error: 'invalid' }, 400)
  await seedOnce()
  if (mustExist && !(await redis.hexists(KEY, dish.name))) return json({ error: 'not found' }, 404)
  await redis.hset(KEY, { [dish.name]: dish.ingredients })
  return json({ items: await list() })
}

export const POST = (req: Request) => upsert(req, false)
export const PUT = (req: Request) => upsert(req, true)

export async function DELETE(req: Request) {
  if (!authorized(req)) return json({ error: 'pin' }, 401)
  const dish = await readDish(req)
  if (!dish) return json({ error: 'invalid' }, 400)
  await redis.hdel(KEY, dish.name)
  return json({ items: await list() })
}
