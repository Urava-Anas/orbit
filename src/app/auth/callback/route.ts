import { NextResponse } from "next/server";
import { getOrbitAccess, orbitHomePath } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_AUTH_DESTINATIONS = new Set([
  "/reset-password",
  "/onboarding",
  "/trial",
]);

function safeReturnPath(value: string | null, origin: string) {
  if (!value) return null;

  try {
    const destination = new URL(value, origin);
    if (destination.origin !== origin) return null;
    if (!ALLOWED_AUTH_DESTINATIONS.has(destination.pathname)) return null;

    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto") ?? "https";
  const origin =
    process.env.NODE_ENV === "development" || !forwardedHost
      ? url.origin
      : `${forwardedProtocol}://${forwardedHost}`;
  const returnPath = safeReturnPath(url.searchParams.get("next"), origin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (returnPath) {
        return NextResponse.redirect(new URL(returnPath, origin));
      }

      const context = await getOrbitAccess();
      if (context) {
        return NextResponse.redirect(new URL(orbitHomePath(context.access), origin));
      }
    }
  }

  return NextResponse.redirect(
    new URL(
      "/login?error=Authentication%20link%20is%20invalid%20or%20expired",
      origin,
    ),
  );
}
