const reviewedOrbitProductionPublicConfig = Object.freeze({
  url: "https://sjtgydpwsnjwxlwbtpgf.supabase.co",
  publishableKey: "sb_publishable_HeunepQayOGiae88AwzoGw_cy_vTmQa",
});

function isVercelProduction() {
  return process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";
}

function requiredPublicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") {
  const configured = process.env[name]?.trim();
  if (configured) return configured;

  // Supabase project URLs and publishable keys are intentionally public client
  // configuration (web/iOS/Android clients must receive them). Orbit permits the
  // reviewed production pair only inside an explicit Vercel production build.
  // Preview, CI without injected test config, and local development never fall
  // through to production data.
  if (isVercelProduction()) {
    return name === "NEXT_PUBLIC_SUPABASE_URL"
      ? reviewedOrbitProductionPublicConfig.url
      : reviewedOrbitProductionPublicConfig.publishableKey;
  }

  throw new Error(
    `${name} is required outside the reviewed Orbit Vercel production environment. Preview and development builds never fall back to production data.`,
  );
}

export const supabaseUrl = requiredPublicEnv("NEXT_PUBLIC_SUPABASE_URL");
export const supabasePublishableKey = requiredPublicEnv(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
);

try {
  const url = new URL(supabaseUrl);
  const reviewedCloud = url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
  const isolatedCi =
    process.env.CI === "true" &&
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  if (!reviewedCloud && !isolatedCi) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be a reviewed HTTPS Supabase project URL; loopback HTTP is accepted only in CI.",
    );
  }
} catch (error) {
  if (error instanceof Error && error.message.includes("reviewed HTTPS")) throw error;
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is invalid.");
}
