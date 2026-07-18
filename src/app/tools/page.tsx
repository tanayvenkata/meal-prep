'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const TOOL_KINDS = ['appliance', 'cookware', 'bakeware'] as const
type ToolKind = typeof TOOL_KINDS[number]

type KitchenTool = {
  id: string
  name: string
  kind: string
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export default function ToolsPage() {
  const [tools, setTools] = useState<KitchenTool[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ToolKind>('appliance')
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editKind, setEditKind] = useState<ToolKind>('appliance')
  const editNameRef = useRef<HTMLInputElement>(null)

  async function loadTools() {
    const token = await getToken()
    if (!token) return
    try {
      const res = await fetch('/api/tools', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`tools load failed (${res.status})`)
      setTools(await res.json())
      setError(null)
    } catch (err) {
      console.error('failed to load tools:', err)
      setError('Could not load your kitchen tools. Try refreshing.')
    }
  }

  useEffect(() => {
    let ignore = false
    async function startFetching() {
      await loadTools()
      if (!ignore) setLoading(false)
    }
    startFetching()
    return () => { ignore = true }
  }, [])

  async function mutate(method: 'POST' | 'PUT' | 'DELETE', body: object) {
    const token = await getToken()
    if (!token) return false
    setError(null)
    const res = await fetch('/api/tools', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Something went wrong')
      return false
    }
    await loadTools()
    return true
  }

  async function addTool() {
    if (!name.trim()) return
    if (await mutate('POST', { name: name.trim(), kind })) {
      setName('')
      setKind('appliance')
    }
  }

  function startEdit(tool: KitchenTool) {
    setEditingId(tool.id)
    setEditName(tool.name)
    setEditKind(TOOL_KINDS.includes(tool.kind as ToolKind) ? tool.kind as ToolKind : 'appliance')
    setTimeout(() => editNameRef.current?.focus(), 0)
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return
    if (await mutate('PUT', { id, name: editName.trim(), kind: editKind })) setEditingId(null)
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-4 py-5 sm:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Kitchen tools</h1>
        <p className="mt-1 text-sm text-text-secondary">{loading ? 'Loading…' : `${tools.length} tools`}</p>
      </header>

      <section aria-labelledby="add-tool-heading" className="mb-8">
        <h2 id="add-tool-heading" className="mb-2 text-sm font-semibold text-text-primary">Add a tool</h2>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
          <input aria-label="Tool name" placeholder="Tool (e.g. air fryer)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTool()} className="min-w-0 border border-outline bg-surface-raised px-3 py-2 text-base" />
          <select aria-label="Tool kind" value={kind} onChange={(e) => setKind(e.target.value as ToolKind)} className="border border-outline bg-surface-raised px-3 py-2 text-base">
            {TOOL_KINDS.map((toolKind) => <option key={toolKind} value={toolKind}>{toolKind}</option>)}
          </select>
          <button onClick={addTool} className="border border-text-primary bg-text-primary px-4 py-2 text-sm font-medium text-surface-base">Add</button>
        </div>
      </section>

      {error && <p className="mb-4 text-sm text-text-danger">{error}</p>}

      {loading ? <p className="text-sm text-text-secondary">Loading kitchen tools…</p> : tools.length === 0 ? (
        <p className="text-sm text-text-secondary">Add the equipment you cook with most.</p>
      ) : (
        <ul className="divide-y divide-outline border-y border-outline">
          {tools.map((tool) => (
            <li key={tool.id} className="py-3">
              {editingId === tool.id ? (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto_auto]">
                  <input ref={editNameRef} aria-label="Edit tool name" value={editName} onChange={(e) => setEditName(e.target.value)} className="min-w-0 border border-outline bg-surface-raised px-2 py-2 text-base" />
                  <select aria-label="Edit tool kind" value={editKind} onChange={(e) => setEditKind(e.target.value as ToolKind)} className="border border-outline bg-surface-raised px-2 py-2 text-sm">
                    {TOOL_KINDS.map((toolKind) => <option key={toolKind} value={toolKind}>{toolKind}</option>)}
                  </select>
                  <button aria-label="Save tool" onClick={() => saveEdit(tool.id)} className="border border-outline px-3 py-2 text-sm"><Check size={16} /></button>
                  <button aria-label="Cancel edit" onClick={() => setEditingId(null)} className="border border-outline px-3 py-2 text-sm"><X size={16} /></button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base text-text-primary">{tool.name}</p>
                    <p className="text-sm text-text-secondary">{tool.kind}</p>
                  </div>
                  <div className="flex shrink-0 gap-3 text-sm">
                    <button onClick={() => startEdit(tool)} className="text-text-secondary underline underline-offset-4">Edit</button>
                    <button onClick={() => mutate('DELETE', { id: tool.id })} className="text-text-secondary underline underline-offset-4">Delete</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
