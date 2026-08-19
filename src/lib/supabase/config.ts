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
  if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a reviewed HTTPS Supabase project URL.");
  }
} catch (error) {
  if (error instanceof Error && error.message.includes("reviewed HTTPS")) throw error;
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is invalid.");
}
