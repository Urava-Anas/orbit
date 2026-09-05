import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ assetId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { assetId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) {
    return NextResponse.json({ error: "Invalid asset." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const { supabase, workspace } = await requireWorkspace();
  const { data: asset, error } = await supabase
    .from("content_assets")
    .select("id,status,storage_bucket,storage_path,mime_type")
    .eq("workspace_id", workspace.id)
    .eq("id", assetId)
    .maybeSingle();
  if (error || !asset || asset.status !== "ready" || !asset.storage_bucket || !asset.storage_path) {
    return NextResponse.json({ error: "Asset is not available for review." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Asset storage is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const { data: file, error: downloadError } = await admin.storage.from(asset.storage_bucket).download(asset.storage_path);
  if (downloadError || !file) {
    return NextResponse.json({ error: "Asset could not be read." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return new Response(await file.arrayBuffer(), {
    status: 200,
    headers: {
      "Content-Type": asset.mime_type || file.type || "application/octet-stream",
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
