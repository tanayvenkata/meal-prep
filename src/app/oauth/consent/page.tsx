import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ConsentDecisionForm } from "./consent-decision-form";

type ConsentPageProps = {
  searchParams: Promise<{ authorization_id?: string }>;
};

export default async function OAuthConsentPage({ searchParams }: ConsentPageProps) {
  const { authorization_id: authorizationId } = await searchParams;

  if (!authorizationId) {
    return <ConsentError message="This authorization request is missing its ID." />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const returnTo = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(
    authorizationId,
  );

  if (error || !data) {
    return (
      <ConsentError
        message={error?.message ?? "Mise could not load this authorization request."}
      />
    );
  }

  if ("redirect_url" in data) redirect(data.redirect_url);

  const scopes = data.scope.split(" ").filter(Boolean);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-10">
      <section className="w-full rounded-2xl bg-surface-raised p-6 shadow-md">
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-fill-inverse">
            <span className="font-serif text-2xl font-semibold text-text-inverse">M</span>
          </div>
          <h1 className="font-serif text-2xl font-semibold text-text-primary">
            Connect {data.client.name || "this AI client"} to Mise?
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            It will be able to read your pantry and kitchen tools so it can give
            kitchen-aware suggestions.
          </p>
        </div>

        <dl className="mb-6 space-y-3 rounded-xl bg-surface-muted p-4 text-sm">
          <div>
            <dt className="font-medium text-text-primary">Signed in as</dt>
            <dd className="break-all text-text-secondary">{data.user.email}</dd>
          </div>
          <div>
            <dt className="font-medium text-text-primary">Requested access</dt>
            <dd className="text-text-secondary">
              {scopes.length > 0 ? scopes.join(", ") : "Basic account identity"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-text-primary">Return address</dt>
            <dd className="break-all text-text-secondary">{data.redirect_uri}</dd>
          </div>
        </dl>

        <p className="mb-6 text-xs leading-5 text-text-secondary">
          Mise remains the permission boundary. This connection cannot add, edit,
          or delete pantry items or tools.
        </p>

        <ConsentDecisionForm authorizationId={data.authorization_id} />
      </section>
    </main>
  );
}

function ConsentError({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
      <section className="w-full rounded-2xl bg-surface-raised p-6 shadow-md">
        <h1 className="font-serif text-2xl font-semibold text-text-primary">
          Could not connect to Mise
        </h1>
        <p role="alert" className="mt-3 text-sm text-text-danger">
          {message}
        </p>
      </section>
    </main>
  );
}
