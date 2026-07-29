import "server-only";

import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/config";

export function createAdminClient() {
  const secret =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) return null;

  return createClient(supabaseUrl, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
