"use client";  // ← Spot 0: makes this run in the browser

import { useState } from "react";  // ← bring in useState

export default function Home() {
  // ── Spot 1: declare the state ──
  const [input, setInput] = useState("");

    async function sendMessage() {
      if (!input.trim()) return;   // ← guard: ignore empty/whitespace-only sends
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: input }],
      }),
    });

    console.log("response status:", res.status);
  }


  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col p-4">
      <h1 className="mb-4 text-xl font-bold">Meal Prep Chat</h1>

      <div className="flex-1 overflow-y-auto rounded border p-3">
        {/* messages will go here later */}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          className="flex-1 rounded border p-2"
          placeholder="What's in your fridge?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          className="rounded bg-black px-4 text-white"
          onClick={sendMessage}
        >
          Send
        </button>

      </div>
    </main>
  );
}
