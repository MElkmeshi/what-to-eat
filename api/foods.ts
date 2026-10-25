import { Redis } from '@upstash/redis'
import { SEED } from './_seed.js'

// The whole list lives in one Redis set; a marker key records that it was seeded,
// so emptying the list doesn't bring the defaults back.
const KEY = 'foods'
const SEEDED_KEY = 'foods:seeded'
const MAX_LEN = 60

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

async function list() {
  if (await redis.set(SEEDED_KEY, 1, { nx: true })) {
    await redis.sadd(KEY, SEED[0], ...SEED.slice(1))
  }
  const items = await redis.smembers(KEY)
  return items.sort((a, b) => a.localeCompare(b, 'ar'))
}

// Writes are open unless EDIT_PIN is set, in which case the client must send it.
function authorized(req: Request) {
  const pin = process.env.EDIT_PIN
  return !pin || req.headers.get('x-pin') === pin
}

async function readName(req: Request) {
  const body = (await req.json().catch(() => null)) as { name?: unknown } | null
  const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : ''
  return name && name.length <= MAX_LEN ? name : null
}

export async function GET() {
  return json({ items: await list() })
}

export async function POST(req: Request) {
  if (!authorized(req)) return json({ error: 'pin' }, 401)
  const name = await readName(req)
  if (!name) return json({ error: 'invalid' }, 400)
  await list()
  await redis.sadd(KEY, name)
  return json({ items: await list() })
}

export async function DELETE(req: Request) {
  if (!authorized(req)) return json({ error: 'pin' }, 401)
  const name = await readName(req)
  if (!name) return json({ error: 'invalid' }, 400)
  await redis.srem(KEY, name)
  return json({ items: await list() })
}
