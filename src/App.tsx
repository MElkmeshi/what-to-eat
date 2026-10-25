import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  addFood, cachedFoods, fetchFoods, loadMissing, PinError, removeFood, saveMissing, setPin, updateFood, type Dish,
} from './api'
import { emojiFor } from './emoji'

const RECENT_LIMIT = 4

function pickRandom(items: Dish[], recent: string[]) {
  const fresh = items.filter((i) => !recent.includes(i.name))
  const pool = fresh.length ? fresh : items
  return pool[Math.floor(Math.random() * pool.length)]
}

// All ingredients across dishes, most used first.
function allIngredients(dishes: Dish[]) {
  const counts = new Map<string, number>()
  for (const d of dishes) for (const i of d.ingredients) counts.set(i, (counts.get(i) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar')).map(([i]) => i)
}

export default function App() {
  const [items, setItems] = useState<Dish[]>(() => cachedFoods() ?? [])
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [missing, setMissing] = useState<string[]>(loadMissing)
  const [pick, setPick] = useState<Dish | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [sheet, setSheet] = useState<'list' | 'pantry' | null>(null)
  const recent = useRef<string[]>([])
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    fetchFoods()
      .then((list) => { setItems(list); setOffline(false) })
      .catch(() => setOffline(true))
      .finally(() => setLoading(false))
    return () => window.clearTimeout(timer.current)
  }, [])

  const ingredients = useMemo(() => allIngredients(items), [items])
  // Forget missing ingredients that no dish uses any more.
  const activeMissing = missing.filter((m) => ingredients.includes(m))
  const available = items.filter((d) => !d.ingredients.some((i) => activeMissing.includes(i)))
  const pickBlocked = pick && !available.some((d) => d.name === pick.name)

  function updateMissing(next: string[]) {
    setMissing(next)
    saveMissing(next)
  }

  function suggest() {
    if (!available.length || spinning) return
    const final = pickRandom(available, recent.current)
    recent.current = [final.name, ...recent.current].slice(0, Math.min(RECENT_LIMIT, available.length - 1))
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
      setPick(available[Math.floor(Math.random() * available.length)])
      timer.current = window.setTimeout(tick, 40 + step * step * 1.6)
    }
    tick()
  }

  const shown = pickBlocked && !spinning ? null : pick
  const noneLeft = !loading && items.length > 0 && !available.length

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
        <button className="icon-btn" onClick={() => setSheet('list')} aria-label="عدّل القائمة">
          <ListIcon />
        </button>
      </header>

      <main className="stage">
        <div className={`card ${spinning ? 'spinning' : ''} ${shown && !spinning ? 'landed' : ''}`}>
          <div className="plate" aria-hidden>{shown ? emojiFor(shown.name) : noneLeft ? '🤷' : '🍽️'}</div>
          <p className="label">{shown ? (spinning ? '…' : 'اليوم ناكلو') : noneLeft ? 'مافيش أكلة تنفع' : 'محتار؟'}</p>
          <p className="pick" aria-live="polite">
            {shown?.name ?? (noneLeft ? 'كل الأكلات ناقصها حاجة، شيل شوية من الناقص' : 'اضغط تحت وخلّيها علينا')}
          </p>
          {shown && !spinning && shown.ingredients.length > 0 && (
            <p className="ingredients-line">{shown.ingredients.join(' · ')}</p>
          )}
        </div>
      </main>

      <footer className="actions">
        <button className={`pantry-pill ${activeMissing.length ? 'active' : ''}`} onClick={() => setSheet('pantry')}>
          {activeMissing.length ? (
            <>
              <span className="pill-text">🚫 بدون: {activeMissing.slice(0, 3).join('، ')}{activeMissing.length > 3 && ` +${activeMissing.length - 3}`}</span>
              <span className="pill-count">{available.length} أكلة</span>
            </>
          ) : (
            <span className="pill-text">🧺 ناقصك حاجة في الحوش؟</span>
          )}
        </button>
        <button className="primary" onClick={suggest} disabled={!available.length || spinning}>
          {shown ? 'لا، غيره 🎲' : 'اقترح علي 🎲'}
        </button>
      </footer>

      {sheet === 'pantry' && (
        <PantrySheet
          ingredients={ingredients}
          missing={activeMissing}
          availableCount={available.length}
          onChange={updateMissing}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'list' && (
        <ListSheet
          items={items}
          knownIngredients={ingredients}
          offline={offline}
          onChange={setItems}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}

function Sheet({ title, badge, onClose, children }: { title: string; badge?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="overlay" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <h2>{title} {badge}</h2>
          <button className="text-btn" onClick={onClose}>تم</button>
        </div>
        {children}
      </section>
    </div>
  )
}

function PantrySheet({
  ingredients,
  missing,
  availableCount,
  onChange,
  onClose,
}: {
  ingredients: string[]
  missing: string[]
  availableCount: number
  onChange: (missing: string[]) => void
  onClose: () => void
}) {
  const toggle = (i: string) => onChange(missing.includes(i) ? missing.filter((m) => m !== i) : [...missing, i])

  return (
    <Sheet title="شن ناقص في الحوش؟" badge={<span className="count">{availableCount} أكلة</span>} onClose={onClose}>
      <p className="muted">اختار اللي مش موجود عندك، ونقترحولك أكلات بدونه.</p>
      <div className="chips scroll">
        {ingredients.map((i) => (
          <button key={i} className={`chip ${missing.includes(i) ? 'off' : ''}`} aria-pressed={missing.includes(i)} onClick={() => toggle(i)}>
            {i}
          </button>
        ))}
        {!ingredients.length && <p className="muted">ما فيش مكونات مسجلة للأكلات بعد. زيدها من القائمة.</p>}
      </div>
      {missing.length > 0 && (
        <button className="text-btn reset" onClick={() => onChange([])}>كل شي موجود، امسح الاختيار</button>
      )}
    </Sheet>
  )
}

function ListSheet({
  items,
  knownIngredients,
  offline,
  onChange,
  onClose,
}: {
  items: Dish[]
  knownIngredients: string[]
  offline: boolean
  onChange: (items: Dish[]) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [needPin, setNeedPin] = useState(false)
  const [pinDraft, setPinDraft] = useState('')
  const [filter, setFilter] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const retry = useRef<(() => Promise<void>) | null>(null)

  async function run(key: string, action: () => Promise<Dish[]>) {
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
    if (items.some((d) => d.name === name)) {
      setError('موجودة في القائمة')
      return
    }
    if (await run('__add', () => addFood(name))) {
      setDraft('')
      setFilter('')
      setOpen(name) // straight into adding its ingredients
    }
  }

  async function submitPin(e: FormEvent) {
    e.preventDefault()
    setPin(pinDraft.trim())
    setNeedPin(false)
    setPinDraft('')
    await retry.current?.()
  }

  const shown = filter ? items.filter((d) => d.name.includes(filter.trim()) || d.ingredients.some((i) => i.includes(filter.trim()))) : items

  return (
    <Sheet title="القائمة" badge={<span className="count">{items.length}</span>} onClose={onClose}>
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
        <input className="search" type="search" placeholder="ابحث بالأكلة أو المكون" value={filter} onChange={(e) => setFilter(e.target.value)} />
      )}

      <ul className="items">
        {shown.map((dish) => (
          <li key={dish.name} className={busy === dish.name ? 'removing' : ''}>
            <div className="row">
              <button className="row-main" aria-expanded={open === dish.name} onClick={() => setOpen(open === dish.name ? null : dish.name)}>
                <span className="item-emoji" aria-hidden>{emojiFor(dish.name)}</span>
                <span className="row-text">
                  <span className="row-name">{dish.name}</span>
                  <span className="row-sub">{dish.ingredients.length ? dish.ingredients.join('، ') : 'بدون مكونات — اضغط وزيد'}</span>
                </span>
              </button>
              <button
                className="remove"
                aria-label={`احذف ${dish.name}`}
                disabled={!!busy || offline}
                onClick={() => run(dish.name, () => removeFood(dish.name))}
              >
                ×
              </button>
            </div>
            {open === dish.name && (
              <IngredientEditor
                dish={dish}
                known={knownIngredients}
                disabled={offline || !!busy}
                onSave={(ingredients) => run(dish.name, () => updateFood(dish.name, ingredients))}
              />
            )}
          </li>
        ))}
        {!shown.length && <li className="empty">{filter ? 'مافيش نتائج' : 'القائمة فاضية، أضف أول أكلة'}</li>}
      </ul>
    </Sheet>
  )
}

function IngredientEditor({
  dish,
  known,
  disabled,
  onSave,
}: {
  dish: Dish
  known: string[]
  disabled: boolean
  onSave: (ingredients: string[]) => Promise<boolean>
}) {
  const [draft, setDraft] = useState('')

  async function add(e: FormEvent) {
    e.preventDefault()
    const name = draft.trim()
    if (!name || dish.ingredients.includes(name)) return setDraft('')
    if (await onSave([...dish.ingredients, name])) setDraft('')
  }

  const listId = `ing-${dish.name}`
  return (
    <div className="editor">
      <div className="chips">
        {dish.ingredients.map((i) => (
          <span key={i} className="chip static">
            {i}
            <button aria-label={`شيل ${i}`} disabled={disabled} onClick={() => onSave(dish.ingredients.filter((x) => x !== i))}>×</button>
          </span>
        ))}
      </div>
      <form className="add" onSubmit={add}>
        <input
          list={listId}
          placeholder="زيد مكون… مثلاً: دجاج"
          value={draft}
          maxLength={30}
          enterKeyHint="done"
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled}
        />
        <datalist id={listId}>
          {known.filter((k) => !dish.ingredients.includes(k)).map((k) => <option key={k} value={k} />)}
        </datalist>
        <button className="primary small" disabled={!draft.trim() || disabled}>زيد</button>
      </form>
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
