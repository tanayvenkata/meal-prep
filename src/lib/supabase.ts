// THE BOUNDARY — only file that imports the Supabase client. Handles auth in the browser.
// Uses createBrowserClient from @supabase/ssr so the session is stored in cookies,
// which middleware can read. The old createClient stored in localStorage (server-blind).

import { createBrowserClient } from "@supabase/ssr";

let _client: ReturnType<typeof createBrowserClient> | null = null;

function getBrowserClient() {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "placeholder-anon-key";
    _client = createBrowserClient(url, key);
  }
  return _client;
}

export const supabase = new Proxy({} as ReturnType<typeof createBrowserClient>, {
  get(_target, prop, receiver) {
    return Reflect.get(getBrowserClient(), prop, receiver);
  },
});

// The access token for the current session, or null if signed out. Every authed
// client fetch needs it for the `Authorization: Bearer` header — keep that dance
// in one place behind the boundary rather than re-deriving it at each call site.
export async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
