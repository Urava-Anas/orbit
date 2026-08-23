import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { supabaseUrl } from "@/lib/supabase/config";

const REVIEWED_ORBIT_PRODUCTION_HOST = "orbit-two-delta.vercel.app";
const REVIEWED_ORBIT_PRODUCTION_ALIASES = new Set([
  REVIEWED_ORBIT_PRODUCTION_HOST,
  "orbit-urava-pros.vercel.app",
  "orbit-git-main-urava-pros.vercel.app",
]);

const CONNECTION_PROVIDERS = new Set([
  "github",
  "vercel",
  "google_search_console",
  "google_analytics",
  "meta",
  "linkedin",
]);

function normalizedHost(value: string | null | undefined) {
  return value?.trim().toLowerCase().split(":")[0] || null;
}

function configuredCanonicalHost(requestHost: string | null) {
  const raw = (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.FOUNDRY_APP_URL ??
    ""
  ).trim();
  if (raw) return new URL(raw).host.toLowerCase();

  const host = normalizedHost(requestHost);
  if (
    process.env.NODE_ENV === "production" &&
    host &&
    REVIEWED_ORBIT_PRODUCTION_ALIASES.has(host)
  ) {
    return REVIEWED_ORBIT_PRODUCTION_HOST;
  }

  // Unknown preview/deployment hosts are not silently redirected into production.
  // They continue with their own injected environment, while the reviewed public
  // Orbit aliases have a deterministic canonical host even when Vercel does not
  // expose NEXT_PUBLIC_APP_URL to the proxy runtime.
  return null;
}

function connectionLauncherRedirect(request: NextRequest) {
  if (request.nextUrl.pathname !== "/dashboard/plugins") return null;
  if (request.nextUrl.searchParams.has("error") || request.nextUrl.searchParams.has("notice")) return null;

  const provider = request.nextUrl.searchParams.get("connect");
  const plugin = request.nextUrl.searchParams.get("plugin");
  if (!provider || plugin !== `app:${provider}` || !CONNECTION_PROVIDERS.has(provider)) return null;

  return NextResponse.redirect(new URL(`/dashboard/plugins/connect/${provider}`, request.url), 307);
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
  const host = request.headers.get("host")?.toLowerCase() ?? null;
  const canonicalHost = configuredCanonicalHost(host);

  if (process.env.NODE_ENV === "production" && host && canonicalHost && host !== canonicalHost) {
    const isVercelHost = host.endsWith(".vercel.app");
    if (isVercelHost) {
      const destination = request.nextUrl.clone();
      destination.protocol = "https:";
      destination.host = canonicalHost;
      return NextResponse.redirect(destination, 308);
    }
  }

  const connectionRedirect = connectionLauncherRedirect(request);
  if (connectionRedirect) return connectionRedirect;

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
