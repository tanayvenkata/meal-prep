import { createClient } from "@supabase/supabase-js";

export type RequestAuthContext = {
  userId: string;
  oauthClientId: string | null;
};

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

export async function getRequestAuth(
  request: Request,
): Promise<RequestAuthContext | null> {
  const authorization = request.headers.get("Authorization");
  const match = authorization ? /^Bearer ([^\s]+)$/i.exec(authorization) : null;
  const token = match?.[1];
  if (!token) return null;

  const supabase = getSupabase();
  const [userResult, claimsResult] = await Promise.all([
    supabase.auth.getUser(token),
    supabase.auth.getClaims(token),
  ]);
  const user = userResult.data.user;
  const claims = claimsResult.data?.claims;
  if (
    userResult.error
    || claimsResult.error
    || !user
    || !claims
    || claims.sub !== user.id
  ) {
    return null;
  }

  return {
    userId: user.id,
    oauthClientId:
      typeof claims.client_id === "string" && claims.client_id
        ? claims.client_id
        : null,
  };
}
