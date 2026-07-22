import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const authorizationId = formData.get("authorization_id");
  const decision = formData.get("decision");

  if (
    typeof authorizationId !== "string" ||
    (decision !== "approve" && decision !== "deny")
  ) {
    return NextResponse.json({ error: "Invalid consent decision." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in before granting access." }, { status: 401 });
  }

  const result =
    decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        });

  if (result.error || !result.data) {
    return NextResponse.json(
      { error: result.error?.message ?? "Could not save the consent decision." },
      { status: 400 },
    );
  }

  return NextResponse.redirect(result.data.redirect_url, 303);
}
