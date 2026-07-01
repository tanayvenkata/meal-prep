"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Mic, ArrowUp, Square } from "lucide-react";
import type { ChatMessage } from "@/lib/ai";
import { supabase } from "@/lib/supabase";

type Props = {
  apiRoute: string;
  placeholder: string;
  requiresAuth?: boolean;
};

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export default function ChatWindow({ apiRoute, placeholder, requiresAuth }: Props) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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

    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: input },
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
        body: JSON.stringify({ messages: newMessages }),
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
      setMessages([...newMessages, { role: "assistant", content: full }]);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("stream error:", err);
        setError("Response interrupted, please try again");
      }
      // AbortError: partial response stays in message list with a stopped indicator
      if (full) {
        setMessages([...newMessages, { role: "assistant", content: full + "\n\n*(stopped)*" }]);
      }
    }

    setReply("");
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
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ink">
              <span className="font-serif text-2xl font-semibold text-paper">M</span>
            </div>
            <h2 className="font-serif text-2xl font-semibold text-ink">What are we making?</h2>
            <p className="text-sm text-muted max-w-xs">
              Tell me what you&apos;re in the mood for and I&apos;ll work with what&apos;s in your pantry.
            </p>
          </div>
        ) : (
          <>
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`prose prose-sm max-w-[82%] px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-ink text-paper prose-invert rounded-2xl rounded-br-md"
                      : "bg-surface text-ink rounded-2xl rounded-bl-md"
                  }`}
                  style={
                    m.role === "assistant"
                      ? { boxShadow: "0 1px 4px rgba(34,29,24,.07)" }
                      : undefined
                  }
                >
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              </div>
            ))}

            {reply && (
              <div className="flex justify-start">
                <div
                  className="prose prose-sm max-w-[82%] rounded-2xl rounded-bl-md bg-surface px-4 py-2.5 text-sm leading-relaxed text-ink"
                  style={{ boxShadow: "0 1px 4px rgba(34,29,24,.07)" }}
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
          className="mb-3 rounded-xl border bg-surface px-4 py-3 text-sm text-ink"
          style={{
            borderColor: "#e6c4ba",
            boxShadow: "0 1px 4px rgba(34,29,24,.07)",
          }}
        >
          <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ember text-xs font-bold text-white">!</span>
          {error}
        </div>
      )}

      {/* input bar */}
      <div
        className="flex items-center gap-2 rounded-full bg-surface px-3 py-2"
        style={{ boxShadow: "0 2px 12px rgba(34,29,24,.08)" }}
      >
        <input
          className="flex-1 bg-transparent px-2 py-1 text-base text-ink placeholder:text-muted outline-none disabled:opacity-40"
          placeholder={placeholder}
          value={input}
          disabled={authExpired}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !isLoading && sendMessage()}
        />
        <button
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
            listening
              ? "bg-ember text-white"
              : "bg-pantry-strip text-ink hover:bg-sand"
          }`}
          onClick={toggleListening}
          disabled={authExpired}
          title={listening ? "Stop listening" : "Voice input"}
        >
          <Mic size={16} strokeWidth={2.2} />
        </button>
        {isLoading ? (
          <button
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-ember text-white hover:opacity-90 transition-opacity"
            onClick={stopStreaming}
            title="Stop"
          >
            <Square size={14} strokeWidth={2.2} fill="currentColor" />
          </button>
        ) : (
          <button
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-ember text-white hover:opacity-90 transition-opacity disabled:opacity-40"
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
