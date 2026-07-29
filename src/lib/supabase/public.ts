import { createClient } from "@supabase/supabase-js";
import {
  supabasePublishableKey,
  supabaseUrl,
} from "@/lib/supabase/config";

export function createPublicClient() {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
