const productionUrl = "https://sjtgydpwsnjwxlwbtpgf.supabase.co";
const productionPublishableKey =
  "sb_publishable_HeunepQayOGiae88AwzoGw_cy_vTmQa";

export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || productionUrl;

export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  productionPublishableKey;
