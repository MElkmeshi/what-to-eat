const PIN_KEY = 'wte:pin'
const LOCAL_KEY = 'wte:local-items'

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

async function call(method: string, name?: string): Promise<string[]> {
  const res = await fetch('/api/foods', {
    method,
    headers: { 'content-type': 'application/json', 'x-pin': getPin() },
    body: name === undefined ? undefined : JSON.stringify({ name }),
  })
  if (res.status === 401) throw new PinError()
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { items: string[] }
  storage.set(LOCAL_KEY, JSON.stringify(data.items))
  return data.items
}

export const fetchFoods = () => call('GET')
export const addFood = (name: string) => call('POST', name)
export const removeFood = (name: string) => call('DELETE', name)

// Last list we saw from the server, so the page works offline / before the API answers.
export function cachedFoods(): string[] | null {
  const raw = storage.get(LOCAL_KEY)
  try { return raw ? (JSON.parse(raw) as string[]) : null } catch { return null }
}
