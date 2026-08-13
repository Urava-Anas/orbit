import { NextResponse } from "next/server";
import { getOrbitAccess } from "@/lib/access";
import { validateOrbitPluginManifest } from "@/lib/plugins/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ ok: false, error: "origin_rejected" }, { status: 403 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 170 * 1024) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }
  const accessContext = await getOrbitAccess();
  if (!accessContext?.access.workspace || accessContext.access.accountRole !== "founder") {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const validation = validateOrbitPluginManifest(payload);
  return NextResponse.json(validation, {
    status: validation.ok ? 200 : 422,
    headers: { "Cache-Control": "no-store" },
  });
}
