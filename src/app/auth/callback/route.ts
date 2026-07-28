import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNextPath(value: string | null, origin: string) {
  if (!value) return "/dashboard";

  try {
    const destination = new URL(value, origin);
    if (destination.origin !== origin) return "/dashboard";

    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/dashboard";
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
  const next = safeNextPath(url.searchParams.get("next"), origin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(
    new URL(
      "/login?error=Authentication%20link%20is%20invalid%20or%20expired",
      origin,
    ),
  );
}
