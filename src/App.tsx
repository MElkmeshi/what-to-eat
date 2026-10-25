import { useEffect, useRef, useState, type FormEvent } from 'react'
import { addFood, cachedFoods, fetchFoods, PinError, removeFood, setPin } from './api'
import { emojiFor } from './emoji'

const RECENT_LIMIT = 4

function pickRandom(items: string[], recent: string[]) {
  const fresh = items.filter((i) => !recent.includes(i))
  const pool = fresh.length ? fresh : items
  return pool[Math.floor(Math.random() * pool.length)]
}

export default function App() {
  const [items, setItems] = useState<string[]>(() => cachedFoods() ?? [])
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [pick, setPick] = useState<string | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const recent = useRef<string[]>([])
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    fetchFoods()
      .then((list) => { setItems(list); setOffline(false) })
      .catch(() => setOffline(true))
      .finally(() => setLoading(false))
    return () => window.clearTimeout(timer.current)
  }, [])

  function suggest() {
    if (!items.length || spinning) return
    const final = pickRandom(items, recent.current)
    recent.current = [final, ...recent.current].slice(0, Math.min(RECENT_LIMIT, items.length - 1))
    setSpinning(true)
    navigator.vibrate?.(10)

    // Cycle through names with growing delays so it "lands" on the pick.
    let step = 0
    const steps = 14
    const tick = () => {
      step++
      if (step >= steps) {
        setPick(final)
        setSpinning(false)
        navigator.vibrate?.([15, 40, 25])
        return
      }
      setPick(items[Math.floor(Math.random() * items.length)])
      timer.current = window.setTimeout(tick, 40 + step * step * 1.6)
    }
    tick()
  }

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>شن ناكلو؟</h1>
          <p className="muted">
            {loading && !items.length ? 'جاري التحميل…' : `${items.length} أكلة في القائمة`}
            {offline && ' · بدون اتصال'}
          </p>
        </div>
        <button className="icon-btn" onClick={() => setSheetOpen(true)} aria-label="عدّل القائمة">
          <ListIcon />
        </button>
      </header>

      <main className="stage">
        <div className={`card ${spinning ? 'spinning' : ''} ${pick && !spinning ? 'landed' : ''}`}>
          <div className="plate" aria-hidden>{pick ? emojiFor(pick) : '🍽️'}</div>
          <p className="label">{pick ? (spinning ? '…' : 'اليوم ناكلو') : 'محتار؟'}</p>
          <p className="pick" aria-live="polite">{pick ?? 'اضغط تحت وخلّيها علينا'}</p>
        </div>
      </main>

      <footer className="actions">
        <button className="primary" onClick={suggest} disabled={!items.length || spinning}>
          {pick ? 'لا، غيره 🎲' : 'اقترح علي 🎲'}
        </button>
      </footer>

      {sheetOpen && (
        <ListSheet items={items} offline={offline} onChange={setItems} onClose={() => setSheetOpen(false)} />
      )}
    </div>
  )
}

function ListSheet({
  items,
  offline,
  onChange,
  onClose,
}: {
  items: string[]
  offline: boolean
  onChange: (items: string[]) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [needPin, setNeedPin] = useState(false)
  const [pinDraft, setPinDraft] = useState('')
  const [filter, setFilter] = useState('')
  const retry = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  async function run(key: string, action: () => Promise<string[]>) {
    setBusy(key)
    setError('')
    try {
      onChange(await action())
      return true
    } catch (e) {
      if (e instanceof PinError) {
        retry.current = async () => { await run(key, action) }
        setNeedPin(true)
      } else {
        setError('صار خطأ، جرّب مرة ثانية')
      }
      return false
    } finally {
      setBusy(null)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const name = draft.trim()
    if (!name) return
    if (items.includes(name)) {
      setError('موجودة في القائمة')
      return
    }
    if (await run('__add', () => addFood(name))) setDraft('')
  }

  async function submitPin(e: FormEvent) {
    e.preventDefault()
    setPin(pinDraft.trim())
    setNeedPin(false)
    setPinDraft('')
    await retry.current?.()
  }

  const shown = filter ? items.filter((i) => i.includes(filter.trim())) : items

  return (
    <div className="overlay" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal aria-label="القائمة" onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <h2>القائمة <span className="count">{items.length}</span></h2>
          <button className="text-btn" onClick={onClose}>تم</button>
        </div>

        {offline && <p className="note">مافيش اتصال بالسيرفر، القائمة للعرض فقط.</p>}

        {needPin ? (
          <form className="add" onSubmit={submitPin}>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              placeholder="الرمز السري للتعديل"
              value={pinDraft}
              onChange={(e) => setPinDraft(e.target.value)}
            />
            <button className="primary small" disabled={!pinDraft.trim()}>تأكيد</button>
          </form>
        ) : (
          <form className="add" onSubmit={submit}>
            <input
              placeholder="أضف أكلة… مثلاً: بازين"
              value={draft}
              maxLength={60}
              enterKeyHint="done"
              onChange={(e) => { setDraft(e.target.value); setError('') }}
              disabled={offline}
            />
            <button className="primary small" disabled={!draft.trim() || busy === '__add' || offline}>
              {busy === '__add' ? '…' : 'أضف'}
            </button>
          </form>
        )}
        {error && <p className="error">{error}</p>}

        {items.length > 8 && (
          <input className="search" type="search" placeholder="ابحث" value={filter} onChange={(e) => setFilter(e.target.value)} />
        )}

        <ul className="items">
          {shown.map((item) => (
            <li key={item} className={busy === item ? 'removing' : ''}>
              <span><span className="item-emoji" aria-hidden>{emojiFor(item)}</span>{item}</span>
              <button
                className="remove"
                aria-label={`احذف ${item}`}
                disabled={!!busy || offline}
                onClick={() => run(item, () => removeFood(item))}
              >
                ×
              </button>
            </li>
          ))}
          {!shown.length && <li className="empty">{filter ? 'مافيش نتائج' : 'القائمة فاضية، أضف أول أكلة'}</li>}
        </ul>
      </section>
    </div>
  )
}

function ListIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </svg>
  )
}
