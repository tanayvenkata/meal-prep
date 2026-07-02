"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Mic, ArrowUp, Square } from "lucide-react";
import type { ChatMessage } from "@/lib/ai";
import { supabase } from "@/lib/supabase";

// UI-level message: ChatMessage plus a timestamp for the date dividers. createdAt is
// optional because it's presentation-only — it never travels to the API (the chat route
// forwards messages straight to the Anthropic SDK, which rejects extra fields).
export type UiMessage = ChatMessage & { createdAt?: string };

type Props = {
  apiRoute: string;
  placeholder: string;
  requiresAuth?: boolean;
  conversationId?: string;
  initialMessages?: UiMessage[];
};

// "Today" / "Yesterday" / "Jun 12" — same labelling scheme as HistoryDrawer's groups.
function dayLabel(iso: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TYPING_DOTS: { className: string; delayMs: number }[] = [
  { className: "bg-accent", delayMs: 0 },
  { className: "bg-accent-soft", delayMs: 400 },
  { className: "bg-surface-muted", delayMs: 800 },
];

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export default function ChatWindow({ apiRoute, placeholder, requiresAuth, conversationId, initialMessages }: Props) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages ?? []);
  const generatedId = useRef(crypto.randomUUID());
  const activeConversationId = conversationId ?? generatedId.current;
  const [reply, setReply] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // status of the failed request (e.g. 401), or null. authExpired is DERIVED from this —
  // we never store a separate "locked out" flag that could drift out of sync with error.
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, reply]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isLoading) stopStreaming();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isLoading]);

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Voice input is not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (e: { results: SpeechRecognitionResultList }) => {
      const transcript = e.results[0][0].transcript;
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };

    recognition.onerror = (e: { error: string }) => {
      if (e.error === "not-allowed") {
        setError("Microphone access blocked — click the lock icon in your browser's address bar to allow it");
      } else {
        setError("Microphone error — please try again");
      }
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("Could not start voice input — try clicking the button again");
    }
  }

  function stopStreaming() {
    abortControllerRef.current?.abort();
  }

  async function sendMessage() {
    if (!input.trim() || isLoading) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
    }

    const newMessages: UiMessage[] = [
      ...messages,
      { role: "user", content: input, createdAt: new Date().toISOString() },
    ];
    setMessages(newMessages);
    setInput("");
    setReply("");
    setError(null);
    setErrorStatus(null);
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (requiresAuth) {
      const token = await getToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    let res: Response;
    try {
      res = await fetch(apiRoute, {
        method: "POST",
        headers,
        // strip createdAt — the route hands messages straight to the Anthropic SDK
        body: JSON.stringify({
          messages: newMessages.map(({ role, content }) => ({ role, content })),
          conversationId: activeConversationId,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setIsLoading(false);
        setReply("");
        return;
      }
      setError("Something went wrong");
      setIsLoading(false);
      return;
    }

    if (!res.ok) {
      setIsLoading(false);
      if (res.status === 401) {
        setError("Session expired — please sign out and sign in again");
        setErrorStatus(401);
        return;
      }
      if (res.status === 429) {
        setError("Too many requests — please wait a moment before trying again");
        return;
      }
      try {
        const data = await res.json();
        setError(data.error ?? "Something went wrong");
      } catch {
        setError("Something went wrong");
      }
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
      setReply("");
      setMessages([...newMessages, { role: "assistant", content: full, createdAt: new Date().toISOString() }]);
      const token = await getToken();
      await fetch(`/api/conversations/${activeConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ role: "assistant", content: full }),
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("stream error:", err);
        setError("Response interrupted, please try again");
      }
      // AbortError: partial response stays in message list with a stopped indicator
      if (full) {
        setReply("");
        setMessages([...newMessages, { role: "assistant", content: full + "\n\n*(stopped)*", createdAt: new Date().toISOString() }]);
      }
    }

    setIsLoading(false);
  }

  const isEmpty = messages.length === 0 && !reply;
  // computed, not stored — single source of truth is errorStatus
  const authExpired = errorStatus === 401;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden px-4 py-4">
      {/* message list — min-h-0 lets this flex child shrink below content size so it actually scrolls */}
      <div
        className={`scrollbar-hide min-h-0 flex-1 overflow-y-auto space-y-3 pb-2 transition-opacity ${
          authExpired ? "opacity-40" : ""
        }`}
      >
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-fill-inverse">
              <span className="font-serif text-2xl font-semibold text-text-inverse">M</span>
            </div>
            <h2 className="font-serif text-2xl font-semibold text-text-primary">What are we making?</h2>
            <p className="text-sm text-text-secondary max-w-xs">
              Tell me what you&apos;re in the mood for and I&apos;ll work with what&apos;s in your pantry.
            </p>
          </div>
        ) : (
          <>
            {messages.map((m, i) => {
              // divider when this message starts a new day. Messages without a timestamp
              // (e.g. rows saved before timestamps were surfaced) inherit the previous
              // group rather than forcing a divider.
              const label = m.createdAt ? dayLabel(m.createdAt) : null;
              const prevWithDate = messages.slice(0, i).reverse().find((p) => p.createdAt);
              const prevLabel = prevWithDate?.createdAt ? dayLabel(prevWithDate.createdAt) : null;
              const showDivider = label !== null && label !== prevLabel;
              return (
              <div key={i}>
                {showDivider && (
                  <div className="flex justify-center pt-2 pb-3">
                    <span className="font-mono text-[10.5px] uppercase tracking-wider text-text-secondary">
                      {label}
                    </span>
                  </div>
                )}
              <div
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`prose-sm max-w-[82%] px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "prose-invert dark:prose bg-fill-inverse text-text-inverse rounded-2xl rounded-br-md"
                      : "prose dark:prose-invert bg-surface-raised text-text-primary rounded-2xl rounded-bl-md"
                  }`}
                  style={
                    m.role === "assistant"
                      ? { boxShadow: "0 1px 4px var(--shadow-color-sm)" }
                      : undefined
                  }
                >
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              </div>
              </div>
              );
            })}

            {isLoading && !reply && (
              <div className="flex flex-col items-start gap-1.5">
                <div
                  className="flex items-center gap-1 rounded-full bg-surface-raised px-4 py-3"
                  style={{ boxShadow: "0 1px 4px var(--shadow-color-sm)" }}
                >
                  {TYPING_DOTS.map(({ className, delayMs }) => (
                    <span
                      key={delayMs}
                      className={`h-1.5 w-1.5 animate-typing-dot rounded-full ${className}`}
                      style={{ animationDelay: `${delayMs}ms` }}
                    />
                  ))}
                </div>
                <span className="pl-2 font-mono text-[10.5px] uppercase tracking-wider text-text-secondary">
                  Mise is thinking
                </span>
              </div>
            )}

            {reply && (
              <div className="flex justify-start">
                <div
                  className="prose dark:prose-invert prose-sm max-w-[82%] rounded-2xl rounded-bl-md bg-surface-raised px-4 py-2.5 text-sm leading-relaxed text-text-primary"
                  style={{ boxShadow: "0 1px 4px var(--shadow-color-sm)" }}
                >
                  <ReactMarkdown>{reply}</ReactMarkdown>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* error banner */}
      {error && (
        <div
          className="mb-3 rounded-xl border border-danger-outline bg-surface-raised px-4 py-3 text-sm text-text-primary"
          style={{ boxShadow: "0 1px 4px var(--shadow-color-sm)" }}
        >
          <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-danger text-xs font-bold text-white">!</span>
          {error}
        </div>
      )}

      {/* input bar */}
      <div
        className="flex items-center gap-2 rounded-full bg-surface-raised px-3 py-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
        style={{ boxShadow: "0 2px 12px var(--shadow-color-md)" }}
      >
        <input
          className="flex-1 bg-transparent px-2 py-1 text-base text-text-primary placeholder:text-text-secondary outline-none disabled:opacity-40"
          aria-label={placeholder}
          placeholder={placeholder}
          value={input}
          disabled={authExpired}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !isLoading && sendMessage()}
        />
        <button
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
            listening
              ? "bg-accent text-white"
              : "bg-surface-hover text-text-primary hover:bg-surface-muted"
          }`}
          onClick={toggleListening}
          disabled={authExpired}
          title={listening ? "Stop listening" : "Voice input"}
        >
          <Mic size={16} strokeWidth={2.2} />
        </button>
        {isLoading ? (
          <button
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent text-white hover:opacity-90 transition-opacity"
            onClick={stopStreaming}
            title="Stop"
          >
            <Square size={14} strokeWidth={2.2} fill="currentColor" />
          </button>
        ) : (
          <button
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-40"
            onClick={sendMessage}
            disabled={!input.trim() || authExpired}
            title="Send"
          >
            <ArrowUp size={18} strokeWidth={2.2} />
          </button>
        )}
      </div>
    </main>
  );
}
