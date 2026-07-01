"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ChatWindow, { type UiMessage } from "@/components/ChatWindow";
import { supabase } from "@/lib/supabase";

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const [initialMessages, setInitialMessages] = useState<UiMessage[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { setInitialMessages([]); return; }

      const res = await fetch(`/api/conversations/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 404) { setInitialMessages([]); return; }
      if (!res.ok) { setError(true); return; }

      const body = await res.json();
      const messages: UiMessage[] = body.messages.map(
        (m: { role: "user" | "assistant"; content: string; created_at: string }) => ({
          role: m.role,
          content: m.content,
          createdAt: m.created_at,
        }),
      );
      setInitialMessages(messages);
    }

    load();
  }, [id]);

  if (error) {
    return (
      <main className="flex flex-1 items-center justify-center text-sm text-text-secondary">
        Could not load conversation.
      </main>
    );
  }

  if (initialMessages === null) {
    return (
      <main className="flex flex-1 items-center justify-center text-sm text-text-secondary">
        Loading…
      </main>
    );
  }

  return (
    <ChatWindow
      apiRoute="/api/chat"
      placeholder="What are you in the mood for?"
      requiresAuth
      conversationId={id}
      initialMessages={initialMessages}
    />
  );
}
