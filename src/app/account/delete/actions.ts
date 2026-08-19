"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const confirmationSchema = z.object({
  email: z.string().trim().email().max(254),
  confirmation: z.literal("DELETE MY ACCOUNT"),
});

export async function deleteOrbitAccount(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login?error=Sign%20in%20before%20deleting%20your%20account");

  const parsed = confirmationSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    confirmation: String(formData.get("confirmation") ?? "").trim(),
  });
  if (!parsed.success || parsed.data.email.toLowerCase() !== user.email.toLowerCase()) {
    redirect("/account/delete?error=Deletion%20confirmation%20did%20not%20match");
  }

  const quota = await consumeRateLimit({
    scope: "account.delete",
    subject: user.id,
    limit: 3,
    windowSeconds: 3600,
  });
  if (!quota.allowed) redirect("/account/delete?error=Too%20many%20deletion%20attempts");

  const admin = createAdminClient();
  if (!admin) redirect("/account/delete?error=Account%20deletion%20service%20is%20unavailable");

  // Owned workspaces contain tenant data and use ON DELETE CASCADE. Collaborating
  // workspace history keeps the business record while user attribution is nulled by FK policy.
  const owned = await admin
    .from("workspaces")
    .select("id")
    .eq("owner_id", user.id);
  if (owned.error) redirect("/account/delete?error=Owned%20workspaces%20could%20not%20be%20verified");

  for (const workspace of owned.data ?? []) {
    const removed = await admin.from("workspaces").delete().eq("id", workspace.id).eq("owner_id", user.id);
    if (removed.error) {
      console.error("Account deletion workspace cleanup failed", { workspaceId: workspace.id, code: removed.error.code });
      redirect("/account/delete?error=Workspace%20data%20could%20not%20be%20deleted");
    }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id, false);
  if (error) {
    console.error("Orbit account deletion failed", { code: error.code, status: error.status });
    redirect("/account/delete?error=Account%20could%20not%20be%20deleted");
  }

  redirect("/login?notice=Your%20Orbit%20account%20and%20owned%20workspace%20data%20were%20deleted");
}
