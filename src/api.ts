const PIN_KEY = 'wte:pin'
const LOCAL_KEY = 'wte:local-items'
const MISSING_KEY = 'wte:missing'

export type Dish = { name: string; ingredients: string[] }

export class PinError extends Error {}

const storage = {
  get(key: string) {
    try { return localStorage.getItem(key) } catch { return null }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value) } catch { /* private mode */ }
  },
}

export const getPin = () => storage.get(PIN_KEY) ?? ''
export const setPin = (pin: string) => storage.set(PIN_KEY, pin)

async function call(method: string, dish?: Partial<Dish>): Promise<Dish[]> {
  const res = await fetch('/api/foods', {
    method,
    headers: { 'content-type': 'application/json', 'x-pin': getPin() },
    body: dish === undefined ? undefined : JSON.stringify(dish),
  })
  if (res.status === 401) throw new PinError()
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { items: Dish[] }
  storage.set(LOCAL_KEY, JSON.stringify(data.items))
  return data.items
}

export const fetchFoods = () => call('GET')
export const addFood = (name: string, ingredients: string[] = []) => call('POST', { name, ingredients })
export const updateFood = (name: string, ingredients: string[]) => call('PUT', { name, ingredients })
export const removeFood = (name: string) => call('DELETE', { name })

// Last list we saw from the server, so the page works offline / before the API answers.
export function cachedFoods(): Dish[] | null {
  const raw = storage.get(LOCAL_KEY)
  try {
    const items = raw ? (JSON.parse(raw) as (Dish | string)[]) : null
    // v1 cached plain names
    return items?.map((i) => (typeof i === 'string' ? { name: i, ingredients: [] } : i)) ?? null
  } catch {
    return null
  }
}

// Ingredients the viewer doesn't have right now; per device, not shared.
export function loadMissing(): string[] {
  try { return JSON.parse(storage.get(MISSING_KEY) ?? '[]') as string[] } catch { return [] }
}
export const saveMissing = (missing: string[]) => storage.set(MISSING_KEY, JSON.stringify(missing))
