"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Conversation } from "@/lib/db";

type Props = {
  open: boolean;
  onClose: () => void;
};

function groupByDay(conversations: Conversation[]): { label: string; items: Conversation[] }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: Record<string, Conversation[]> = {};
  for (const c of conversations) {
    const d = new Date(c.created_at);
    d.setHours(0, 0, 0, 0);
    let label: string;
    if (d.getTime() === today.getTime()) label = "TODAY";
    else if (d.getTime() === yesterday.getTime()) label = "YESTERDAY";
    else label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    groups[label] = [...(groups[label] ?? []), c];
  }

  const order = ["TODAY", "YESTERDAY"];
  const sorted = Object.keys(groups).sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return new Date(groups[b][0].created_at).getTime() - new Date(groups[a][0].created_at).getTime();
  });

  return sorted.map((label) => ({ label, items: groups[label] }));
}

export default function HistoryDrawer({ open, onClose }: Props) {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    if (!open) return;
    async function load() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/conversations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setConversations(await res.json());
    }
    load();
  }, [open]);

  function newConversation() {
    const id = crypto.randomUUID();
    onClose();
    router.push(`/chat/${id}`);
  }

  function openConversation(id: string) {
    onClose();
    router.push(`/chat/${id}`);
  }

  const groups = groupByDay(conversations);

  return (
    <>
      {/* backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-ink/30"
          onClick={onClose}
        />
      )}

      {/* drawer panel */}
      <div
        className={`fixed inset-y-0 left-0 z-30 flex w-80 flex-col bg-surface transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ boxShadow: "4px 0 24px rgba(34,29,24,.12)" }}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-sand px-5 py-4">
          <h2 className="font-serif text-xl font-semibold text-ink">Conversations</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-pantry-strip hover:text-ink transition-colors"
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>

        {/* new conversation */}
        <div className="px-4 pt-4 pb-3">
          <button
            onClick={newConversation}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-ember py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            <Plus size={15} strokeWidth={2.5} />
            New conversation
          </button>
        </div>

        {/* conversation list */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {conversations.length === 0 ? (
            <p className="mt-6 text-center text-sm text-muted">No conversations yet</p>
          ) : (
            groups.map(({ label, items }) => (
              <div key={label} className="mb-4">
                <p className="mb-1.5 font-mono text-xs uppercase tracking-widest text-muted">
                  {label}
                </p>
                <div className="flex flex-col gap-1">
                  {items.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => openConversation(c.id)}
                      className="w-full rounded-xl bg-paper px-4 py-3 text-left hover:bg-pantry-strip transition-colors"
                      style={{ boxShadow: "0 1px 4px rgba(34,29,24,.07)" }}
                    >
                      <p className="truncate text-sm font-medium text-ink">{c.title}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
