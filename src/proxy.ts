import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { supabaseUrl } from "@/lib/supabase/config";

function configuredCanonicalHost() {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXT_PUBLIC_APP_URL is required in production.");
    }
    return null;
  }
  return new URL(raw).host.toLowerCase();
}

function contentSecurityPolicy(nonce: string) {
  const supabase = new URL(supabaseUrl);
  const websocketOrigin = `wss://${supabase.host}`;
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabase.origin} ${websocketOrigin}`,
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const canonicalHost = configuredCanonicalHost();
  const host = request.headers.get("host")?.toLowerCase();

  if (process.env.NODE_ENV === "production" && host && canonicalHost && host !== canonicalHost) {
    const isVercelHost = host.endsWith(".vercel.app");
    if (isVercelHost) {
      const destination = request.nextUrl.clone();
      destination.protocol = "https:";
      destination.host = canonicalHost;
      return NextResponse.redirect(destination, 308);
    }
  }

  const nonce = randomBytes(16).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = await updateSession(request, requestHeaders);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
