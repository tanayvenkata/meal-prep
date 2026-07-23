'use client'

import { useState, useEffect, useRef } from 'react'
import { Check, X } from 'lucide-react'
import {
  pantryApi,
  type PantryItem,
  type PantryQuantityInput,
  type PantryQuantityUnit,
  type Turnover,
} from '@/lib/pantry-api'
import {
  filterAndSortInventory,
  type InventoryListSort,
} from '@/lib/inventory-list'
import { PANTRY_QUANTITY_UNITS } from '@/lib/pantry-quantity'

type QuantityDraft = {
  mode: 'structured' | 'text'
  amount: string
  unit: PantryQuantityUnit
  text: string
}

function emptyQuantityDraft(): QuantityDraft {
  return { mode: 'structured', amount: '', unit: 'count', text: '' }
}

function quantityDraftFromItem(item: PantryItem): QuantityDraft {
  switch (item.quantityDetails.mode) {
    case 'structured':
      return {
        mode: 'structured',
        amount: item.quantityDetails.amount,
        unit: item.quantityDetails.unit,
        text: '',
      }
    case 'text':
      return {
        mode: 'text',
        amount: '',
        unit: 'count',
        text: item.quantityDetails.text,
      }
    case 'unsupported':
      return {
        mode: 'text',
        amount: '',
        unit: 'count',
        text: item.quantityDetails.display,
      }
    case 'unknown':
      return emptyQuantityDraft()
  }
}

function quantityInputFromDraft(draft: QuantityDraft): PantryQuantityInput {
  if (draft.mode === 'text') {
    const text = draft.text.trim()
    return text === '' ? { mode: 'unknown' } : { mode: 'text', text }
  }

  const amount = draft.amount.trim()
  return amount === ''
    ? { mode: 'unknown' }
    : { mode: 'structured', amount, unit: draft.unit }
}

