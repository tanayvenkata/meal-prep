'use client'
// ^ This page uses useState (browser-only React). App Router pages are Server
// Components by default and CAN'T use state, so this directive flips the whole
// file to a Client Component that runs in the browser. Must be line 1, before imports.

import { useState, useEffect } from 'react'
import Link from 'next/link'

// One pantry item. `id` is how we tell items apart when editing/deleting
// (names aren't unique enough — you might have two "onions"). name + quantity
// per our decision: editing the quantity is what makes "Update" feel real.
type Item = {
  id: number
  name: string
  quantity: string
}

export default function PantryPage() {
  // THE list. `items` is the current pantry; `setItems` is the ONLY way to change
  // it. This lives in memory only — refresh the page and it's gone. That vanishing
  // is the M3 lesson: we'll feel it, then add Postgres to fix it.
  const [items, setItems] = useState<Item[]>([])

  // What's currently TYPED in the two boxes (not added yet — just in-progress text).
  // Each box mirrors its own state: box shows `name`, every keystroke calls setName.
  // This is a "controlled input" — the state is the source of truth, not the box.
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')

  // THE SHARED HELPER. Fetches the full list from the DB and puts it in state.
  // This is our "re-fetch the truth" move: the screen mirrors the database. We
  // call it on load AND after every change, so there's only one way the list ever
  // gets populated — straight from the DB. async because fetch takes time.
  async function loadItems() {
    try {
      const res = await fetch('/api/pantry') // GET → our endpoint
      const data = await res.json()
      setItems(data) // state = exactly what the DB returned
    } catch (err) {
      console.error('failed to load pantry:', err)
    }
  }

  // LOAD ON OPEN. The official React pattern: define the async fetch INSIDE the
  // effect and call it here. The `ignore` flag + cleanup handle a real edge case:
  // if you navigate away before the fetch returns, cleanup sets ignore=true so we
  // skip setItems on a gone page (avoids a stale-update bug). [] = run once on mount.
  useEffect(() => {
    let ignore = false
    async function startFetching() {
      try {
        const res = await fetch('/api/pantry')
        const data = await res.json()
        if (!ignore) setItems(data) // only update if the page is still here
      } catch (err) {
        console.error('failed to load pantry:', err)
      }
    }
    startFetching()
    return () => {
      ignore = true // cleanup: a late response will now be discarded
    }
  }, []) // [] = "only on first load"

  // SHARED MUTATION HELPER. All three changes (add/delete/edit) hit the SAME
  // endpoint with the same headers — only the HTTP method and the body differ.
  // So we extract that one shape here: send the change, then re-fetch the truth.
  // One place to later add error handling (e.g. check res.ok) for all three.
  async function mutate(method: 'POST' | 'PUT' | 'DELETE', body: object) {
    await fetch('/api/pantry', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await loadItems() // re-fetch → screen reflects the DB
  }

  // CREATE — POST with the new item. await the server change, then re-fetch,
  // then clear the boxes. "Save, then reload-the-truth."
  async function addItem() {
    if (name.trim() === '') return
    await mutate('POST', { name: name.trim(), quantity: quantity.trim() })
    setName('') // clear the boxes
    setQuantity('')
  }

  // DELETE — id tells the server which row to remove.
  async function deleteItem(id: number) {
    await mutate('DELETE', { id })
  }

  // UPDATE — PUT the id + new quantity.
  async function updateQuantity(id: number) {
    const newQuantity = prompt('New quantity?')
    if (newQuantity === null) return // user hit Cancel
    await mutate('PUT', { id, quantity: newQuantity.trim() })
  }

  return (
    <main style={{ maxWidth: 600, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Pantry</h1>
      {/* Link back to the chat home — client-side nav, no full reload. */}
      <Link href="/" style={{ color: '#2563eb', textDecoration: 'underline' }}>
        ← Back to chat
      </Link>
      <p>{items.length} item(s)</p>

      {/* The two boxes + Add button. Each box's `value` is tied to state, and
          `onChange` updates that state on every keystroke. That two-way tie is
          what makes it a controlled input. */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          placeholder="ingredient (e.g. chicken thighs)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="quantity (e.g. 2 lbs)"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <button onClick={addItem}>Add</button>
      </div>

      {/* READ: show the actual list. .map turns each item in the array into one
          <li> row on screen. Because this is derived from `items`, adding an item
          (which changes `items`) makes a new row appear automatically — we never
          write "add a row" code; the list re-derives itself from state.
          key={item.id} = React needs a unique id per row to track rows apart. */}
      <ul>
        {items.map((item) => (
          <li key={item.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span>{item.name} — {item.quantity}</span>
            {/* Each button passes THIS row's id, so the handler knows which one. */}
            <button onClick={() => updateQuantity(item.id)}>Edit</button>
            <button onClick={() => deleteItem(item.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </main>
  )
}
