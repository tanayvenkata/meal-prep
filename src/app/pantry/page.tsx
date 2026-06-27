'use client'

import { useState, useEffect, useRef } from 'react'
import { Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Item = {
  id: number
  name: string
  quantity: string
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export default function PantryPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editQuantity, setEditQuantity] = useState('')
  const editNameRef = useRef<HTMLInputElement>(null)

  async function loadItems() {
    const token = await getToken()
    if (!token) return
    try {
      const res = await fetch('/api/pantry', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`pantry load failed (${res.status})`)
      const data = await res.json()
      setItems(data)
      setError(null)
    } catch (err) {
      console.error('failed to load pantry:', err)
      setError('Could not load your pantry. Try refreshing.')
    }
  }

  useEffect(() => {
    let ignore = false
    async function startFetching() {
      const token = await getToken()
      if (!token) return
      try {
        const res = await fetch('/api/pantry', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error(`pantry load failed (${res.status})`)
        const data = await res.json()
        if (!ignore) setItems(data)
      } catch (err) {
        console.error('failed to load pantry:', err)
        if (!ignore) setError('Could not load your pantry. Try refreshing.')
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    startFetching()
    return () => { ignore = true }
  }, [])

  async function mutate(method: 'POST' | 'PUT' | 'DELETE', body: object) {
    const token = await getToken()
    if (!token) return
    setError(null)
    const res = await fetch('/api/pantry', {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Something went wrong')
      return
    }
    await loadItems()
  }

  async function addItem() {
    if (name.trim() === '') return
    await mutate('POST', { name: name.trim(), quantity: quantity.trim() })
    setName('')
    setQuantity('')
  }

  async function deleteItem(id: number) {
    await mutate('DELETE', { id })
  }

  function startEdit(item: Item) {
    setEditingId(item.id)
    setEditName(item.name)
    setEditQuantity(item.quantity ?? '')
    setTimeout(() => editNameRef.current?.focus(), 0)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit(id: number) {
    if (editName.trim() === '') return
    await mutate('PUT', { id, name: editName.trim(), quantity: editQuantity.trim() })
    setEditingId(null)
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-ink">My Pantry</h1>
        <p className="mt-0.5 font-mono text-xs uppercase tracking-widest text-muted">
          {loading ? ' ' : `${items.length} ${items.length === 1 ? 'item' : 'items'}`}
        </p>
      </div>

      {/* add row */}
      <div className="mb-6 flex gap-2">
        <input
          className="flex-1 rounded-xl border border-sand bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted outline-none focus:border-ink transition-colors"
          placeholder="Ingredient (e.g. chicken thighs)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
        />
        <input
          className="w-36 rounded-xl border border-sand bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted outline-none focus:border-ink transition-colors"
          placeholder="Qty (e.g. 2 lbs)"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
        />
        <button
          className="rounded-xl bg-ember px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          onClick={addItem}
        >
          Add
        </button>
      </div>

      {error && (
        <p className="mb-4 text-sm text-ember">{error}</p>
      )}

      {/* item list */}
      <div
        className="rounded-2xl bg-surface overflow-hidden"
        style={{ boxShadow: '0 1px 4px rgba(34,29,24,.07)' }}
      >
        {loading ? (
          <div className="space-y-px">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div className="h-4 w-32 rounded bg-sand animate-pulse" />
                <div className="h-4 w-16 rounded bg-sand animate-pulse" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-sand text-muted text-xl">
              +
            </div>
            <p className="text-sm text-muted">Nothing here yet — add something above.</p>
          </div>
        ) : (
          <ul className="divide-y divide-sand">
            {items.map((item) => (
              <li key={item.id} className="px-4 py-3">
                {editingId === item.id ? (
                  /* inline edit row */
                  <div className="flex items-center gap-2">
                    <input
                      ref={editNameRef}
                      className="flex-1 rounded-lg border border-sand bg-paper px-2 py-1 text-sm text-ink outline-none focus:border-ember transition-colors"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(item.id)
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      placeholder="Name"
                    />
                    <input
                      className="w-24 rounded-lg border border-sand bg-paper px-2 py-1 text-sm text-ink outline-none focus:border-ember transition-colors"
                      value={editQuantity}
                      onChange={(e) => setEditQuantity(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(item.id)
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      placeholder="Qty"
                    />
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-ember text-white hover:opacity-90 transition-opacity"
                      onClick={() => saveEdit(item.id)}
                      title="Save"
                    >
                      <Check size={14} strokeWidth={2.2} />
                    </button>
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-sand text-muted hover:border-ink hover:text-ink transition-colors"
                      onClick={cancelEdit}
                      title="Cancel"
                    >
                      <X size={14} strokeWidth={2.2} />
                    </button>
                  </div>
                ) : (
                  /* normal row */
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-ink">{item.name}</span>
                      {item.quantity && (
                        <span className="ml-2 font-mono text-xs text-muted">{item.quantity}</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="rounded-lg border border-sand px-3 py-1 text-xs text-muted hover:border-ink hover:text-ink transition-colors"
                        onClick={() => startEdit(item)}
                      >
                        Edit
                      </button>
                      <button
                        className="rounded-lg px-3 py-1 text-xs text-ember hover:opacity-70 transition-opacity"
                        onClick={() => deleteItem(item.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