function QuantityEditor({
  label,
  value,
  onChange,
  onEnter,
}: {
  label: string
  value: QuantityDraft
  onChange: (next: QuantityDraft) => void
  onEnter?: () => void
}) {
  const handleEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') onEnter?.()
  }

  return (
    <div className="space-y-1">
      {value.mode === 'structured' ? (
        <div className="grid grid-cols-[minmax(0,1fr)_6.5rem]">
          <input
            aria-label={`${label} amount`}
            inputMode="decimal"
            placeholder="Amount"
            value={value.amount}
            onChange={(event) => onChange({ ...value, amount: event.target.value })}
            onKeyDown={handleEnter}
            className="min-w-0 border border-r-0 border-outline bg-surface-raised px-3 py-2 text-base"
          />
          <select
            aria-label={`${label} unit`}
            value={value.unit}
            onChange={(event) => onChange({
              ...value,
              unit: event.target.value as PantryQuantityUnit,
            })}
            className="min-w-0 border border-outline bg-surface-raised px-2 py-2 text-sm"
          >
            {PANTRY_QUANTITY_UNITS.map((unit) => (
              <option key={unit} value={unit}>{unit}</option>
            ))}
          </select>
        </div>
      ) : (
        <input
          aria-label={`${label} custom text`}
          placeholder="e.g. half a bag"
          value={value.text}
          onChange={(event) => onChange({ ...value, text: event.target.value })}
          onKeyDown={handleEnter}
          className="w-full min-w-0 border border-outline bg-surface-raised px-3 py-2 text-base"
        />
      )}
      <button
        type="button"
        onClick={() => onChange({
          ...value,
          mode: value.mode === 'structured' ? 'text' : 'structured',
        })}
        className="text-xs text-text-secondary underline underline-offset-4"
      >
        {value.mode === 'structured' ? 'Use custom text' : 'Use amount and unit'}
      </button>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-sm font-semibold text-text-primary">{children}</h2>
}

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState<QuantityDraft>(emptyQuantityDraft)
  const [turnover, setTurnover] = useState<Turnover>('high')
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<InventoryListSort>('recent')
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editQuantity, setEditQuantity] = useState<QuantityDraft>(emptyQuantityDraft)
  const [editQuantityDirty, setEditQuantityDirty] = useState(false)
  const [editTurnover, setEditTurnover] = useState<Turnover>('high')
  const editNameRef = useRef<HTMLInputElement>(null)

  async function loadItems() {
    try {
      setItems(await pantryApi.list())
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

  async function mutate(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
      await loadItems()
      return true
    } catch (err) {
      console.error('pantry mutation failed:', err)
      setError(err instanceof Error ? err.message : 'Something went wrong')
      return false
    }
  }

  async function addItem() {
    if (!name.trim()) return
    const added = await mutate(() => pantryApi.add({
      name: name.trim(),
      quantity: quantityInputFromDraft(quantity),
      turnover,
    }))
    if (added) {
      setName('')
      setQuantity(emptyQuantityDraft())
      setTurnover('high')
    }
  }

  function startEdit(item: PantryItem) {
    setEditingId(item.id)
    setEditName(item.name)
    setEditQuantity(quantityDraftFromItem(item))
    setEditQuantityDirty(false)
    setEditTurnover(item.turnover)
    setTimeout(() => editNameRef.current?.focus(), 0)
  }

  async function saveEdit(id: number) {
    if (!editName.trim()) return
    const saved = await mutate(() => pantryApi.update({
      id,
      name: editName.trim(),
      ...(editQuantityDirty
        ? { quantity: quantityInputFromDraft(editQuantity) }
        : {}),
      turnover: editTurnover,
    }))
    if (saved) setEditingId(null)
  }

  function startSelecting() {
    setEditingId(null)
    setSelectedIds(new Set())
    setSelecting(true)
  }

  function stopSelecting() {
    setSelectedIds(new Set())
    setSelecting(false)
  }

  function toggleSelected(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function deleteSelected() {
    if (selectedIds.size < 2) return
    const confirmed = window.confirm(
      `Delete ${selectedIds.size} selected pantry items? This cannot be undone.`,
    )
    if (!confirmed) return

    const deleted = await mutate(() => pantryApi.removeMany([...selectedIds]))
    if (deleted) stopSelecting()
  }

  const visibleItems = filterAndSortInventory(items, { query, sort })
  const highTurnover = visibleItems.filter((item) => item.turnover === 'high')
  const lowTurnover = visibleItems.filter((item) => item.turnover === 'low')

  function renderItems(sectionItems: PantryItem[]) {
    if (!sectionItems.length) return <p className="py-3 text-sm text-text-secondary">Nothing here yet.</p>

    return (
      <ul className="divide-y divide-outline border-y border-outline">
        {sectionItems.map((item) => (
          <li key={item.id} className="py-3">
            {editingId === item.id ? (
              <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_13rem_6rem_auto_auto]">
                <input ref={editNameRef} aria-label="Edit ingredient name" value={editName} onChange={(e) => setEditName(e.target.value)} className="min-w-0 border border-outline bg-surface-raised px-2 py-2 text-base" />
                <QuantityEditor
                  label="Edit quantity"
                  value={editQuantity}
                  onChange={(next) => {
                    setEditQuantity(next)
                    setEditQuantityDirty(true)
                  }}
                  onEnter={() => saveEdit(item.id)}
                />
                <select aria-label="Edit turnover" value={editTurnover} onChange={(e) => setEditTurnover(e.target.value as Turnover)} className="border border-outline bg-surface-raised px-2 py-2 text-sm">
                  <option value="high">High</option>
                  <option value="low">Low</option>
                </select>
                <button aria-label="Save item" onClick={() => saveEdit(item.id)} className="border border-outline px-3 py-2 text-sm"><Check size={16} /></button>
                <button aria-label="Cancel edit" onClick={() => setEditingId(null)} className="border border-outline px-3 py-2 text-sm"><X size={16} /></button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {selecting && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.name}`}
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelected(item.id)}
                      className="size-4 shrink-0 accent-text-primary"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-base text-text-primary">{item.name}</p>
                    {item.quantity && <p className="text-sm text-text-secondary">{item.quantity}</p>}
                  </div>
                </div>
                {!selecting && (
                  <div className="flex shrink-0 gap-3 text-sm">
                    <button onClick={() => startEdit(item)} className="text-text-secondary underline underline-offset-4">Edit</button>
                    <button onClick={() => mutate(() => pantryApi.remove(item.id))} className="text-text-secondary underline underline-offset-4">Delete</button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-4 py-5 sm:py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Pantry</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {loading ? 'Loading…' : query.trim() ? `${visibleItems.length} of ${items.length} items` : `${items.length} items`}
          </p>
        </div>
        {!loading && items.length > 1 && !selecting && (
          <button onClick={startSelecting} className="text-sm text-text-secondary underline underline-offset-4">
            Select items
          </button>
        )}
      </header>

      <section aria-label="Organize pantry" className="mb-6 grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <input aria-label="Search pantry" placeholder="Search pantry" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 border border-outline bg-surface-raised px-3 py-2 text-base" />
        <select aria-label="Sort pantry" value={sort} onChange={(event) => setSort(event.target.value as InventoryListSort)} className="border border-outline bg-surface-raised px-3 py-2 text-sm">
          <option value="recent">Recently added</option>
          <option value="name">A–Z</option>
        </select>
      </section>

      {selecting && (
        <section aria-label="Bulk pantry actions" className="mb-6 flex flex-wrap items-center justify-between gap-3 border-y border-outline py-3">
          <p className="text-sm text-text-secondary">{selectedIds.size} selected</p>
          <div className="flex items-center gap-3">
            <button onClick={stopSelecting} className="text-sm text-text-secondary underline underline-offset-4">
              Cancel
            </button>
            <button
              onClick={deleteSelected}
              disabled={selectedIds.size < 2}
              className="border border-text-danger px-3 py-2 text-sm text-text-danger disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete selected
            </button>
          </div>
        </section>
      )}

      <section aria-labelledby="add-item-heading" className="mb-8">
        <SectionHeading><span id="add-item-heading">Add an item</span></SectionHeading>
        <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_13rem_6rem_auto]">
          <input aria-label="Ingredient name" placeholder="Ingredient" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addItem()} className="min-w-0 border border-outline bg-surface-raised px-3 py-2 text-base" />
          <QuantityEditor
            label="Quantity"
            value={quantity}
            onChange={setQuantity}
            onEnter={addItem}
          />
          <select aria-label="Turnover" value={turnover} onChange={(e) => setTurnover(e.target.value as Turnover)} className="border border-outline bg-surface-raised px-3 py-2 text-base">
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
          <button onClick={addItem} className="border border-text-primary bg-text-primary px-4 py-2 text-sm font-medium text-surface-base">Add</button>
        </div>
      </section>

      {error && <p role="alert" className="mb-4 text-sm text-text-danger">{error}</p>}

      {loading ? (
        <div role="status" aria-label="Loading pantry" className="space-y-3">
          <p className="text-sm text-text-secondary">Loading pantry…</p>
          <div data-testid="pantry-loading-rows" className="divide-y divide-outline border-y border-outline" aria-hidden="true">
            {[0, 1, 2].map((row) => (
              <div key={row} className="space-y-2 py-3">
                <div className="h-4 w-2/3 animate-pulse bg-surface-raised" />
                <div className="h-3 w-1/3 animate-pulse bg-surface-raised" />
              </div>
            ))}
          </div>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-secondary">Nothing here yet. Add the ingredients you use.</p>
      ) : visibleItems.length === 0 ? (
        <p className="text-sm text-text-secondary">No pantry items match “{query.trim()}”.</p>
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
