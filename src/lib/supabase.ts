// THE BOUNDARY — only file that imports the Supabase client. Handles auth in the browser.
// Uses createBrowserClient from @supabase/ssr so the session is stored in cookies,
// which middleware can read. The old createClient stored in localStorage (server-blind).

import { createBrowserClient } from "@supabase/ssr";

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);
