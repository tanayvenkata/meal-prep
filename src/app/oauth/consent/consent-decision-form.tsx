"use client";

import { useRef, useState } from "react";

type ConsentDecisionFormProps = {
  authorizationId: string;
};

export function ConsentDecisionForm({
  authorizationId,
}: ConsentDecisionFormProps) {
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      action="/api/oauth/decision"
      method="post"
      className="flex gap-3"
      onSubmit={(event) => {
        if (submittingRef.current) {
          event.preventDefault();
          return;
        }

        submittingRef.current = true;
        setSubmitting(true);
      }}
    >
      <input
        type="hidden"
        name="authorization_id"
        value={authorizationId}
        aria-label="Authorization request ID"
      />
      <button
        type="submit"
        name="decision"
        value="deny"
        aria-disabled={submitting}
        className={`flex-1 rounded-xl border border-outline bg-surface-raised px-4 py-2.5 text-sm text-text-primary hover:border-outline-strong ${
          submitting ? "pointer-events-none opacity-60" : ""
        }`}
      >
        Cancel
      </button>
      <button
        type="submit"
        name="decision"
        value="approve"
        aria-disabled={submitting}
        className={`flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 ${
          submitting ? "pointer-events-none opacity-60" : ""
        }`}
      >
        {submitting ? "Connecting…" : "Connect"}
      </button>
    </form>
  );
}
