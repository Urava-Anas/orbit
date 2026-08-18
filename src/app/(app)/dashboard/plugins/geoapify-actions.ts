"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getGeoapifyRuntimeStatus, validateGeoapifyApiKey } from "@/lib/geoapify";
import { encryptIntegrationSecret } from "@/lib/integration-connections";
import { requireWorkspace } from "@/lib/workspace";

const apiKeySchema = z.string().trim().min(20).max(240).regex(/^[A-Za-z0-9_-]+$/);

function requireAdmin(role: string) {
  if (role !== "owner" && role !== "admin") {
    throw new Error("Only organisation owners and admins can manage Geoapify.");
  }
}

function pluginUrl(kind: "notice" | "error", message: string) {
  return `/dashboard/plugins/geoapify-lead-discovery?${kind}=${encodeURIComponent(message)}`;
}

function refresh() {
  revalidatePath("/dashboard/plugins");
  revalidatePath("/dashboard/plugins/geoapify-lead-discovery");
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/leads/add");
}

export async function connectGeoapify(formData: FormData) {
  const parsed = apiKeySchema.safeParse(String(formData.get("apiKey") ?? ""));
  if (!parsed.success) redirect(pluginUrl("error", "Enter a valid Geoapify API key."));

  const { supabase, workspace, user, role } = await requireWorkspace();
  requireAdmin(role);

  const runtime = await getGeoapifyRuntimeStatus(workspace.id);
  if (!runtime.installed) {
    redirect(pluginUrl("error", "Install the Geoapify Lead Discovery plugin before connecting its API key."));
  }

  let valid = false;
  try {
    valid = await validateGeoapifyApiKey(parsed.data);
  } catch {
    valid = false;
  }
  if (!valid) {
    redirect(pluginUrl("error", "Geoapify rejected this key. Check the key and try again."));
  }

  const encrypted = encryptIntegrationSecret(parsed.data);
  const now = new Date().toISOString();
  const { error } = await supabase.from("integration_connections").upsert(
    {
      workspace_id: workspace.id,
      provider: "geoapify",
      status: "connected",
      provider_installation_id: null,
      provider_account_id: "geoapify-api-key",
      provider_account_name: "Geoapify Places",
      provider_account_type: "Encrypted API key",
      access_token_ciphertext: encrypted,
      refresh_token_ciphertext: null,
      token_expires_at: null,
      scopes: ["geocoding", "places", "place_details"],
      selected_assets: [
        { id: "geocoding", name: "Geocoding API" },
        { id: "places", name: "Places API" },
        { id: "place_details", name: "Place Details API" },
      ],
      metadata: {
        auth_type: "api_key",
        secret_storage: "aes-256-gcm",
        purpose: "lead_discovery",
      },
      connected_by: user.id,
      connected_at: now,
      disconnected_at: null,
    },
    { onConflict: "workspace_id,provider" },
  );

  if (error) redirect(pluginUrl("error", "Orbit could not save the Geoapify connection."));
  refresh();
  redirect(pluginUrl("notice", "Geoapify connected. Local lead discovery is enabled."));
}

export async function disconnectGeoapify() {
  const { supabase, workspace, role } = await requireWorkspace();
  requireAdmin(role);

  const { error } = await supabase
    .from("integration_connections")
    .update({
      status: "disconnected",
      access_token_ciphertext: null,
      refresh_token_ciphertext: null,
      token_expires_at: null,
      scopes: [],
      selected_assets: [],
      disconnected_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspace.id)
    .eq("provider", "geoapify");

  if (error) redirect(pluginUrl("error", "Orbit could not disconnect Geoapify."));
  refresh();
  redirect(pluginUrl("notice", "Geoapify disconnected. Local lead discovery is disabled."));
}
