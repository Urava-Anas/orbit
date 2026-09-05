import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncConnectedGoogleContentSignals } from "@/lib/content-engine-google-signals";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeMatch(received: string, expected: string) {
  const actual = Buffer.from(received);
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

async function authorize(request: Request, admin: AdminClient) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const secret = header.slice("Bearer ".length).trim();
  if (!secret || secret.length > 512) return false;

  const { data, error } = await admin
    .from("content_worker_auth")
    .select("secret_hash")
    .eq("id", "source_signals")
    .maybeSingle();
  if (error || !data?.secret_hash) return false;
  return safeMatch(sha256(secret), data.secret_hash);
}

async function handle(request: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Content Engine signal database is unavailable." }, { status: 503 });
  if (!(await authorize(request, admin))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const results = await syncConnectedGoogleContentSignals();
    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      authority: "read_only_intelligence",
      checked: results.length,
      inserted: results.filter((result) => result.status === "inserted").length,
      existing: results.filter((result) => result.status === "existing").length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Content Engine source-signal worker failed safely", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Content Engine source-signal worker failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
