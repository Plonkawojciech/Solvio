import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      // For signup confirmation, redirect to login or welcome
      if (type === 'signup') {
        redirect('/login?message=Email confirmed. Please sign in.');
      }
      // For recovery, redirect to update-password
      if (type === 'recovery') {
        redirect('/update-password');
      }
      // For other types, redirect to specified URL or root
      redirect(next);
    } else {
      // redirect the user to an error page with some instructions
      redirect(`/error?error=${encodeURIComponent(error?.message || 'Verification failed')}`);
    }
  }

  // redirect the user to an error page with some instructions
  redirect(`/error?error=${encodeURIComponent('No token hash or type')}`);
}
