'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
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
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function loadItems() {
    const token = await getToken()
    if (!token) return
    try {
      const res = await fetch('/api/pantry', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setItems(data)
    } catch (err) {
      console.error('failed to load pantry:', err)
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
        const data = await res.json()
        if (!ignore) setItems(data)
      } catch (err) {
        console.error('failed to load pantry:', err)
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

  async function updateQuantity(id: number) {
    const newQuantity = prompt('New quantity?')
    if (newQuantity === null) return
    await mutate('PUT', { id, quantity: newQuantity.trim() })
  }

  return (
    <main style={{ maxWidth: 600, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Pantry</h1>
      <Link href="/" style={{ color: '#2563eb', textDecoration: 'underline' }}>
        ← Back to chat
      </Link>
      <p>{items.length} item(s)</p>
      {error && <p style={{ color: 'red' }}>{error}</p>}

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

      <ul>
        {items.map((item) => (
          <li key={item.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span>{item.name} — {item.quantity}</span>
            <button onClick={() => updateQuantity(item.id)}>Edit</button>
            <button onClick={() => deleteItem(item.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </main>
  )
}
