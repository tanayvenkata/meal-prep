import Link from "next/link";
import { redirect } from "next/navigation";
import type { OAuthGrant } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import SignOutButton from "@/components/SignOutButton";

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?returnTo=%2Faccount");

  // Read the signed-in user's grants through the public SDK, never an admin key.
  // A grant proves authorization, not that the host currently holds a usable token.
  let grants: OAuthGrant[] | null = null;
  try {
    const result = await supabase.auth.oauth.listGrants();
    if (!result.error) grants = result.data;
  } catch {
    // Keep identity and account actions available during an OAuth service outage.
  }
  const providers = [...new Set(user.identities?.map((identity) => identity.provider) ?? [])];
  const labels: Record<string, string> = { email: "Email", google: "Google", github: "GitHub" };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="font-serif text-3xl font-semibold">Account</h1>
          <p className="mt-2 text-sm text-text-secondary">Manage your Mise identity and the apps you have authorized.</p>
        </header>
        <section aria-labelledby="identity-heading" className="rounded-2xl border border-outline bg-surface-raised p-5">
          <h2 id="identity-heading" className="font-serif text-xl font-semibold">Your identity</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div><dt className="text-text-secondary">Email</dt><dd className="mt-1 break-all">{user.email || "No email available"}</dd></div>
            <div><dt className="text-text-secondary">Sign-in providers</dt><dd className="mt-1">{providers.map((provider) => labels[provider] ?? provider).join(", ") || "Unavailable"}</dd></div>
            <div><dt className="text-text-secondary">Account ID</dt><dd className="mt-1 break-all font-mono text-xs">{user.id}</dd></div>
          </dl>
        </section>
        <section aria-labelledby="credentials-heading" className="rounded-2xl border border-outline bg-surface-raised p-5">
          <h2 id="credentials-heading" className="font-serif text-xl font-semibold">Credentials and account switching</h2>
          <p className="mt-2 text-sm text-text-secondary">Set or update a password for email sign-in to Mise. Google and GitHub passwords are managed with those providers.</p>
          <Link href="/reset-password?returnTo=%2Faccount" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-medium text-white hover:opacity-90">Update password</Link>
          <p className="mb-2 mt-5 text-sm text-text-secondary">To use another Mise account, sign out here and choose another account on the sign-in page. To switch Mise accounts in ChatGPT, reconnect Mise from ChatGPT as well.</p>
          <SignOutButton />
        </section>
        <section aria-labelledby="connections-heading" className="rounded-2xl border border-outline bg-surface-raised p-5">
          <h2 id="connections-heading" className="font-serif text-xl font-semibold">ChatGPT and connected apps</h2>
          <p className="mt-2 text-sm text-text-secondary">These apps have active authorization for this Mise account. Authorization does not confirm that ChatGPT is currently connected or that its token is valid.</p>
          {grants === null ? (
            <p role="alert" className="mt-4 text-sm text-text-danger">Connection status unavailable. Reload this page to try again.</p>
          ) : grants.length === 0 ? (
            <p className="mt-4 text-sm">No active app authorizations. To connect ChatGPT, add Mise in ChatGPT and authorize this account.</p>
          ) : (
            <ul className="mt-4 divide-y divide-outline">
              {grants.map((grant) => (
                <li key={grant.client.id} className="space-y-1 py-3 text-sm">
                  <p className="break-words font-medium">{grant.client.name || "Unnamed app"} <span className="font-normal text-text-secondary">· Authorized</span></p>
                  <p className="break-all text-xs text-text-secondary">Client ID: {grant.client.id}</p>
                </li>
              ))}
            </ul>
          )}
          <a href="/account" className="mt-4 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Refresh connection status</a>
        </section>
      </div>
    </main>
  );
}
