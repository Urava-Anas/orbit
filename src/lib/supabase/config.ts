function requiredPublicEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required. Orbit never falls back to a production database.`);
  }
  return value;
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
