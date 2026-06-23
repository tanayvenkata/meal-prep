"use client";

import { useState } from "react";
import type { ChatMessage } from "@/lib/ai";
import { supabase } from "@/lib/supabase";

type Props = {
  title: string;
  apiRoute: string;
  placeholder: string;
  requiresAuth?: boolean;
  links?: { href: string; label: string }[];
};

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export default function ChatWindow({ title, apiRoute, placeholder, requiresAuth, links }: Props) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function sendMessage() {
    if (!input.trim()) return;

    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: input },
    ];
    setMessages(newMessages);
    setInput("");
    setReply("");
    setError(null);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (requiresAuth) {
      const token = await getToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(apiRoute, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: newMessages }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Something went wrong");
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let full = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value);
        setReply(full);
      }
      setMessages([...newMessages, { role: "assistant", content: full }]);
    } catch (err) {
      console.error("stream error:", err);
      setError("Response interrupted, please try again");
    }

    setReply("");
  }

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col p-4">
      <h1 className="mb-4 text-xl font-bold">{title}</h1>

      {links?.map((l) => (
        <a key={l.href} href={l.href} className="mb-2 text-blue-600 underline">
          → {l.label}
        </a>
      ))}

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

      {error && <p className="mt-2 text-red-500">{error}</p>}

      <div className="mt-4 flex gap-2">
        <input
          className="flex-1 rounded border p-2"
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
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
