'use client'

import { useState, useEffect, useRef } from 'react'
import { Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Turnover = 'high' | 'low'

type Item = {
  id: number
  name: string
  quantity: string
  turnover: Turnover
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-sm font-semibold text-text-primary">{children}</h2>
}

export default function PantryPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [turnover, setTurnover] = useState<Turnover>('high')
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editQuantity, setEditQuantity] = useState('')
  const [editTurnover, setEditTurnover] = useState<Turnover>('high')
  const editNameRef = useRef<HTMLInputElement>(null)

  async function loadItems() {
    const token = await getToken()
    if (!token) return
    try {
      const res = await fetch('/api/pantry', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`pantry load failed (${res.status})`)
      setItems(await res.json())
      setError(null)
    } catch (err) {
      console.error('failed to load pantry:', err)
      setError('Could not load your pantry. Try refreshing.')
    }
  }

  useEffect(() => {
    let ignore = false

    async function startFetching() {
      await loadItems()
      if (!ignore) setLoading(false)
    }

    startFetching()
    return () => { ignore = true }
  }, [])

  async function mutate(method: 'POST' | 'PUT' | 'DELETE', body: object) {
    const token = await getToken()
    if (!token) return false
    setError(null)
    const res = await fetch('/api/pantry', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Something went wrong')
      return false
    }
    await loadItems()
    return true
  }

  async function addItem() {
    if (!name.trim()) return
    const added = await mutate('POST', { name: name.trim(), quantity: quantity.trim(), turnover })
    if (added) {
      setName('')
      setQuantity('')
      setTurnover('high')
    }
  }

  function startEdit(item: Item) {
    setEditingId(item.id)
    setEditName(item.name)
    setEditQuantity(item.quantity ?? '')
    setEditTurnover(item.turnover)
    setTimeout(() => editNameRef.current?.focus(), 0)
  }

  async function saveEdit(id: number) {
    if (!editName.trim()) return
    const saved = await mutate('PUT', {
      id,
      name: editName.trim(),
      quantity: editQuantity.trim(),
      turnover: editTurnover,
    })
    if (saved) setEditingId(null)
  }

  const highTurnover = items.filter((item) => item.turnover === 'high')
  const lowTurnover = items.filter((item) => item.turnover === 'low')

  function renderItems(sectionItems: Item[]) {
    if (!sectionItems.length) return <p className="py-3 text-sm text-text-secondary">Nothing here yet.</p>

    return (
      <ul className="divide-y divide-outline border-y border-outline">
        {sectionItems.map((item) => (
          <li key={item.id} className="py-3">
            {editingId === item.id ? (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_auto_auto]">
                <input ref={editNameRef} aria-label="Edit ingredient name" value={editName} onChange={(e) => setEditName(e.target.value)} className="min-w-0 border border-outline bg-surface-raised px-2 py-2 text-base" />
                <input aria-label="Edit quantity" value={editQuantity} onChange={(e) => setEditQuantity(e.target.value)} className="min-w-0 border border-outline bg-surface-raised px-2 py-2 text-base" placeholder="Quantity" />
                <select aria-label="Edit turnover" value={editTurnover} onChange={(e) => setEditTurnover(e.target.value as Turnover)} className="border border-outline bg-surface-raised px-2 py-2 text-sm">
                  <option value="high">High</option>
                  <option value="low">Low</option>
                </select>
                <button aria-label="Save item" onClick={() => saveEdit(item.id)} className="border border-outline px-3 py-2 text-sm"><Check size={16} /></button>
                <button aria-label="Cancel edit" onClick={() => setEditingId(null)} className="border border-outline px-3 py-2 text-sm"><X size={16} /></button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base text-text-primary">{item.name}</p>
                  {item.quantity && <p className="text-sm text-text-secondary">{item.quantity}</p>}
                </div>
                <div className="flex shrink-0 gap-3 text-sm">
                  <button onClick={() => startEdit(item)} className="text-text-secondary underline underline-offset-4">Edit</button>
                  <button onClick={() => mutate('DELETE', { id: item.id })} className="text-text-secondary underline underline-offset-4">Delete</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-4 py-5 sm:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Pantry</h1>
        <p className="mt-1 text-sm text-text-secondary">{loading ? 'Loading…' : `${items.length} items`}</p>
      </header>

      <section aria-labelledby="add-item-heading" className="mb-8">
        <SectionHeading><span id="add-item-heading">Add an item</span></SectionHeading>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_auto]">
          <input aria-label="Ingredient name" placeholder="Ingredient" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addItem()} className="min-w-0 border border-outline bg-surface-raised px-3 py-2 text-base" />
          <input aria-label="Quantity" placeholder="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addItem()} className="min-w-0 border border-outline bg-surface-raised px-3 py-2 text-base" />
          <select aria-label="Turnover" value={turnover} onChange={(e) => setTurnover(e.target.value as Turnover)} className="border border-outline bg-surface-raised px-3 py-2 text-base">
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
          <button onClick={addItem} className="border border-text-primary bg-text-primary px-4 py-2 text-sm font-medium text-surface-base">Add</button>
        </div>
      </section>

      {error && <p className="mb-4 text-sm text-text-danger">{error}</p>}

      {loading ? (
        <p className="text-sm text-text-secondary">Loading pantry…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-secondary">Nothing here yet. Add the ingredients you use.</p>
      ) : (
        <div className="space-y-8">
          <section aria-labelledby="high-turnover-heading">
            <SectionHeading><span id="high-turnover-heading">High turnover</span></SectionHeading>
            {renderItems(highTurnover)}
          </section>
          <section aria-labelledby="low-turnover-heading">
            <SectionHeading><span id="low-turnover-heading">Low turnover</span></SectionHeading>
            {renderItems(lowTurnover)}
          </section>
        </div>
      )}
    </main>
  )
}
