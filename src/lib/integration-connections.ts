import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createSign,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type OAuthProvider =
  | "github"
  | "vercel"
  | "google_search_console"
  | "google_analytics"
  | "meta"
  | "linkedin";

export type IntegrationState = {
  v: 1;
  workspaceId: string;
  userId: string;
  provider: OAuthProvider;
  issuedAt: number;
  nonce: string;
};

const STATE_TTL_MS = 10 * 60 * 1000;

function integrationSecret() {
  const value = process.env.INTEGRATION_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new Error(
      "INTEGRATION_SECRET must be an independent 32+ character secret. Database admin credentials are never used as encryption keys.",
    );
  }
  return value;
}

function b64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function fromB64url(value: string) {
  return Buffer.from(value, "base64url");
}

function integrationStateHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function issueIntegrationState(input: Omit<IntegrationState, "v" | "issuedAt" | "nonce">) {
  const payload: IntegrationState = {
    v: 1,
    ...input,
    issuedAt: Date.now(),
    nonce: randomBytes(18).toString("base64url"),
  };
  const encoded = b64url(JSON.stringify(payload));
  const signature = createHmac("sha256", integrationSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyIntegrationState(token: string, expectedProvider: OAuthProvider) {
  if (token.length > 4096) throw new Error("Invalid integration state.");
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Invalid integration state.");
  const [encoded, signature] = parts;
  if (!encoded || !signature) throw new Error("Invalid integration state.");

  const expected = createHmac("sha256", integrationSecret()).update(encoded).digest();
  let supplied: Buffer;
  try {
    supplied = fromB64url(signature);
  } catch {
    throw new Error("Integration state signature is invalid.");
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("Integration state signature is invalid.");
  }

  let payload: IntegrationState;
  try {
    payload = JSON.parse(fromB64url(encoded).toString("utf8")) as IntegrationState;
  } catch {
    throw new Error("Integration state payload is invalid.");
  }
  if (
    payload.v !== 1 ||
    payload.provider !== expectedProvider ||
    typeof payload.workspaceId !== "string" ||
    typeof payload.userId !== "string" ||
    typeof payload.nonce !== "string" ||
    payload.nonce.length < 20 ||
    typeof payload.issuedAt !== "number" ||
    Date.now() - payload.issuedAt > STATE_TTL_MS ||
    payload.issuedAt - Date.now() > 60_000
  ) {
    throw new Error("Integration state is invalid or expired.");
  }

  return payload;
}

export async function registerIntegrationState(
  token: string,
  input: { workspaceId: string; userId: string; provider: OAuthProvider },
) {
  const state = verifyIntegrationState(token, input.provider);
  if (state.workspaceId !== input.workspaceId || state.userId !== input.userId) {
    throw new Error("Integration state identity mismatch.");
  }
  const admin = createAdminClient();
  if (!admin) throw new Error("Orbit integration state service is unavailable.");

  const { error } = await admin.from("integration_oauth_states").insert({
    state_hash: integrationStateHash(token),
    workspace_id: input.workspaceId,
    user_id: input.userId,
    provider: input.provider,
    expires_at: new Date(state.issuedAt + STATE_TTL_MS).toISOString(),
  });
  if (error) throw new Error("Integration state could not be registered.");

  await admin
    .from("integration_oauth_states")
    .delete()
    .lt("expires_at", new Date(Date.now() - STATE_TTL_MS).toISOString());
}

export async function consumeIntegrationState(token: string, state: IntegrationState) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Orbit integration state service is unavailable.");
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("integration_oauth_states")
    .update({ consumed_at: now })
    .eq("state_hash", integrationStateHash(token))
    .eq("workspace_id", state.workspaceId)
    .eq("user_id", state.userId)
    .eq("provider", state.provider)
    .is("consumed_at", null)
    .gt("expires_at", now)
    .select("state_hash")
    .maybeSingle();

  if (error || !data) {
    throw new Error("Integration state was already used, expired, or was not issued by Orbit.");
  }
}

function encryptionKey() {
  return createHash("sha256").update(integrationSecret()).digest();
}

export function encryptIntegrationSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptIntegrationSecret(value: string) {
  const [version, ivText, tagText, ciphertextText] = value.split(".");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText) {
    throw new Error("Unsupported encrypted integration secret.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function orbitBaseUrl() {
  const configured = (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.FOUNDRY_APP_URL ??
    ""
  ).trim();
  if (!configured) {
    if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
    throw new Error("NEXT_PUBLIC_APP_URL is required in production.");
  }

  const url = new URL(configured);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("Production Orbit origin must use HTTPS.");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_APP_URL must be a credential-free origin without a path.");
  }
  return url.origin;
}

export function githubAppReady() {
  return Boolean(
    process.env.GITHUB_APP_SLUG &&
      process.env.GITHUB_APP_ID &&
      process.env.GITHUB_APP_CLIENT_ID &&
      process.env.GITHUB_APP_CLIENT_SECRET &&
      process.env.GITHUB_APP_PRIVATE_KEY,
  );
}

export function vercelIntegrationReady() {
  return Boolean(
    process.env.VERCEL_INTEGRATION_SLUG &&
      process.env.VERCEL_CLIENT_ID &&
      process.env.VERCEL_CLIENT_SECRET,
  );
}

export function oauthProviderReady(provider: Exclude<OAuthProvider, "github" | "vercel">) {
  if (provider === "google_search_console" || provider === "google_analytics") {
    return Boolean(
      (process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID) &&
        (process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET),
    );
  }
  if (provider === "meta") return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
  if (provider === "linkedin") return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
  return false;
}

export function githubInstallUrl(state: string) {
  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug) throw new Error("GitHub App slug is not configured.");
  const url = new URL(`https://github.com/apps/${slug}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

export function vercelInstallUrl(state: string) {
  const slug = process.env.VERCEL_INTEGRATION_SLUG;
  if (!slug) throw new Error("Vercel Integration slug is not configured.");
  const url = new URL(`https://vercel.com/integrations/${slug}/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

export function githubCallbackUrl() {
  return process.env.GITHUB_APP_CALLBACK_URL ?? `${orbitBaseUrl()}/api/integrations/github/callback`;
}

export function vercelCallbackUrl() {
  return process.env.VERCEL_REDIRECT_URI ?? `${orbitBaseUrl()}/api/integrations/vercel/callback`;
}

function normalizePrivateKey(value: string) {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

export function createGitHubAppJwt() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) throw new Error("GitHub App credentials are not configured.");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: appId,
    }),
  );
  const data = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  signer.end();
  const signature = signer.sign(normalizePrivateKey(privateKey)).toString("base64url");
  return `${data}.${signature}`;
}
