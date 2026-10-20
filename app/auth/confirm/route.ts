import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Supabase appends token_hash & type to the emailRedirectTo URL; some
  // templates pass `redirect_to` instead of `next` — accept both.
  const rawNext = searchParams.get("next") ?? searchParams.get("redirect_to") ?? "/";
  // Only allow same-site relative paths (guards against open redirects).
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      // redirect user to specified redirect URL or root of app
      redirect(next);
    } else {
      // redirect the user to an error page with some instructions
      redirect(`/auth/error?error=${encodeURIComponent(error.message)}`);
    }
  }

  // redirect the user to an error page with some instructions
  redirect(`/auth/error?error=No%20token%20hash%20or%20type`);
}