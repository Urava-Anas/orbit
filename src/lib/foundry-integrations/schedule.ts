import "server-only";

import { after } from "next/server";
import { runFoundryWorker } from "@/lib/foundry-integrations/worker";

export function scheduleFoundryWorker() {
  if (
    !(
      process.env.SUPABASE_SECRET_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  ) {
    return;
  }

  after(async () => {
    try {
      await runFoundryWorker({ outboxBatch: 10, deliveryBatch: 20 });
    } catch (error) {
      console.error("Foundry background worker failed", error);
    }
  });
}
