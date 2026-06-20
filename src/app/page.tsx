"use client";

import { useState } from "react";
import Link from "next/link";
import type { ChatMessage } from "@/lib/ai";

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]); // conversation so far
  const [reply, setReply] = useState(""); // the reply as it streams in

  async function sendMessage() {
    if (!input.trim()) return;

    // 1. Build the new conversation with the user's message added.
    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: input },
    ];
    setMessages(newMessages);
    setInput("");   // clear the box
    setReply("");   // clear any old streaming reply

    // 2. Send it (same request as before, but with the full conversation).
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: newMessages }),
    });

    // 3. Read the streamed reply, chunk by chunk.
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let full = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      full += decoder.decode(value);
      setReply(full); // update the live reply on screen each chunk
    }

    // 4. Reply finished — commit it into the message list.
    setMessages([...newMessages, { role: "assistant", content: full }]);
    setReply("");
  }
  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col p-4">
      <h1 className="mb-4 text-xl font-bold">Meal Prep Chat</h1>

      {/* next/link navigates WITHOUT a full page reload (client-side transition)
          and prefetches the target — faster than a plain <a href>. */}
      <Link href="/pantry" className="mb-4 text-blue-600 underline">
        → My Pantry
      </Link>

      <div className="flex-1 overflow-y-auto rounded border p-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i}>
            <span className="font-semibold">
              {m.role === "user" ? "You" : "Claude"}:
            </span>{" "}
            {m.content}
          </div>
        ))}

        {reply && (
          <div>
            <span className="font-semibold">Claude:</span> {reply}
          </div>
        )}
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
