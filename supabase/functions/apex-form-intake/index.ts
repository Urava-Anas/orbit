import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://apexlogisticsdispatch.com",
  "https://www.apexlogisticsdispatch.com",
]);

function cors(origin: string | null) {
  const safeOrigin = origin && allowedOrigins.has(origin) ? origin : "https://apexlogisticsdispatch.com";
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...headers, "Content-Type": "application/json" } });
  if (!origin || !allowedOrigins.has(origin)) return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers: { ...headers, "Content-Type": "application/json" } });

  try {
    const body = await req.json();
    const fullName = String(body?.name ?? "").trim().slice(0, 120);
    const phone = String(body?.phone ?? "").trim().slice(0, 40);
    const email = String(body?.email ?? "").trim().toLowerCase().slice(0, 180);
    const equipment = String(body?.equipment ?? "").trim().slice(0, 80);
    const fleetSize = String(body?.fleetSize ?? "").trim().slice(0, 80);

    if (!fullName || !phone || !email || !equipment || !fleetSize || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Missing or invalid required fields" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("name", "Apex Logistics & Dispatch")
      .maybeSingle();

    if (workspaceError || !workspace) throw new Error("Apex workspace is not configured");

    const { error } = await supabase.from("apex_online_form_submissions").insert({
      workspace_id: workspace.id,
      form_type: "trial_request",
      source: "website",
      full_name: fullName,
      phone,
      email,
      company: String(body?.company ?? "").trim().slice(0, 160) || null,
      equipment,
      fleet_size: fleetSize,
      preferred_lanes: String(body?.lanes ?? "").trim().slice(0, 240) || null,
      message: String(body?.message ?? "").trim().slice(0, 2000) || null,
      metadata: { page: "homepage_trial", site: "apexlogisticsdispatch.com" },
    });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), { status: 201, headers: { ...headers, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("apex-form-intake", error);
    return new Response(JSON.stringify({ error: "Unable to save request" }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
  }
});
