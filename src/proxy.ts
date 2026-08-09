import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const canonicalHost = "orbit-two-delta.vercel.app";
const legacyProductionHosts = new Set([
  "orbit-urava-pros.vercel.app",
  "orbit-git-main-urava-pros.vercel.app",
]);

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase();

  if (
    process.env.NODE_ENV === "production" &&
    host &&
    legacyProductionHosts.has(host)
  ) {
    const destination = request.nextUrl.clone();
    destination.protocol = "https:";
    destination.host = canonicalHost;
    return NextResponse.redirect(destination, 308);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
