import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";

const stageFourExecutionStorage = new AsyncLocalStorage<SupabaseClient>();

export function runWithStageFourExecutionClient<T>(
  client: SupabaseClient,
  operation: () => Promise<T>,
) {
  return stageFourExecutionStorage.run(client, operation);
}

export function getStageFourExecutionClient() {
  return stageFourExecutionStorage.getStore() ?? null;
}
