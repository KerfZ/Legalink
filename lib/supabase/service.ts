import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client for server-side operations that bypass RLS
// (e.g. payment webhooks flipping transaction status). Requires
// SUPABASE_SECRET_KEY (service_role key) in the environment. Never
// expose this key to the browser — this module must only be imported
// from route handlers / server code.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}