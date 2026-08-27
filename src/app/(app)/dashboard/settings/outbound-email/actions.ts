"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";

const schema = z.object({
  apiKey: z.string().trim().min(10).max(400),
  emailFrom: z.string().trim().min(5).max(240),
});

function fail(message: string): never {
  redirect(`/dashboard/settings/outbound-email?error=${encodeURIComponent(message)}`);
}

function succeed(message: string): never {
  redirect(`/dashboard/settings/outbound-email?notice=${encodeURIComponent(message)}`);
}

export async function saveOutboundEmailProvider(formData: FormData) {
  const parsed = schema.safeParse({
    apiKey: String(formData.get("apiKey") ?? ""),
    emailFrom: String(formData.get("emailFrom") ?? ""),
  });
  if (!parsed.success) fail("Enter a valid Resend API key and verified sender address.");

  const { supabase, workspace, user, role } = await requireWorkspace();
  if (!["owner", "admin"].includes(role)) fail("Owner or admin authority is required.");

  const emailCandidate =
    parsed.data.emailFrom.match(/<([^>]+)>/)?.[1] ?? parsed.data.emailFrom;
  if (!emailCandidate.includes("@")) fail("Verified sender must contain a valid email address.");
  if (!parsed.data.apiKey.startsWith("re_")) fail("Resend API key should start with re_.");

  const keyResult = await supabase.rpc("set_stage4_provider_secret", {
    p_workspace_id: workspace.id,
    p_key: "resend_api_key",
    p_value: parsed.data.apiKey,
  });
  if (keyResult.error) fail(`Orbit could not store the Resend key: ${keyResult.error.message}`);

  const fromResult = await supabase.rpc("set_stage4_provider_secret", {
    p_workspace_id: workspace.id,
    p_key: "email_from",
    p_value: parsed.data.emailFrom,
  });
  if (fromResult.error) fail(`Orbit could not store the verified sender: ${fromResult.error.message}`);

  const connection = await supabase
    .from("integration_connections")
    .upsert(
      {
        workspace_id: workspace.id,
        provider: "resend",
        status: "connected",
        provider_account_name: parsed.data.emailFrom,
        provider_account_type: "outbound_email",
        scopes: ["email.send"],
        selected_assets: [],
        metadata: {
          purpose: "stage4_outbound_email",
          secret_storage: "supabase_vault",
          provider: "resend",
        },
        connected_by: user.id,
        connected_at: new Date().toISOString(),
        disconnected_at: null,
      },
      { onConflict: "workspace_id,provider" },
    );

  if (connection.error) {
    fail(`Provider secrets were stored, but Orbit could not save the connection record: ${connection.error.message}`);
  }

  succeed("Resend connected to this Orbit workspace. Run preflight before enabling outbound actions.");
}
